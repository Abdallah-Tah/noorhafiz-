# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

**NoorHafiz** — AI-powered Quran memorization companion for children (5–12). Combines speech recognition, TTS, adaptive lessons, and personalized tutor feedback.

## Commands

### Frontend (`app/`)

```bash
npm install          # Install dependencies
npm run dev          # Vite dev server with HMR on http://0.0.0.0:3000
npm run build        # Production build → dist/
npm run lint         # ESLint (39 pre-existing violations; don't treat as regressions)
tsc -b               # Type check
```

### Backend (`backend/`)

```bash
source .venv/bin/activate
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload

# Run tests
pytest tests/

# Env vars for optional features
WHISPER_MODEL=base                    # tiny|base|small|medium|large (default: tiny)
OPENAI_TUTOR_ENABLED=true             # Enable OpenAI tutor wording
OPENAI_API_KEY=sk-...
```

Secrets fallback: `~/.config/openclaw/secrets.env`

Frontend dev proxy: `/nh/api` → `http://127.0.0.1:8000`

### Database

Manual migration scripts in `backend/migrate_*.py` (no Alembic). Run them directly when adding columns.

## Architecture

### Stack

- **Frontend**: React 19 + TypeScript, Vite, Tailwind CSS 4, React Router v7
- **Backend**: FastAPI (Python 3.11), SQLite via SQLAlchemy, JWT auth
- **Speech recognition**: faster-whisper (int8 CPU)
- **TTS**: Gemini 2.5 flash-tts → Gemini 2.5 pro-tts → OpenAI gpt-4o-mini-tts → browser `speechSynthesis`
- **Tutor wording**: OpenAI gpt-5-nano (opt-in, never blocks lesson flow)

### Core lesson flow

```
Dashboard → GET /quran/ayah → display Ayah
          → local tutor prep template → POST /tts/tutor → play audio
          → noise calibration → VAD recording
          → POST /recite/score (FormData audio) → whisper + fuzzy scoring
          → local feedback template (optionally POST /tutor/message for rewrite)
          → advance / retry decision
```

### Key frontend modules (`app/src/lib/`)

| File | Role |
|------|------|
| `api.ts` | Centralized fetch wrapper with JWT auth; auto-logout on 401 |
| `tutor.ts` | All tutor message builders — prep, record prompt, feedback, transitions |
| `recording.ts` | `getMicConstraints`, `runNoiseCheck`, `calibrateThresholds`, `startSilenceDetection` |
| `quran.ts` | Bismillah stripping, display vs. scoring text normalization |

### Key backend modules (`backend/app/routers/`)

| File | Role |
|------|------|
| `recite.py` | Scoring engine: `compare_texts_positional/fuzzy`, `detect_unclear_audio`, Whisper transcription |
| `tts.py` | Fallback TTS chain, LRU cache (64 entries, sha1 key), voice mapping, delivery prefix |
| `tutor.py` | Optional OpenAI rewrite of tutor messages (4 s timeout, falls back to local template) |
| `practice.py` | Sessions, mastery tracking, memory check endpoint |

### Data models (`backend/app/models/models.py`)

- **User** → **Child** (1:many) — Child stores current lesson position, voice prefs, learning boundaries
- **Mastery** — per-child per-ayah: `practice_pass_count`, `ready_for_memory_check`, `memorized`
- **TutorMemoryEvent** — written by recite/memory-check endpoints; used as OpenAI context (never controls flow)
- **PracticeSession** — accuracy, mistakes JSON, duration

## Important design decisions

**Adaptive VAD** — noise floor is calibrated per-attempt before each recording. `speechThreshold = max(0.025, noiseFloor × 2.5)`. Static fallback floors live in `GUIDED_CONFIG` in `recording.ts`.

**One voice per utterance** — TTS voice is fixed for the whole sentence. No mid-sentence switching. User picks the voice; backend picks the provider.

**Bismillah normalization** — Three cases: Fatiha (Bismillah is Ayah 1), At-Tawbah (no Bismillah), all others (Bismillah is an unnumbered header stripped from scoring but shown in display). Both `quran.ts` and the scoring engine handle this separately.

**Tutor messages never expose metrics** — no "1 of 3" in spoken feedback. Visual repeat counter is separate. OpenAI rewriting enforces this via system prompt.

**Whisper model is cached globally** — restart required to change `WHISPER_MODEL`.

**TTS LRU cache** — keyed by `sha1(text + voice + provider)`, capacity 64. Repeated prompts ("Your turn", "Once more") hit cache nearly always.

## API surface (summary)

```
POST /auth/signup|login
GET|PATCH /users/me
GET|POST|PATCH|DELETE /users/children[/{id}]
POST /practice/sessions
GET  /practice/sessions/{child_id}
GET  /practice/dashboard/{child_id}
GET  /practice/mastery/{child_id}[/{surah}/{ayah}]
POST /practice/mastery-progress
POST /practice/memory-check          # audio FormData
GET  /quran/ayah?surah=X&ayah=Y
POST /recite/score                   # audio FormData
POST /tts/tutor
GET  /tts/health
POST /tutor/message                  # OpenAI rewrite (opt-in)
GET  /health
```
