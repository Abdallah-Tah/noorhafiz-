# NoorHafiz Tutor Voice & Recognition Refactor

**Goal:** make the AI tutor *feel like a real teacher* to a 5–12-year-old child:
clean voice, no robotic metrics, no Arabic-with-English-accent mangling, and a
recognition pipeline that copes with noisy rooms instead of giving up.

**Non-goals:** redesigning the lesson-flow logic, swapping Whisper, or changing
the scoring algorithm. Those work; the *experience* around them is what's broken.

---

## 1. Current state (audited 2026-05-03)

| Layer | What's wired | Where |
|---|---|---|
| TTS speech | Gemini only (no real OpenAI TTS) | `backend/app/routers/tts.py` |
| Tutor wording | Local templates, OpenAI rewrite optional | `app/src/lib/tutor.ts`, `backend/app/routers/tutor.py` |
| Recognition | faster-whisper int8 on CPU | `backend/app/routers/recite.py` |
| Mic capture | `getUserMedia` with EC/NS/AGC, RMS-based VAD | `app/src/pages/Dashboard.tsx`, `app/src/lib/recording.ts` |

## 2. Root causes of the "doesn't feel real" complaint

1. **Both AI model names are wrong, so they 404 silently.**
   - `gemini-3.1-flash-tts-preview` → not a real model. Primary always fails,
     falls back to `gemini-2.5-flash-preview-tts` after a wasted round-trip.
   - `gpt-5.4-nano` → not a real model. OpenAI rewrite is **never used**; child
     always hears the canned local template.
2. **Voice doesn't switch with language.** When the tutor says
   *"Let's work on فَلَا تُكَلِّمَنْ"* with the English voice (Orus), Orus reads the
   Arabic phonetically with an English accent. This is the #1 break in the
   "real teacher" illusion.
3. **Spoken lines read like a metric tracker.** *"That's 1 of 3 good repeats.
   Let's make it stronger."* — visible counter is fine, but reading the count
   out loud is the opposite of how a human teacher talks.
4. **No delivery cues sent to Gemini.** Gemini 2.5 TTS accepts a leading
   instruction ("Say warmly, slowly…"); the request just sends raw text, so
   delivery is flat.
5. **No fallback when Gemini is down.** The "OpenAI backup" the user thought
   they had does not exist. Tutor goes mute.
6. **Static VAD thresholds.** `speechThresholdRms = 0.03` and
   `silenceThresholdRms = 0.012` are absolute values; in a noisier room the
   silence threshold is below the noise floor → the tutor never auto-stops, or
   the speech threshold is below normal background → it triggers on shuffling.

## 3. Solution

### 3.1 Voice — Gemini primary, OpenAI fallback, browser last resort

```
text → /tts/tutor
        ├── try Gemini 2.5 flash → 2.5 pro (one voice, whole utterance)
        │     └── teacher delivery prefix in dominant language
        ├── on Gemini failure → OpenAI gpt-4o-mini-tts (matching voice)
        └── on backend failure → frontend speechSynthesis
```

- **Real model list**: `gemini-2.5-flash-preview-tts` → `gemini-2.5-pro-preview-tts`.
- **Delivery prefix** (Gemini only — it understands these as style cues):
  `"Say warmly and clearly, like a patient Quran teacher speaking to a young child. Pause briefly at commas. Pronounce Arabic with proper makhraj: <text>"`.
  The cue language is picked by *dominant language* of the text, not by
  partner-swap; the voice itself stays the user's selection.
- **Voice contract: one voice per request, never swap mid-utterance.**
  An earlier draft of this plan split text on Arabic spans and synthesized each
  with its native voice (Orus + Charon in one sentence). Real-world feedback:
  it sounded like two different people talking. We reversed that and now keep
  the voice fixed for the whole utterance. The 4-voice lineup is:

  | UI selection      | Gemini | OpenAI |
  |-------------------|--------|--------|
  | english_male      | Orus   | onyx   |
  | english_female    | Aoede  | nova   |
  | arabic_male       | Charon | onyx   |
  | arabic_female     | Kore   | nova   |

  Tradeoff: an English voice reading Arabic carries an English accent. Fix is
  user-side: pick the right voice for the content. (Future: a per-language
  setting that auto-picks from the lineup based on detected text.)
