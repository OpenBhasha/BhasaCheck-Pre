# RSML Annotation Platform

A MERN annotator/reviewer platform (Shoonya-style) for RSML-tagged speech transcripts, with an optional
Python ML preprocessing pipeline that auto-drafts a transcript for a freshly uploaded audio file before a
human Annotator takes over.

**New here?** [MANAGE.md](MANAGE.md) is the condensed, task-oriented guide — full local setup plus a
step-by-step admin walkthrough of every feature. This README is the detailed architecture/per-service
reference; [API_TESTING.md](API_TESTING.md) is the raw-HTTP/Postman version.

**Quick start** — once each service's one-time setup below is done (§2 backend deps, §5 Cloudinary or
local storage, §6 ML service `.venv`, §13 frontend deps), start everything with one command:

```bash
./scripts/dev-up.sh          # Redis, ML service, backend API, worker, frontend
./scripts/dev-up.sh --logs   # same, then tail every service's log together
./scripts/dev-down.sh        # stop everything it started
```

It only starts what isn't already running (checked by port and by process, so re-running it — or having
some services already up in other terminals — is safe, nothing gets duplicated) and never touches a
service it didn't start itself. Logs land in `.dev-logs/`, PIDs in `.dev-pids/` (both gitignored). See §9
for the manual per-terminal version and what to actually do once it's up.

## 1. Architecture

```
React 18 + Vite (frontend/)
        │
        ▼
Node.js / Express / TypeScript API  ───────►  MongoDB (Mongoose)
        │                                       Users, Projects, Tasks,
        │                                       Annotations, Datasets
        ├──► Cloudinary (audio bytes; Mongo only ever stores URLs)
        │
        └──► BullMQ (Redis) ──► Node worker ──► Python ML service (FastAPI, HTTP)
                                                        │
                                          Demucs → Silero VAD → pyannote.audio
                                              → FFmpeg segment cutting
                                              → Whisper / IndicConformer / NeMo
                                                        │
                                          stage-by-stage callbacks back into
                                          Node's /api/internal routes, which
                                          persist everything into `Dataset`
```

Node is the only writer to MongoDB. The BullMQ worker calls the Python service and the Python service
reports progress back to Node's internal API as each stage finishes — Python never touches Mongo directly.

Two roles for `Task` vs `Dataset`:
- **Task** (`User → Project → Task → Annotation`, per the system design) is the annotation/review unit:
  audio URL, the editable `rsmlTextOriginal`, assignment, status.
- **Dataset** (one per Task) holds everything the ML pipeline produced: original/processed audio refs,
  binary speech segments, speaker diarization segments, the combined transcript segments, and processing
  status/progress/error. `Task.rsmlTextOriginal` is auto-seeded from the Dataset's transcript once
  preprocessing completes, but the two collections are kept separate — preprocessing output is never
  silently discarded or conflated with the human annotation record.

Audio upload is single-file (`POST /api/tasks`, multipart). There is no CSV/bulk-upload path in this
build.

## 2. Backend setup (Node)

```bash
cd backend
npm install
cp .env.example .env   # backend/.env — separate from ml-service's own .env, see §6
npm run dev             # API on :5000
npm run worker           # separate process — the BullMQ audio-processing worker
```

Bootstrap the first Super Admin (registration always creates `pending`/`annotator`, and approving or
promoting a user requires an existing Admin/Super Admin — so the very first account has to be created
directly against the database):

```bash
npm run seed:admin -- --email=admin@example.com --password=changeme123 --name="Site Admin"
```

Run tests (Jest + supertest + an in-memory MongoDB, no real Mongo/Redis/Cloudinary/ML service needed):

```bash
npm test
```

## 3. MongoDB setup

Local: `mongod` on `mongodb://localhost:27017/rsml`, or MongoDB Atlas free M0 tier — either works, just
point `MONGODB_URI` at it. `docker-compose.yml` runs one for you.

## 4. Redis setup

