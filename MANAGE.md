# MANAGE.md — Local Setup + Complete Admin Guide

Everything needed to run this app on your machine, and everything an Admin/Super Admin can do in it,
start to end — creating a project, getting audio annotated and reviewed, and exporting the result.

For raw HTTP/Postman-level API testing instead of the UI, see [API_TESTING.md](API_TESTING.md). For
architecture and per-service setup detail, see [README.md](README.md) — this doc is the condensed,
task-oriented version of both.

---

# Part 1 — Local setup

## 1.1 Prerequisites

| Tool | Needed for | Check |
|---|---|---|
| Node.js ≥ 18 | backend, frontend | `node -v` |
| Python ≥ 3.10 | ML service | `python3 --version` |
| MongoDB | data store | local `mongod`, or Atlas free tier |
| Redis | job queue | `redis-server --version` |
| ffmpeg | audio metadata + segment cutting | `ffmpeg -version` |
| Google Chrome (optional) | none required for the app itself | — |

## 1.2 Install dependencies

```bash
cd backend && npm install
cd ../frontend && npm install
cd ../ml-service
python3 -m venv .venv
source .venv/bin/activate
pip install --upgrade pip setuptools wheel   # see MANAGE.md §1.6 if this trips you up
pip install --no-build-isolation -r requirements.txt
```

## 1.3 Configure each service's `.env`

Three separate `.env` files — see each `.env.example` for the full annotated list.

```bash
cp backend/.env.example backend/.env
cp ml-service/.env.example ml-service/.env
cp frontend/.env.example frontend/.env
```

**`backend/.env`** — at minimum set `MONGODB_URI`, `JWT_SECRET`, `JWT_REFRESH_SECRET`. Audio storage is a
choice (see §1.4) — Cloudinary needs credentials here too if you want it available.

