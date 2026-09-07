# API Testing Guide (Postman)

Everything needed to exercise the full REST API by hand: base URLs, auth headers, exact request bodies,
and the order to run requests in so each one has the IDs it depends on.

## 0. Prerequisites

- Backend running: `cd backend && npm run dev` (API on `http://localhost:5000`).
- Worker running (only needed once you actually upload audio): `cd backend && npm run worker`.
- ML service running (only needed for real preprocessing): `cd ml-service && uvicorn app.main:app --port 8000`.
- Mongo + Redis running (local or `docker compose up mongo redis`).
- A bootstrapped Super Admin — see §2.

You don't need the worker or ML service running to test auth/users/projects/annotations — only
`POST /api/tasks` (audio upload) touches the queue, and even that endpoint returns immediately regardless
of whether a worker is consuming the job. See §7 for how to test the annotation flow without waiting on
real ML inference.

## 1. Postman environment

Create a Postman environment with these variables (fill in as you go — each numbered step in §3 says
which variable to save its response into):

| Variable | Initial value |
|---|---|
| `baseUrl` | `http://localhost:5000` |
| `adminAccessToken` | *(from §3.2)* |
| `annotatorAccessToken` | *(from §3.7)* |
| `reviewerAccessToken` | *(from §3.7)* |
| `refreshToken` | *(from §3.2)* |
| `pendingUserId` | *(from §3.1)* |
| `annotatorUserId` | *(from §3.7)* |
| `reviewerUserId` | *(from §3.7)* |
| `projectId` | *(from §3.4)* |
| `taskId` | *(from §3.6)* |
| `datasetId` | *(from §3.6)* |
| `annotationId` | *(from §3.9)* |
| `reviewId` | *(from §3.10)* |
| `internalSecret` | same value as `INTERNAL_SERVICE_SECRET` in `backend/.env` |

Every authenticated request uses header:

```
Authorization: Bearer {{adminAccessToken}}
```

(swap in whichever token is the right actor for that request — see each step).

## 2. Bootstrap the first Super Admin

There's no API route for this on purpose — registration always creates `pending`/`annotator`, and
approving/promoting requires an existing Admin/Super Admin. Run once, from `backend/`:

```bash
npm run seed:admin -- --email=admin@example.com --password=changeme123 --name="Site Admin"
```

Then log in as that user (§3.2) to get `adminAccessToken`.

## 3. Step-by-step flow

### 3.1 Register a new (pending) user

```
POST {{baseUrl}}/api/auth/register
Content-Type: application/json
```
```json
{
  "name": "Alice Annotator",
  "email": "alice@example.com",
  "password": "password123"
}
```
Expect `201`, `user.status: "pending"`, `user.role: "annotator"`. Save `user.id` → `pendingUserId`.

### 3.2 Log in as the Super Admin

```
POST {{baseUrl}}/api/auth/login
Content-Type: application/json
```
```json
{
  "email": "admin@example.com",
  "password": "changeme123"
}
```
Expect `200` with `accessToken`, `refreshToken`, `user`. Save `accessToken` → `adminAccessToken`,
`refreshToken` → `refreshToken`.

### 3.3 Approve the pending user

```
POST {{baseUrl}}/api/users/{{pendingUserId}}/approve
Authorization: Bearer {{adminAccessToken}}
```
No body. Expect `200`, `user.status: "approved"`.

Repeat §3.1 + §3.3 for a second user you'll use as a Reviewer (e.g. `bob@example.com`) — you'll promote
one of these two to `reviewer` in §3.7.

### 3.4 Create a project

```
POST {{baseUrl}}/api/projects
Authorization: Bearer {{adminAccessToken}}
Content-Type: application/json
```
```json
{
  "name": "Hindi Interviews Batch 1",
  "description": "Pilot batch for RSML annotation",
  "language": "hi"
}
```
Expect `201`. The creating admin is auto-added as a `projectRole: "admin"` member. Save `project._id` →
`projectId`.

### 3.5 Add Alice and Bob as project members

```
POST {{baseUrl}}/api/projects/{{projectId}}/members
Authorization: Bearer {{adminAccessToken}}
Content-Type: application/json
```
```json
{
  "userId": "{{annotatorUserId}}",
  "projectRole": "annotator"
}
```
Repeat with Bob's user id and `"projectRole": "reviewer"`. (You need each user's `_id` — either capture
it from §3.1's response or `GET /api/users` as the admin.)