Local Redis (`redis://localhost:6379`) or the `redis` service in `docker-compose.yml`. Used only for
BullMQ job queuing — MongoDB remains the source of truth for all persisted application data.

## 5. Cloudinary setup (and the local-disk alternative)

Audio storage is pluggable (`backend/src/services/storage/` — `CloudinaryStorageProvider` /
`LocalStorageProvider`, chosen per upload, not a fixed global setting):

- **Cloudinary**: create a free account, then set `CLOUDINARY_CLOUD_NAME` / `CLOUDINARY_API_KEY` /
  `CLOUDINARY_API_SECRET` **in both `backend/.env` and `ml-service/.env`** — Node uploads the original
  audio, the ML service downloads it and uploads the processed track back, so both need the same
  account. Audio is uploaded under Cloudinary's `video` resource type (Cloudinary has no distinct
  "audio" resource type — `video` is what accepts and streams audio files).
- **Local disk**: no external account needed. Files land under `LOCAL_STORAGE_ROOT`
  (`backend/.env`, default `./storage/audio`) and are served back out at
  `<PUBLIC_BASE_URL>/uploads/<path>` via the `/uploads` static route in `app.ts` — the same
  "public but unguessable path" security model a Cloudinary URL already has, not authenticated.
  `PUBLIC_BASE_URL` must be the address the browser (and, if using docker-compose, the ml-service
  container) actually reaches this server at; see the comment on it in `docker-compose.yml` for why
  local storage doesn't cleanly cross container boundaries there.

A client picks per upload via the `storageProvider` field (`"cloudinary" | "local"`) on
`POST /api/tasks`; omitting it uses `DEFAULT_AUDIO_STORAGE_PROVIDER`, which itself defaults to
`cloudinary` if `CLOUDINARY_CLOUD_NAME` is set, else `local` — so the app works with zero external
setup out of the box. Never commit real Cloudinary credentials; `.env` is gitignored in both
directories, and so is `backend/storage/` (the local-disk default).

## 6. ML service setup (Python)

Node and the ML service each have their own `.env` — the two processes need different variables (Node:
`MONGODB_URI`, `JWT_SECRET`, ...; ML service: `WHISPER_MODEL`, `PYANNOTE_PIPELINE`, `ML_DEVICE`, ...) and
only overlap on the values that must literally match between them: `INTERNAL_SERVICE_SECRET` and the
Cloudinary credentials (see §5).

```bash
cd ml-service
cp .env.example .env   # ml-service/.env — separate from backend's own .env
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
# Optional, only if you're using IndicConformer or NeMo:
pip install -r requirements-nemo.txt

uvicorn app.main:app --host 0.0.0.0 --port 8000
```

Requires `ffmpeg`/`ffprobe` on PATH (`apt install ffmpeg`, `brew install ffmpeg`, ...).

Run the Python unit tests (model inference is mocked — no GPU or downloaded weights required):

```bash
pip install -r requirements-dev.txt
pytest
```

### Model installation

- **Demucs** — installed via `requirements.txt` (`demucs` package); the two-stem vocal-separation model
  (`htdemucs` by default) downloads automatically on first use.
- **Silero VAD** — loaded via `torch.hub` on first use (no separate download step).
- **pyannote.audio** — `Pipeline.from_pretrained("pyannote/speaker-diarization-community-1")` requires a
  Hugging Face account that has accepted that pipeline's (and its dependency models') gated terms, and a
  `HUGGINGFACE_TOKEN` with read access.
- **Whisper** — installed via `requirements.txt` (`openai-whisper`); model weights (`small` by default,
  set via `WHISPER_MODEL`) download automatically on first use.
- **IndicConformer** — requires a local `.nemo` checkpoint from AI4Bharat, path set via
  `INDIC_CONFORMER_MODEL_PATH`. Not loaded at all unless that variable is set — Hindi/Telugu transcription
  falls back to Whisper otherwise.