- **OpenAI TTS fallback**: model `gpt-4o-mini-tts`, voices `nova` (female) /
  `onyx` (male). Returned as MP3, transcoded by the browser natively
  (`Audio` element handles MP3 fine — no server-side decode needed).
- **In-process LRU cache** — `sha1(text + voice + provider)` → WAV bytes,
  capped at 64 entries. Most short prompts ("Your turn.", "Once more.")
  hit the cache after the first session.
- **Provider-used header** — `X-NH-TTS-Provider: gemini|openai` so the
  Settings test can show what actually answered.

### 3.2 Wording — fix OpenAI, tighten the prompt

- Model: `gpt-5-nano` (with `gpt-4o-mini` as a backstop if 404).
- Timeout: 2 s → 4 s. The 2 s budget barely covered network round-trip; OpenAI
  effectively never replied.
- System prompt: forbid metrics ("X of Y", percentages), allow exactly one
  Arabic word from the `hard_word` field, vary phrasing across calls.
- Local templates: remove the `That's N of M good repeats` line from spoken
  output. Counter is still visible in the UI.

### 3.3 Recognition — calibrate to the room, don't fight it

- **Centralize `getUserMedia`** — single helper in `recording.ts` so all three
  Dashboard call sites use the same constraints. Eliminates drift.
- **Per-attempt noise calibration** (500 ms before recording starts):
  ```
  noiseFloor = avg RMS over 500ms
  speechThreshold  = max(0.025, noiseFloor * 2.5)
  silenceThreshold = max(0.012, noiseFloor * 1.4)
  ```
  Hysteresis stays the same shape; thresholds adapt to the room.
- The kid-friendly "I couldn't hear you clearly" message already exists in
  `tutor.ts` — we don't change it, but now it gets spoken (with the voice
  improvements above) and the underlying VAD will trigger less often.

### 3.4 Health & observability

- `/tts/health` reports both providers + which is currently active.
- Settings TTS test panel renders both states.

## 4. Files touched

| File | Change |
|---|---|
| `backend/app/routers/tts.py` | Real models, delivery prefix, per-language split, OpenAI fallback, LRU cache, provider header, dual-provider health |
| `backend/app/routers/tutor.py` | Real model, 4 s timeout, tighter system prompt |
| `app/src/lib/tutor.ts` | Drop spoken metrics from feedback templates |
| `app/src/lib/recording.ts` | Shared `getMicStream()`, noise-floor calibration, dynamic thresholds |
| `app/src/pages/Dashboard.tsx` | Use `getMicStream()` everywhere; pass calibrated thresholds to silence detector |
| `app/src/components/Settings.tsx` | Show both provider states in the TTS health line |

## 5. What we deliberately do NOT do

- **No new SDK dependencies** — `httpx` (already used) hits OpenAI's REST API
  for TTS too; no `openai` Python package needed in `tts.py`.
- **No client-side TTS provider switch** — provider choice stays server-side.
  Frontend sees `audio/wav` or `audio/mpeg` and plays it.
- **No SSML** — Gemini doesn't honour SSML tags; the delivery prefix is the
  documented way to steer it.
- **No change to scoring or Whisper** — those pass current tests.

## 6. Rollout order (= task list)

1. ✅ This document (plan.md)
2. ✅ Gemini model fix + delivery prefix (smallest unit, immediately audible)
3. ✅ Per-language voice switching (the big "real teacher" win)
4. ✅ OpenAI TTS fallback
5. ✅ LRU cache
6. ✅ OpenAI tutor wording fix
7. ✅ Drop spoken metrics
8. ✅ Mic helper + noise calibration
9. ✅ Dual-provider health
10. ✅ Tests + lint — `tsc --noEmit` clean; `eslint` count unchanged at 39 (all pre-existing). Backend smoke tests cover language splitter, WAV concat, LRU eviction. `tests/test_tutor.py` has a pre-existing `ImportError` from commit `dad73b8` (renamed `_build_tutor_prompt` → `_build_openai_system_prompt`) — not introduced by this work.