### 3.6 Upload a single audio file (creates Task + Dataset)

This one is **multipart/form-data**, not JSON. In Postman: Body → `form-data`.

```
POST {{baseUrl}}/api/tasks?projectId={{projectId}}
Authorization: Bearer {{adminAccessToken}}
```

| Key | Type | Value |
|---|---|---|
| `audio` | File | pick a short local audio file (wav/mp3/m4a/flac/ogg) |
| `language` | Text | `hi` |
| `speakerLabel` | Text | *(optional)* |
| `storageProvider` | Text | *(optional)* `cloudinary` or `local` — omit to use the server's default |

Expect `201`:
```json
{
  "task": { "_id": "...", "audioUrl": "https://res.cloudinary.com/...", "status": "unassigned", "dataset": "...", ... },
  "dataset": { "_id": "...", "processing": { "status": "pending", "progress": 0 }, "originalAudio": { "provider": "cloudinary", ... }, ... }
}
```
Save `task._id` → `taskId`, `dataset._id` → `datasetId`. This returns immediately — preprocessing runs in
the background (see §7 to check/skip waiting on it). With `storageProvider: "local"`, `task.audioUrl`
instead looks like `http://localhost:5000/uploads/projects/<id>/audio/<uuid>.wav` — a real file under
`backend/storage/audio/` (or wherever `LOCAL_STORAGE_ROOT` points), servable with no auth, same as a
Cloudinary URL would be.

### 3.7 Assign the task, and promote Bob to Reviewer

```
PATCH {{baseUrl}}/api/users/{{reviewerUserId}}/role
Authorization: Bearer {{adminAccessToken}}
Content-Type: application/json
```
```json
{ "role": "reviewer" }
```
(This sets Bob's *global* role. He was already added with `projectRole: "reviewer"` in §3.5, which is
what actually gates his project actions — the global role mainly affects his default role on new project
memberships elsewhere.)

Then assign the task:
```
PATCH {{baseUrl}}/api/tasks/{{taskId}}/assign
Authorization: Bearer {{adminAccessToken}}
Content-Type: application/json
```
```json
{
  "assignedAnnotator": "{{annotatorUserId}}",
  "assignedReviewer": "{{reviewerUserId}}"
}
```

Now log in as Alice and Bob to get their tokens (§3.2's request, different credentials) → save into
`annotatorAccessToken` / `reviewerAccessToken`.

### 3.8 Check preprocessing status

```
GET {{baseUrl}}/api/tasks/{{taskId}}
Authorization: Bearer {{annotatorAccessToken}}
```
Watch `dataset.processing.status` go `pending → processing → music_removal → binary_segmentation →
speaker_diarization → transcription → completed` (or `failed`, with `processing.error` set). See §7 if
you don't want to wait on real model inference.

### 3.9 Annotator opens a draft, edits, submits

Opening a draft is **blocked with `409`** until `dataset.processing.status === "completed"`.

```
POST {{baseUrl}}/api/annotations
Authorization: Bearer {{annotatorAccessToken}}
Content-Type: application/json
```
```json
{
  "taskId": "{{taskId}}",
  "type": "annotation"
}
```
Expect `201`. `annotation.rsmlText` is pre-filled from the task's (ML-drafted, or blank if you skipped
preprocessing) `rsmlTextOriginal`. Save `annotation._id` → `annotationId`.

Edit it:
```
PATCH {{baseUrl}}/api/annotations/{{annotationId}}
Authorization: Bearer {{annotatorAccessToken}}
Content-Type: application/json
```
```json
{ "rsmlText": "<span-start>namaste</span-end> aap kaise hain" }
```

Submit it:
```
POST {{baseUrl}}/api/annotations/{{annotationId}}/submit
Authorization: Bearer {{annotatorAccessToken}}
```
No body. Expect `200`, `annotation.status: "submitted"`. Task status rolls to `annotated`.

### 3.10 Reviewer opens a review, submits a verdict

```
POST {{baseUrl}}/api/annotations
Authorization: Bearer {{reviewerAccessToken}}
Content-Type: application/json
```
```json
{
  "taskId": "{{taskId}}",
  "type": "review",
  "parentAnnotation": "{{annotationId}}"
}
```
Expect `201`. Save `annotation._id` → `reviewId`.