- **NVIDIA NeMo** — requires `requirements-nemo.txt` plus a model set via `NEMO_MODEL_PATH` (a local
  `.nemo` path, or a pretrained model name resolved via `ASRModel.from_pretrained`). Not routed to for any
  language by default; wire it in by adjusting `_pick_transcription_provider` in
  `app/pipelines/audio_pipeline.py` for a deployment that specifically wants it.

## 7. Model licenses

Verified as of this writing — re-check before any production deployment, licenses and model cards change:

| Component | Code license | Weights / pretrained model | Notes |
|---|---|---|---|
| Demucs | MIT | MIT (Meta/Facebook Research) | Music source separation is not guaranteed to cleanly remove every kind of background music from speech; the pipeline falls back to unseparated audio rather than failing the whole run if Demucs errors. |
| Silero VAD | MIT | MIT | |
| pyannote.audio | MIT (toolkit) | The `speaker-diarization-community-1` pipeline and the models it composes (segmentation, embedding) are gated on Hugging Face — each has its own model card terms that must be accepted and reviewed independently. MIT toolkit license does **not** automatically extend to every pretrained weight. |
| Whisper | MIT | MIT (OpenAI) | Both code and released weights are MIT. |
| IndicConformer | Apache-2.0 (AI4Bharat code) | Check the specific released checkpoint's license before production use — not verified here. | Not loaded unless a checkpoint path is configured. |
| NVIDIA NeMo | Apache-2.0 (toolkit) | Check the specific model's license (NGC/Hugging Face) before production use — not verified here. | Not routed to by default. |

## 8. Running everything with Docker Compose

```bash
cp backend/.env.example backend/.env
cp ml-service/.env.example ml-service/.env
# fill in Cloudinary credentials in both, HUGGINGFACE_TOKEN in ml-service/.env,
# and a matching INTERNAL_SERVICE_SECRET in both, at minimum
docker compose up --build
```

Starts `mongo`, `redis`, `ml-service` (FastAPI on :8000), `backend` (API on :5000), and `worker` (the
BullMQ consumer, same image as `backend`, different entrypoint). Cloudinary stays external — there's no
local substitute for it here.

## 9. Manually verifying the end-to-end pipeline

1. `npm run seed:admin -- --email=admin@example.com --password=changeme123` (see §2).
2. `POST /api/auth/login` as that admin.
3. `POST /api/projects` to create a project (admin becomes its `projectRole: admin` member).
4. `POST /api/tasks?projectId=<id>` — multipart, field `audio` — with a short real audio file. Returns a
   `Task` and a `Dataset` with `processing.status: "pending"` immediately; the ML pipeline runs in the
   background.
5. Poll `GET /api/tasks/:id` — watch `dataset.processing.status` move through
   `processing → music_removal → binary_segmentation → speaker_diarization → transcription → completed`
   (or `failed`, with `processing.error` set, if a stage errors).
6. Once `completed`, `task.rsmlTextOriginal` is auto-seeded from the transcript.
7. `PATCH /api/projects/:id/members` to add an Annotator/Reviewer, `PATCH /api/tasks/:id/assign` to assign
   them to the task.
8. As the Annotator: `POST /api/annotations {taskId, type:"annotation"}` (rejected with `409` until step 5
   reaches `completed`) → `PATCH /api/annotations/:id` to edit → `POST /api/annotations/:id/submit`.
9. As the Reviewer: `POST /api/annotations {taskId, type:"review", parentAnnotation}` →
   `POST /api/annotations/:id/review {decision: "accept"}`.
10. `GET /api/projects/:id/export?format=csv` to pull the accepted corpus.

## 10. API overview

All routes require `Authorization: Bearer <accessToken>` unless noted, and (beyond authentication) require
`status === 'approved'`.

- `POST /api/auth/register|login|refresh-token|logout`
- `GET/PATCH /api/users/me`, `PATCH /api/users/me/password`
- `GET /api/users`, `GET /api/users/pending`, `POST /api/users/:id/approve|reject`,
  `PATCH /api/users/:id/deactivate|reactivate|role` — Admin/Super Admin
- `POST/GET /api/projects`, `GET/PATCH/DELETE /api/projects/:id`,
  `POST/PATCH/DELETE /api/projects/:id/members[/:userId]`, `GET /api/projects/:id/tasks|export`