**`ml-service/.env`** — `INTERNAL_SERVICE_SECRET` **must exactly match** the same variable in
`backend/.env` (it's the shared secret both directions of Node↔ML-service calls use). If you use
Cloudinary, its credentials go here too (same account as backend's). `HUGGINGFACE_TOKEN` is required for
diarization — see §1.5.

**`frontend/.env`** — just `VITE_API_BASE_URL=http://localhost:5000/api` for local dev.

## 1.4 Audio storage: Cloudinary vs local disk

No setup is required to get started — if `CLOUDINARY_CLOUD_NAME` is left blank in `backend/.env`, the
app defaults every upload to **local disk** storage (files under `backend/storage/audio/`, served back at
`http://localhost:5000/uploads/...`). Set up a free Cloudinary account and fill in
`CLOUDINARY_CLOUD_NAME`/`CLOUDINARY_API_KEY`/`CLOUDINARY_API_SECRET` (in **both** `backend/.env` and
`ml-service/.env`) only if you want that as an option too — either way, whoever uploads a file picks
`Cloudinary` or `Local disk` per upload in the UI (see §2.5).

## 1.5 ML models

- **Demucs, Silero VAD, Whisper** — no account needed, weights download automatically on first use.
- **pyannote.audio (speaker diarization)** — needs a Hugging Face account:
  1. Create a token at https://hf.co/settings/tokens, put it in `ml-service/.env` as `HUGGINGFACE_TOKEN`.
  2. Visit https://hf.co/pyannote/speaker-diarization-community-1 while logged in as that account and
     click "Agree and access repository".
  3. Do the same for https://hf.co/pyannote/segmentation-3.0 (a model the pipeline depends on).
  4. The "Website" field on those forms can be anything real — your GitHub profile, university page,
     whatever you're comfortable sharing; it's just sent to pyannote's maintainers, not verified.
- **IndicConformer / NeMo** — optional, only used if `INDIC_CONFORMER_MODEL_PATH` / `NEMO_MODEL_PATH` are
  set; otherwise Hindi/Telugu transcription falls back to Whisper. See README.md §6 if you want them.

## 1.6 Common install snags

- **numpy build fails from source** — `requirements.txt` pins `numpy>=2,<3` specifically so pip picks a
  prebuilt wheel; if you still hit this, your `pip` is stale — `pip install --upgrade pip` first.
- **`ModuleNotFoundError: No module named 'pkg_resources'`** building `demucs`/`openai-whisper` — recent
  `setuptools` dropped it; `pip install "setuptools<81" wheel` then retry with
  `pip install --no-build-isolation -r requirements.txt`.
- **`pyannote diarization failed: 'NoneType' object is not callable`** — `Pipeline.from_pretrained()`
  returned `None`, almost always meaning the gated model terms in §1.5 step 2–3 aren't accepted yet by
  the account whose token you're using.
- **`SpeakerDiarization.__init__() got an unexpected keyword argument 'plda'`** — you're on
  `pyannote.audio` 3.x; the pinned version in `requirements.txt` (4.0.7) is required for the
  `community-1` pipeline's clustering method.

## 1.7 Bootstrap the first Super Admin

There's no signup path to this — registration always creates `status=pending, role=annotator`, and
approving/promoting needs an *existing* Admin/Super Admin. Run once:

```bash
cd backend
npm run seed:admin -- --email=admin@example.com --password=changeme123 --name="Site Admin"
```

Safe to re-run — on an existing email it just resets that account to `super_admin`/`approved`.

## 1.8 Start everything

```bash
./scripts/dev-up.sh          # Redis, ML service, backend API, worker, frontend — one command
./scripts/dev-up.sh --logs   # same, then tail every service's log together
./scripts/dev-down.sh        # stop everything it started
```

It only starts what isn't already running (checked by port and by matching process, so re-running it, or
having some services already up in other terminals, is safe — nothing gets duplicated, and it never
touches a service it didn't start). Logs land in `.dev-logs/`, PIDs in `.dev-pids/` (gitignored).

Prefer separate terminals instead? See README.md's "Quick start" / §9 for the manual per-service commands.

## 1.9 Verify it's actually up

```bash
curl http://localhost:5000/ping     # -> pong
curl http://localhost:8000/health   # -> {"status":"ok"}
```
Then open **http://localhost:5173** and log in as the admin from §1.7.

---

# Part 2 — Complete Admin Walkthrough

Everything below is done from the UI at `http://localhost:5173`, logged in as an Admin or Super Admin,
in the order you'd actually do it for a new corpus.

## 2.1 Log in

`/login` → the email/password from §1.7 (or whatever admin account you're using). A Super Admin sees and
can manage *everything*; a plain Admin only sees projects they created or are a project-admin member of,
and can't touch other Admin/Super Admin accounts.

## 2.2 Approve/manage users (Manage Users, nav bar — Admin/Super Admin only)

New accounts land here as `pending` after registering at `/register` (always created as global role
`annotator` — that's just their *default*, not final; see §2.10).

- **Pending queue**: Approve or Reject each new signup.
- **All users table**: Deactivate (blocks login immediately) / Reactivate any non-Admin/Super-Admin
  account; as Super Admin, also change anyone's **global role** via the dropdown in that row.

Global role ≠ project access — see §2.4, this is the single most common point of confusion in the whole
app. Approving someone here does not add them to any project.

## 2.3 Create a project

**Projects** (nav) → **New project** → name, optional description, optional default language (e.g. `hi`).
You (the creator) are automatically added as that project's `admin`-role member.

## 2.4 Add members to the project

Open the project → **Members** tab → **Add member**: pick a user (only Admin/Super Admin accounts can
browse the full user list here — a plain project-admin without that global role has to ask one for the
user's ID, or have that Admin add the member instead) and set their **project role** —
`annotator` | `reviewer` | `admin` — independent of their global role. This is the step people skip:
**an approved user with zero project memberships sees an empty Dashboard and nothing to do, by design.**

Members already added can have their project role changed, or be removed, from this same tab.

## 2.5 Upload audio (Tasks tab → "Upload audio")

- **Audio file** — any of wav/mp3/m4a/flac/ogg (configurable via `ALLOWED_AUDIO_FORMATS`).
- **Language** — optional, e.g. `hi`, `te`, `en` — also drives which transcription model the ML pipeline
  routes to (Whisper for `en`, IndicConformer for `hi`/`te` if configured, else Whisper as fallback).
- **Storage** — `Server default` / `Cloudinary` / `Local disk`, per upload (§1.4).

This creates the Task and kicks off preprocessing in the background — the page returns immediately, it
doesn't wait. One file per upload; there's no bulk/CSV upload in this build.

## 2.6 Watch preprocessing finish

The Tasks table doesn't auto-refresh — reload the tab to see status move through the pipeline stages
(music removal → binary speech segmentation → speaker diarization → transcription → completed). Once a
task's audio is opened on the Annotate page (§2.8), that page *does* poll automatically every few seconds
while processing is still in progress, and shows a stage/progress panel.

A task can't be opened for annotation until this reaches `completed` — attempting to earlier gets a clear
"preprocessing has not completed" message rather than a silent failure.

## 2.7 Assign annotator and reviewer (Tasks tab)

Each task row has two dropdowns, populated from that project's members: **Annotator** (must be a member
with project role `annotator` or `admin`) and **Reviewer** (`reviewer` or `admin`, and can't be the same
person as the Annotator). Assigning is what actually makes the task show up on that person's Dashboard.

## 2.8 The Annotator's pass

The assigned annotator (or you, viewing as Admin/Super Admin) opens the task from the Dashboard or the
Tasks tab. The page shows:

- The **waveform** with Play/Pause/Stop.
- The **ML-drafted transcript** (per-segment speaker/language, if preprocessing produced one) — click any
  timestamp to jump the audio there and start playing from that point.
- The **RSML editor**: a raw text pane (with `@`/`#`/`!`/`&` autocomplete as you type — see Part 3 for the
  full tag reference) next to a live rendered preview showing tags/entities/speakers as colored chips.
  Starts pre-filled from the ML draft.
- **Save draft** (can save repeatedly) and **Submit for review** (locks it — no more edits until a
  reviewer sends it back).
- **Download SRT** — the machine transcript as a subtitle file (§2.11), independent of whatever's been
  hand-annotated.

## 2.9 The Reviewer's pass

The assigned reviewer opens the same task's **Review** page: the waveform, the ML transcript reference
(same click-to-seek), and the annotator's submitted text read-only. Three verdicts, each with an optional
comment:

- **Accept** — task → `accepted`, this becomes the canonical text (shows up in exports, §2.12).
- **Reject** — task → `rejected`, dead end for this attempt.
- **Send back for correction** — task → `annotation_in_progress`, the annotation reopens to `draft` and
  the annotator edits and resubmits (§2.8) — this is the only way a locked/submitted annotation becomes
  editable again short of Accept/Reject.

A reviewer can never review their own annotation, enforced server-side, not just hidden in the UI.

## 2.10 The RSML Overview tab

Open the project → **RSML Overview** tab: every task's RSML content, stacked on one scrollable page — no
need to click into each task individually. Shows the accepted/submitted annotation where one exists,
otherwise the ML draft, otherwise a "still processing" note. Tasks assigned to *you* as annotator (and
not yet accepted/rejected) are directly editable right there, with their own Save button — same
create-draft-or-update mechanics as the full Annotate page, just inline.

## 2.11 Download an SRT

From the Tasks tab (an "SRT" button per row) or from the Annotate/Review pages ("Download SRT" under the
transcript reference). Produces a standard, valid `.srt` — each cue's text is preceded by a metadata line
with whichever of speaker / overlapping speakers / language / model / confidence the pipeline actually
produced for that segment (never printing a field that wasn't available). Requires preprocessing to have
completed; this is the *machine* transcript, not the human RSML annotation.

## 2.12 Export the accepted corpus

Project → **Settings & export** tab → **Download CSV**. Pulls every task with status `accepted` —
`taskId, audioUrl, language, speakerLabel, rsmlText` (the accepted annotation's text). Only a project
admin or Super Admin can do this.

## 2.13 Delete a task

Tasks tab → **Delete** on a row (project admin/Super Admin only). Confirmation dialog first — this
removes the task, its Dataset (all ML output), every Annotation on it, its stored audio (whichever
backend it was actually stored on), and cancels/removes any still-queued processing job for it. Not
reversible.

## 2.14 Archive/delete a project, manage its role assignments further

Project → **Settings & export** covers export; renaming, archiving (`status: active|archived`), or
deleting the whole project (cascades to all its Tasks/Datasets/Annotations) happens via the API directly
today — see `PATCH`/`DELETE /api/projects/:id` in [API_TESTING.md](API_TESTING.md) §8 (no dedicated UI
button for this yet).

## 2.15 Promote/demote a user's global role (Super Admin only)

Manage Users → the role dropdown in the "All users" table. Changes their *default* role for future
project memberships; it does not retroactively change project roles they already have (those stay as
whatever an admin set in §2.4 for each project independently).

---

# Part 3 — RSML tag reference

What the editor's `@`/`#`/`!`/`&` autocomplete offers (from the `rsml` package's defaults — the widget
auto-completes all of these as you type the trigger character):

**Hesitations** (isolated, no closing tag): `@umm` `@uhh` `@hmm` `@ugh` `@huh` `@tsk` `@uh-huh` `@ehh`

**Isolated paralinguistics**: `@laughter` `@cry` `@hum` `@breathe` `@sniff` `@nose-blowing` `@cough`
`@sneeze` `@throat-clearing` `@yawn` `@eating-sounds` `@snore` `@groan` `@sigh`

**Isolated other**: `@silence` `@unintelligible` `@stutter-block`

**Disfluency spans** (`@name-start ... @name-end`): `filler` `repetition` `broken-word` `repair`
`false-start` `prolongation`

**Paralinguistic spans**: `crying` `yelling` `laughing` `singing` `humming` `whistling` `whispering`

**Prosody spans**: `emphasis` `falling-pitch` `raising-pitch`

**Entities** — `#TAG[text](normalized)`, e.g. `#GPE[हैदराबाद](हैदराबाद)`: `PER` `GPE` `FAC` `LOC` `ITEM`
`WOA` `EVENT` `SPORTS` `ORG` `BRAND` `HON` `DATETIME` `MONEY` `QUANT` `NUM` `LANG` `LAW` `ID`

**Languages** — `!code[text](gloss)`, e.g. `!en[लोकेशन](location)`: `en` `hi` `bn` `mr` `te` `ta` `gu`
`ur` `kn` `or` `ml` `pa` `as` `mai` `sat` `ks` `ne` `sd` `doi` `kok` `mni` `brx` `sa`

**Speakers** — `&sN-start ... &sN-end` (e.g. `&s1-start ... &s1-end`), the widget suggests the next
unused speaker number automatically.

**Corrections** — bare mispronunciation: `[wrong](right)`; explicit: `$[wrong](right)`.

The rendered preview pane has a **Normalized / Verbatim** toggle switch to see the text either with
corrections applied or exactly as typed.

---

# Part 4 — Who can do what (quick reference)

| Action | Who |
|---|---|
| Approve/reject/deactivate/reactivate a user | Admin, Super Admin (Admin can't touch Admin/Super Admin accounts) |
| Change a user's global role | Super Admin only |
| Create a project | Admin, Super Admin |
| Add/remove members, set project roles | that project's admin-role member, or Super Admin |
| Upload audio | that project's admin-role member, or Super Admin |
| Assign annotator/reviewer | that project's admin-role member, or Super Admin |
| Edit an annotation | its owner, only while `status: draft` |
| Submit an annotation | its owner, only while `status: draft` |
| Review (accept/reject/send back) | the task's assigned reviewer, or a project admin/Super Admin — never the annotation's own author |
| Delete a task | that project's admin-role member, or Super Admin |
| Export the corpus | that project's admin-role member, or Super Admin |

Full per-route table: [API_TESTING.md](API_TESTING.md) §8.

---

# Part 5 — Troubleshooting

See README.md §12 for backend/ML-service-level issues (ffmpeg missing, pyannote auth, stuck jobs). The
one specific to this guide:

- **"I approved someone but they still see nothing"** — approval is a global-account gate, not project
  access. Add them as a project member (§2.4) *and* assign them to a task (§2.7); until both are done,
  an empty Dashboard is correct behavior, not a bug.