```
POST {{baseUrl}}/api/annotations/{{reviewId}}/review
Authorization: Bearer {{reviewerAccessToken}}
Content-Type: application/json
```
```json
{
  "decision": "accept",
  "reviewComment": "Looks good"
}
```
`decision` is one of `accept` | `reject` | `to_correct`. Expect `200`,
`review.status`/`parentAnnotation.status` set accordingly, and (for `accept`/`reject`) `task.status`
rolled to `accepted`/`rejected`. `to_correct` instead reopens the parent annotation to `draft` and the
task to `annotation_in_progress` — the Annotator can `PATCH` it again.

### 3.11 Export the accepted corpus

```
GET {{baseUrl}}/api/projects/{{projectId}}/export?format=csv
Authorization: Bearer {{adminAccessToken}}
```
Use `?format=json` for a JSON body instead of a CSV file download.

### 3.12 Download the ML transcript as an SRT file

Any project member can pull the machine-generated transcript (not the human RSML annotation) for one
task as a subtitle file, once preprocessing has completed:

```
GET {{baseUrl}}/api/tasks/{{taskId}}/export/srt
Authorization: Bearer {{annotatorAccessToken}}
```

Expect `200`, `Content-Type: application/x-subrip`, a `.srt` file download. Each cue carries everything
the pipeline produced for that segment — not just the text:
```
1
00:00:02,300 --> 00:00:08,750
Speaker: SPEAKER_00 | Overlapping: SPEAKER_01 | Language: hi | Model: whisper | Confidence: 0.91
नमस्ते आप कैसे हैं

2
00:00:09,000 --> 00:00:14,200
Speaker: SPEAKER_01 | Language: hi | Model: whisper
मैं ठीक हूं
```
The metadata line only lists fields that were actually available (e.g. `Confidence` is omitted rather
than printed as empty when a provider didn't return one) — extra lines per cue are valid SRT, so this
still opens correctly in any standard player while remaining fully parseable by downstream tooling.
`409` if `dataset.processing.status` isn't `completed` yet; `404` if there are no transcript segments.

## 4. Auth token lifecycle

**Refresh** (rotates the refresh token — the old one is revoked):
```
POST {{baseUrl}}/api/auth/refresh-token
Content-Type: application/json
```
```json
{ "refreshToken": "{{refreshToken}}" }
```
Save the new `accessToken`/`refreshToken` back into your variables.

**Logout:**
```
POST {{baseUrl}}/api/auth/logout
Authorization: Bearer {{adminAccessToken}}
Content-Type: application/json
```
```json
{ "refreshToken": "{{refreshToken}}" }
```
Expect `204`.

## 5. User management (Admin/Super Admin only)

```
GET {{baseUrl}}/api/users                      # everyone (Admin: excludes other Admins/Super Admins)
GET {{baseUrl}}/api/users/pending
POST {{baseUrl}}/api/users/{{userId}}/approve
POST {{baseUrl}}/api/users/{{userId}}/reject
PATCH {{baseUrl}}/api/users/{{userId}}/deactivate
PATCH {{baseUrl}}/api/users/{{userId}}/reactivate
```
All with `Authorization: Bearer {{adminAccessToken}}`, no body except:
```
PATCH {{baseUrl}}/api/users/{{userId}}/role     # Super Admin only
```
```json
{ "role": "reviewer" }
```
(`role` is one of `super_admin` | `admin` | `reviewer` | `annotator`.)

Self-service (any authenticated user, own token):
```
GET {{baseUrl}}/api/users/me
PATCH {{baseUrl}}/api/users/me                  { "name": "New Name" }
PATCH {{baseUrl}}/api/users/me/password         { "currentPassword": "...", "newPassword": "..." }
```

## 6. Project management extras

```
PATCH {{baseUrl}}/api/projects/{{projectId}}
```
```json
{ "name": "Renamed", "description": "Updated", "status": "archived" }
```
(all fields optional; `status` is `active` | `archived`)

```
PATCH {{baseUrl}}/api/projects/{{projectId}}/members/{{annotatorUserId}}
```
```json
{ "projectRole": "reviewer" }
```

```
DELETE {{baseUrl}}/api/projects/{{projectId}}/members/{{annotatorUserId}}
DELETE {{baseUrl}}/api/projects/{{projectId}}
```
No body on either. `DELETE /:id` cascades — deletes the project's Tasks, Datasets, and Annotations too.

```
GET {{baseUrl}}/api/projects/{{projectId}}/tasks?status=unassigned&assignedTo={{annotatorUserId}}
```
`status` and `assignedTo` are both optional filters.

## 7. Testing the annotation flow without running real ML inference

Running Demucs/pyannote/Whisper for real is slow and needs model downloads + a Hugging Face token. To
unblock annotation testing without any of that, simulate the ML service's own callback directly — this is
exactly what `ml-service` posts to internally, so it exercises the same code path:

```
POST {{baseUrl}}/api/internal/datasets/{{datasetId}}/stage
X-Internal-Secret: {{internalSecret}}
Content-Type: application/json
```
```json
{
  "stage": "transcription",
  "progress": 90,
  "modelUsed": "whisper",
  "transcriptSegments": [
    { "startTime": 0, "endTime": 2.3, "isSpeech": false, "speaker": null, "overlappingSpeakers": [], "language": null, "text": "", "transcriptionModel": null, "confidence": null },
    { "startTime": 2.3, "endTime": 8.7, "isSpeech": true, "speaker": "SPEAKER_00", "overlappingSpeakers": [], "language": "hi", "text": "namaste aap kaise hain", "transcriptionModel": "whisper", "confidence": 0.91 }
  ]
}
```
Then finish it:
```json
{ "stage": "completed", "progress": 100 }
```
(same URL/headers). This sets `dataset.processing.status = "completed"` and auto-seeds
`task.rsmlTextOriginal` from the transcript text — unblocking §3.9. Note: this route is **not** for
browser/Postman-as-a-client use in production — it's guarded by `X-Internal-Secret`, not a user JWT,
because it's meant to be called only by the ML service.

To instead simulate a failure:
```json
{ "stage": "failed", "error": "[music_removal] Demucs failed" }
```

## 8. Quick reference — every route

`Authorization: Bearer <token>` required on all routes below except where marked **Public**. Beyond
authentication, every route except `/api/auth/*` and `/api/internal/*` also requires the caller's account
`status === "approved"`.

| Method | Path | Auth / role | Body | Expected outcome |
|---|---|---|---|---|
| GET | `/ping` | Public | — | `200`, body `pong` (plain text) — bare liveness check |
| GET | `/health` | Public | — | `200`, `{status: "ok"}` |
| POST | `/api/auth/register` | Public | `{name, email, password}` | `201`, user created with `status: "pending"`, `role: "annotator"` |
| POST | `/api/auth/login` | Public | `{email, password}` | `200`, `{accessToken, refreshToken, user}`; `401` on bad credentials |
| POST | `/api/auth/refresh-token` | Public | `{refreshToken}` | `200`, new `{accessToken, refreshToken}`; old refresh token revoked; `401` if reused/expired |
| POST | `/api/auth/logout` | Self | `{refreshToken}` (optional) | `204`, refresh token revoked |
| GET | `/api/users/me` | Self | — | `200`, own user record |
| PATCH | `/api/users/me` | Self | `{name?}` | `200`, updated user record |
| PATCH | `/api/users/me/password` | Self | `{currentPassword, newPassword}` | `204`; `401` if `currentPassword` wrong |
| GET | `/api/users` | Admin/Super Admin | — | `200`, user list (Admin doesn't see other Admins/Super Admins) |
| GET | `/api/users/pending` | Admin/Super Admin | — | `200`, users with `status: "pending"` |
| POST | `/api/users/:id/approve` | Admin/Super Admin | — | `200`, `status: "approved"`, `approvedBy` set |
| POST | `/api/users/:id/reject` | Admin/Super Admin | — | `200`, `status: "rejected"` |
| PATCH | `/api/users/:id/deactivate` | Admin/Super Admin | — | `200`, `status: "deactivated"` — login now blocked |
| PATCH | `/api/users/:id/reactivate` | Admin/Super Admin | — | `200`, `status: "approved"` |
| PATCH | `/api/users/:id/role` | Super Admin | `{role}` | `200`, `role` updated; `403` if caller isn't Super Admin |
| POST | `/api/projects` | Admin/Super Admin | `{name, description?, language?}` | `201`, project created, creator auto-added as `projectRole: "admin"` |
| GET | `/api/projects` | Any approved user | — | `200`, projects the caller is a member of (all, for Super Admin) |
| GET | `/api/projects/:id` | Project member/Super Admin | — | `200`, project + member list; `403` if not a member |
| PATCH | `/api/projects/:id` | Project Admin/Super Admin | `{name?, description?, status?}` | `200`, updated project |
| DELETE | `/api/projects/:id` | Project Admin/Super Admin | — | `204`; cascades — deletes its Tasks, Datasets, Annotations too |
| POST | `/api/projects/:id/members` | Project Admin/Super Admin | `{userId, projectRole}` | `201`, member added; `409` if already a member |
| PATCH | `/api/projects/:id/members/:userId` | Project Admin/Super Admin | `{projectRole}` | `200`, member's `projectRole` updated |
| DELETE | `/api/projects/:id/members/:userId` | Project Admin/Super Admin | — | `204`, member removed |
| GET | `/api/projects/:id/tasks` | Project member/Super Admin | query: `status?, assignedTo?` | `200`, filtered task list |
| GET | `/api/projects/:id/export` | Project Admin/Super Admin | query: `format=csv\|json` | `200`, CSV file download or JSON body of accepted tasks |
| POST | `/api/tasks?projectId=` | Project Admin/Super Admin | multipart: `audio` (file), `language?`, `speakerLabel?`, `storageProvider?` (`cloudinary`\|`local`) | `201`, `{task, dataset}` — `dataset.processing.status: "pending"`; job enqueued; `400` if no file attached or an invalid `storageProvider` |
| GET | `/api/tasks` | Project member/Super Admin | query: `projectId, status?, assignedTo?` | `200`, filtered task list |
| GET | `/api/tasks/:id` | Project member/Super Admin | — | `200`, `{task, dataset}` |
| PATCH | `/api/tasks/:id/assign` | Project Admin/Super Admin | `{assignedAnnotator?, assignedReviewer?}` | `200`, updated task; `400` if the user's `projectRole` doesn't fit or reviewer===annotator |
| GET | `/api/tasks/:id/annotations` | Project member/Super Admin | — | `200`, full annotation + review trail |
| GET | `/api/tasks/:id/export/srt` | Project member/Super Admin | — | `200`, `.srt` file (speaker/language/model/confidence per cue); `409` if Dataset isn't `completed`; `404` if no transcript segments |
| DELETE | `/api/tasks/:id` | Project Admin/Super Admin | — | `204`; deletes the task, its Dataset, its Annotations, its stored audio (whichever provider), and any queued processing job |
| POST | `/api/annotations` | Assigned Annotator/Reviewer | `{taskId, type, parentAnnotation?}` | `201`, draft created (`rsmlText` pre-filled from `task.rsmlTextOriginal` for `type: "annotation"`); `409` if Dataset isn't `completed` yet |
| GET | `/api/annotations/:id` | Owner/project member/Super Admin | — | `200`, annotation incl. `editHistory` |
| PATCH | `/api/annotations/:id` | Owner, draft only | `{rsmlText}` | `200`, updated; previous text pushed onto `editHistory`; `409` if not `draft` |
| POST | `/api/annotations/:id/submit` | Owner, draft only | — | `200`, `status: "submitted"`; task rolls to `annotated` |
| POST | `/api/annotations/:id/review` | Assigned Reviewer/Project Admin/Super Admin | `{decision, reviewComment?}` | `200`, `{review, parentAnnotation}`; task rolls to `accepted`/`rejected`/back to `annotation_in_progress` (`to_correct`) |
| POST | `/api/internal/datasets/:datasetId/stage` | `X-Internal-Secret` header, not a user token | `{stage, progress?, error?, modelUsed?, ...}` | `204`; `401` if secret header is missing/wrong |

## 9. Common error responses

| Status | Meaning |
|---|---|
| `400` | Validation failed (bad/missing body field) — see `details` in the response |
| `401` | Missing/invalid/expired token, wrong password, or (on `/api/internal/*`) wrong `X-Internal-Secret` |
| `403` | Authenticated, but not allowed (wrong role, not a project member, account not `approved`, reviewing your own annotation, etc.) |
| `404` | Resource doesn't exist |
| `409` | Valid request, wrong state (duplicate email, annotation already submitted, dataset not `completed` yet, re-reviewing a finished review) |