- `POST /api/tasks?projectId=` (multipart `audio` + optional `storageProvider: "cloudinary"|"local"` —
  single-file upload, creates Task + Dataset + enqueues the ML job), `GET /api/tasks`,
  `GET /api/tasks/:id`, `PATCH /api/tasks/:id/assign`, `GET /api/tasks/:id/annotations`,
  `GET /api/tasks/:id/export/srt` (downloads the ML transcript as a subtitle file — speaker,
  overlap, language, model, and confidence per cue, wherever the pipeline produced them),
  `DELETE /api/tasks/:id` (also removes its audio, Dataset, and Annotations)
- `POST/GET/PATCH /api/annotations[/:id]`, `POST /api/annotations/:id/submit|review`
- `POST /api/internal/datasets/:datasetId/stage` — **internal only**, called by the Python ML service,
  guarded by the `X-Internal-Secret` header (shared `INTERNAL_SERVICE_SECRET`), never called by a browser
  client.

See the system design for the full permissions table (per-role, per-route).

## 11. Environment variables

Each service has its own example file — `backend/.env.example` and `ml-service/.env.example` — with
inline comments on what's overridden automatically inside `docker-compose.yml`. They only overlap on
`INTERNAL_SERVICE_SECRET` and the Cloudinary credentials, which must be set identically in both (see §5).

## 12. Troubleshooting

- **`ffprobe`/`ffmpeg` not found (Node)** — audio metadata (duration/sample rate/channels) silently comes
  back `null` rather than failing the upload; install ffmpeg to get real metadata.
- **pyannote pipeline fails to load** — almost always a missing/invalid `HUGGINGFACE_TOKEN` or not having
  accepted the pipeline's gated terms on Hugging Face.
- **Dataset stuck in `processing`** — check the worker process logs (`npm run worker` / the `worker`
  compose service) and the ML service logs; a crashed/never-started worker means jobs sit queued in Redis
  indefinitely.
- **`Dataset.processing.status: "failed"`** — see `processing.error`; BullMQ retries the job (3 attempts,
  exponential backoff) before this becomes final.
- **IndicConformer/NeMo silently not used** — expected unless `INDIC_CONFORMER_MODEL_PATH` /
  `NEMO_MODEL_PATH` are set; Hindi/Telugu falls back to Whisper otherwise (see §6).

## 13. Frontend setup (React)

```bash
cd frontend
npm install
cp .env.example .env   # frontend/.env — just VITE_API_BASE_URL
npm run dev             # http://localhost:5173
```

Plain React 18 + Vite + TypeScript + React Router, hand-rolled CSS (no component library) in a simple
blue/white theme — see `src/index.css`. Axios (`src/api/client.ts`) attaches the JWT to every request and
transparently refreshes it on a `401` (rotating the refresh token), redirecting to `/login` only when the
session is genuinely gone — not on the anonymous `401` every guest gets from the initial `GET /users/me`
check, which would otherwise loop.

Routes mirror the system design's frontend route table (`/login`, `/register`, `/pending-approval`,
`/dashboard`, `/projects`, `/projects/new`, `/projects/:id` — with Tasks/Members/Settings as tabs rather
than separate routes — `/tasks/:id/annotate`, `/tasks/:id/review`, `/admin/users`, `/profile`).
`ProtectedRoute` (`src/components/ProtectedRoute.tsx`) gates on a valid session, `status === "approved"`,
and optionally a global role.

The annotate/review pages poll `GET /api/tasks/:id` while `dataset.processing.status` isn't yet
`completed`/`failed` (`ProcessingStatusPanel`), show the ML-drafted transcript as reference
(`TranscriptReference`), and play the audio via WaveSurfer.js (`WaveformPlayer`) per the system design's
recommendation.

Not implemented: per-task history as a separate page (folded into the review screen's "History" section
instead), and CSV/bulk upload (out of scope — see §"Resolved with the user" at the top).