Each step is independently mergeable — if step 3 turns out worse on real
audio, we can stop after step 2.

---

# Phase 2 — Pronunciation correction: word-isolation drill

**Goal:** make the agent *correct* the child the way a real teacher does —
isolate the word that broke, demonstrate it in an Arabic voice with correct
makhraj, and only return to the full ayah once the word is clean.

**Status (2026-05-06):** ✅ shipped on the `dev` branch.

## What changed

| Layer | Change | Where |
|---|---|---|
| TTS | `slow=true` field with per-letter Arabic articulation cue | `backend/app/routers/tts.py` |
| Scoring | `POST /recite/score-word` — single-word fuzzy match | `backend/app/routers/recite.py` |
| Tutor wording | `getTutorFeedbackParts()` splits coaching from focus word | `app/src/lib/tutor.ts` |
| Tutor wording | `getWordDrill*` prompts (prep, record, success, retry) | `app/src/lib/tutor.ts` |
| Flow | Two-clip feedback: coaching (user voice) → word slow + normal (Arabic voice) | `app/src/pages/Dashboard.tsx` |
| Flow | `runWordDrill()` after 2+ consecutive fails | `app/src/pages/Dashboard.tsx` |
| UI | Drill word spotlight (gold-bordered box, large Arabic glyph) | `app/src/pages/Dashboard.tsx` |

## Why two clips, not one

The architecture of Phase 1 explicitly bans mid-utterance voice swapping —
"voice consistency > pronunciation accuracy." That holds *within* a clip. But
across clips, switching is fine and is exactly how a human teacher
demonstrates: speak in your normal voice, then say the Arabic word the way an
Arab teacher would. Two clips, one voice each, no phantom-speaker effect.

## Word-drill trigger logic

```
fail attempt 1 → normal retry (full ayah)
fail attempt 2 → two-clip feedback + slow/normal demo + drill mode
                 ├── drill prep ("Now just this one word")
                 ├── word slow (Arabic voice)
                 ├── word normal (Arabic voice)
                 ├── record drill → /recite/score-word
                 ├── matched → success message → return to full-ayah retry
                 └── not matched → retry message + slow demo + record (max 2)
```

Drill exits after 2 attempts even on failure — the kid then sees the full
ayah again, with the focus-word memory primed by the demos.

---

# Phase 3 — Tajweed Learning Section (Ayman-Suwaid method)

**Goal:** add a structured *learn-tajweed* mode separate from "practice ayah".
The child progresses through letter articulation → letter attributes → tajweed
rules → applied drills, following Sheikh Ayman Suwaid's progressive teaching
order from his *تعلم التجويد للأطفال* curriculum.

**Status (2026-05-06):** v1 MVP shipped on the `dev` branch. Drill-mode lesson player works end-to-end against the seeded curriculum. Applied-ayah stage and SVG mouth diagrams are deferred to v2.

## Why a separate section

The current app teaches *what* to recite (ayah text + scoring). It does not
teach *how* — the child can pass scoring with mediocre makharij because
Whisper's phonetic substitution map (`_PHONETIC_CANONICAL`) already forgives
ص↔س, ط↔ت, etc. That tolerance is the right call for memorization scoring,
but it means the app silently accepts wrong articulation. Tajweed is the
missing layer.

## Pedagogy — Sheikh Ayman Suwaid's order

Suwaid's recorded curriculum (40+ episodes for children) progresses in this
fixed order, and we should mirror it because it's the order children's mouths
actually master the sounds:

1. **Makharij (مخارج) — articulation points**
   - Jawf (الجوف): madd letters ا و ي
   - Halq (الحلق) — three sub-points: ء/ه, ع/ح, غ/خ
   - Lisan (اللسان) — ten sub-points covering ق ك, ج ش ي, ض, ل, ن, ر, ت د ط, ث ذ ظ, ز س ص
   - Shafatan (الشفتان): ف, ب م و
   - Khaishum (الخيشوم): ghunna nasal cavity
2. **Sifaat (صفات) — letter attributes**
   - Opposing pairs: hams/jahr, shidda/rakhawa, isti'la/istifala, itbaq/infitah, idhlaq/ismat
   - Standalone: safir, qalqala, leen, inhiraf, takrir, tafashshi, istitala, ghunna
3. **Ahkam (أحكام) — applied rules**
   - Noon sakinah & tanween: idh'har, idgham (with/without ghunna), iqlab, ikhfa
   - Meem sakinah: idh'har shafawi, idgham mithlayn, ikhfa shafawi
   - Madd: tabi'i, badal, leen, far'i (muttasil, munfasil, 'arid, lazim — kalimi/harfi, muthaqqal/mukhaffaf)
   - Lam shamsiyya vs. qamariyya
   - Qalqala: kubra vs. sughra
   - Ra: tafkhim vs. tarqiq
4. **Applied tajweed in surahs** — graduate from drills to real ayat,
   marking each tajweed event in the displayed text and listening for it.

## Data model

New tables — **no changes to existing memorization tables**.

```python
class TajweedLesson(Base):
    id: int
    order_index: int            # matches Suwaid's episode order
    stage: str                  # 'makharij' | 'sifaat' | 'ahkam' | 'applied'
    topic_key: str              # 'halq_3_ghayn_kha' | 'qalqala_sughra' | ...
    title_ar: str
    title_en: str
    explanation_ar: str         # the rule, written for a 7-year-old
    explanation_en: str
    demo_words: JSON            # ['غَفُور', 'خَلَق', ...] — 5–10 anchor words
    demo_ayat: JSON             # [{surah, ayah, highlight_word_indices}]
    prerequisite_ids: JSON      # must complete these first

class TajweedProgress(Base):
    id: int
    child_id: int (FK)
    lesson_id: int (FK)
    status: str                 # 'locked' | 'available' | 'in_progress' | 'mastered'
    drill_pass_count: int       # how many drill words child has nailed
    drill_pass_target: int      # default 5 — configurable per lesson
    last_attempted_at: datetime
    mastered_at: datetime | None
```

## UX flow per lesson

```
1. Intro screen — Suwaid-style explanation
   ├── Arabic title + English subtitle
   ├── Animated mouth/throat diagram (SVG, optional v2)
   └── "Listen to the rule" → Arabic-voice TTS reads the explanation

2. Demo words (3–5)
   For each demo word:
   ├── Show word large, with the relevant tajweed feature highlighted
   ├── Play slow (existing slow=true TTS)
   ├── Play normal
   └── "Your turn" → drill recording (reuses /recite/score-word)
   Track per-word pass count toward drill_pass_target.

3. Applied ayat (1–2)
   ├── Display ayah with highlighted tajweed events
   ├── Play reciter (EveryAyah CDN) — same source the practice flow uses
   ├── Recite full ayah with existing /recite/score
   └── Score includes a *tajweed bonus* — words containing the just-learned
       feature get extra weight. Phase-3a stays scoring-neutral; Phase-3b
       adds phoneme-level checks (out of scope here).

4. Mastery gate
   ├── Drill: drill_pass_count ≥ drill_pass_target
   ├── Applied: at least one applied ayah with accuracy ≥ 75%
   └── Then status = 'mastered', next lesson unlocks.
```

## Routes & files

```
backend/app/routers/tajweed.py     # new — lesson tree, progress, drill-batch
backend/app/models/models.py       # add TajweedLesson, TajweedProgress
backend/migrate_add_tajweed.py     # populate lessons from a JSON seed
backend/seeds/tajweed_curriculum.json  # the 40+ Suwaid lessons in order

app/src/pages/Tajweed.tsx          # new lesson tree + lesson player
app/src/pages/TajweedLesson.tsx    # the per-lesson player
app/src/lib/tajweed.ts             # API client + lesson-state helpers
app/src/components/TajweedTree.tsx # the lesson grid (locked/available/done)
app/src/components/MakhrajDiagram.tsx # SVG mouth/throat diagram (v2)
```

Add a new top-level tab `tajweed` next to `practice | progress | quran |
settings` in `Dashboard.tsx`'s `activeTab` union.

## What we deliberately do NOT do

- **No phoneme-level scoring engine in v1.** Whisper at int8 on a Pi is not
  accurate enough to grade individual makhraj. Drill scoring reuses
  `/recite/score-word` (fuzzy match) — same as current word-drill mode.
  Phase 3b can add a phoneme model if we move scoring off-device.
- **No interactive 3D mouth model.** A static labelled SVG is enough for
  the makharij stage; v2 can animate per articulation point.
- **No new TTS voices.** Use existing Arabic prebuilt voices (Charon, Kore)
  with the slow articulation cue already shipped in Phase 2.
- **No mixing tajweed gates with memorization progress.** A child can
  memorize without unlocking tajweed lessons, and vice versa. Parents
  decide whether to require tajweed mastery before advancing memorization.

## Curriculum source

The seed JSON should mirror Suwaid's episode order. Since the user named
him explicitly, the canonical reference is *إتقان التجويد للأطفال* (Mastering
Tajweed for Children, ~40 episodes, Iqraa TV, freely available). We
transcribe the episode list into `tajweed_curriculum.json` — title,
explanation, demo words, demo ayat — with the same drill_pass_target = 5
default that the existing word-drill uses.

## Rollout order

1. ✅ Data model + migration + seed JSON (9 representative lessons; full 40 deferred)
2. ✅ Backend routes: `/tajweed/lessons`, `/tajweed/progress/{child_id}`,
   `/tajweed/lesson/{id}/drill-pass`, `/tajweed/lesson/{id}/complete`
3. ✅ Frontend lesson-tree page (locked/available/in-progress/mastered states)
4. ✅ Per-lesson player (intro screen + demo words + drill scoring)
5. ✅ Mastery gate logic — auto-master when `drill_pass_count >= drill_pass_target`
6. ⏳ Applied-ayah stage in the player (currently the player loops the demo
   word list; applied ayat are stored on the lesson but not yet rendered)
7. ⏳ SVG makhraj diagrams (v2)
8. ⏳ Phoneme-level scoring (v3 — off-device model)
9. ⏳ Full 40-lesson seed JSON to mirror Suwaid's complete episode list

Each step is independently shippable. Steps 1–5 are live on `dev`. Steps 6–9
are pure additions — no migration churn, no contract breaks.

## v1 files actually shipped

```
backend/app/models/models.py          # +TajweedLesson +TajweedProgress
backend/app/routers/tajweed.py        # new router (4 endpoints)
backend/app/main.py                   # registers tajweed router
backend/migrate_add_tajweed.py        # creates tables + loads seed (idempotent)
backend/seeds/tajweed_curriculum.json # 9 lessons across all 4 stages

app/src/lib/tajweed.ts                # API client + types + stage labels
app/src/components/TajweedSection.tsx # tab content wrapper (load + state)
app/src/components/TajweedTree.tsx    # stage-grouped lesson grid
app/src/components/TajweedLessonPlayer.tsx  # modal player (intro → demo → drill)
app/src/pages/Dashboard.tsx           # +'tajweed' tab in activeTab union
app/src/components/QuranReader.tsx    # widened setActiveTab union
```

## How to seed a fresh DB

```bash
cd backend
.venv/bin/python migrate_add_tajweed.py
# Tajweed migration complete — 9 lessons in seed
```

The migration is safe to re-run after editing `tajweed_curriculum.json` —
existing lessons are updated by `topic_key` (preserves per-child progress);
new lessons are inserted; nothing is deleted.
