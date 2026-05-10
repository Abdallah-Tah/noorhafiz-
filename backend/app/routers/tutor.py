"""
OpenAI JSON tutor wording router.

Flow:
  Frontend → NoorHafiz backend → OpenAI (JSON prompt, 2s timeout)
  Fallback: local _generate_fallback_message() in this file.

Code still decides retry / repeat / move_next.
OpenAI only rewrites the tutor sentence — never controls lesson flow.
Never stores critical learning data in OpenAI.
DB is the source of truth.
"""

import asyncio
import json
import logging
import os
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.models import User, TutorMemoryEvent
from app.auth import get_current_user

logger = logging.getLogger("noorhafiz.tutor")

router = APIRouter(prefix="/tutor", tags=["tutor"])

# ── Config ──

def _load_env() -> dict:
    """Load config from environment, falling back to ~/.config/openclaw/secrets.env."""
    env = {}
    for key in ("OPENAI_TUTOR_ENABLED", "OPENAI_TUTOR_TIMEOUT_MS", "OPENAI_TUTOR_MODEL",
                "OPENAI_API_KEY", "OPENAI_TUTOR_API_KEY", "OPENAI_TUTOR_BASE_URL"):
        val = os.environ.get(key, "")
        if val:
            env[key] = val
    # Fallback: load from secrets file for API keys
    if not env.get("OPENAI_API_KEY") and not env.get("OPENAI_TUTOR_API_KEY"):
        secrets_path = os.path.expanduser("~/.config/openclaw/secrets.env")
        if os.path.exists(secrets_path):
            try:
                with open(secrets_path) as f:
                    for line in f:
                        line = line.strip()
                        if line.startswith("#") or "=" not in line:
                            continue
                        k, v = line.split("=", 1)
                        k, v = k.strip(), v.strip().strip('"').strip("'")
                        if k in ("OPENAI_API_KEY", "OPENAI_TUTOR_API_KEY"):
                            env[k] = v
            except Exception:
                pass
    return env

_env = _load_env()
OPENAI_TUTOR_ENABLED = _env.get("OPENAI_TUTOR_ENABLED", "true").lower() == "true"
# 2 s was below typical first-token latency for nano models — the path was
# effectively dead. 4 s matches what a child can wait without losing flow.
OPENAI_TUTOR_TIMEOUT_S = float(_env.get("OPENAI_TUTOR_TIMEOUT_MS", "4000")) / 1000.0
# `gpt-5.4-nano` is not a real model id; default to `gpt-5-nano` and let the
# operator override via env if they prefer `gpt-4o-mini` etc.
OPENAI_TUTOR_MODEL = _env.get("OPENAI_TUTOR_MODEL", "gpt-5-nano")
OPENAI_TUTOR_FALLBACK_MODEL = _env.get("OPENAI_TUTOR_FALLBACK_MODEL", "gpt-4o-mini")
OPENAI_API_KEY = _env.get("OPENAI_API_KEY") or _env.get("OPENAI_TUTOR_API_KEY", "")
OPENAI_TUTOR_BASE_URL = _env.get("OPENAI_TUTOR_BASE_URL", "") or None  # optional proxy


# ── Pydantic schemas ──

class TutorMessageRequest(BaseModel):
    tutor_memory_event_id: int
    next_ayah: int | None = None  # optional: next ayah when advancing


class TutorMessageResponse(BaseModel):
    ok: bool
    message: str | None = None
    source: str  # "openai" | "fallback"
    error: str | None = None


# ── OpenAI call (JSON prompt, hard timeout) ──

async def _call_openai(event: TutorMemoryEvent, timeout_s: float = OPENAI_TUTOR_TIMEOUT_S) -> str | None:
    """
    Call OpenAI to rewrite a tutor sentence.
    Returns the message string, or None on timeout/error.
    Never returns None due to flow decisions — only wording failures.
    """
    if not OPENAI_TUTOR_ENABLED or not OPENAI_API_KEY:
        logger.info("[tutor] OpenAI tutor disabled (enabled=%s has_key=%s)",
                     OPENAI_TUTOR_ENABLED, bool(OPENAI_API_KEY))
        return None

    try:
        from openai import AsyncOpenAI

        client = AsyncOpenAI(
            api_key=OPENAI_API_KEY,
            base_url=OPENAI_TUTOR_BASE_URL,
            timeout=timeout_s,
            max_retries=0,
        )

        system_prompt = _build_openai_system_prompt()
        user_prompt = _build_openai_user_prompt(event)

        logger.info("[tutor] OpenAI request — action=%s accuracy=%.0f surah=%s ayah=%d",
                     event.action, event.accuracy, event.surah_name, event.ayah)

        # Try the configured model; on 404 (model name typo / not provisioned)
        # transparently retry the fallback model so a misnamed env var doesn't
        # make the tutor go silent.
        async def _request(model_id: str):
            return await asyncio.wait_for(
                client.chat.completions.create(
                    model=model_id,
                    messages=[
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": user_prompt},
                    ],
                    response_format={"type": "json_object"},
                    max_completion_tokens=120,
                    temperature=0.7,
                ),
                timeout=timeout_s,
            )

        try:
            response = await _request(OPENAI_TUTOR_MODEL)
        except Exception as e:
            msg = str(e).lower()
            if "model" in msg and ("not found" in msg or "does not exist" in msg or "404" in msg):
                logger.warning("[tutor] model %s missing, trying fallback %s",
                               OPENAI_TUTOR_MODEL, OPENAI_TUTOR_FALLBACK_MODEL)
                response = await _request(OPENAI_TUTOR_FALLBACK_MODEL)
            else:
                raise

        content = response.choices[0].message.content
        if not content:
            logger.warning("[tutor] OpenAI returned empty content")
            return None

        parsed = json.loads(content)
        msg = (parsed.get("message") or "").strip()

        if msg:
            logger.info("[tutor] OpenAI message: %r", msg)
            return msg

        logger.warning("[tutor] OpenAI JSON missing 'message' field: %r", parsed)
        return None

    except asyncio.TimeoutError:
        logger.warning("[tutor] OpenAI timed out after %.1fs", timeout_s)
        return None
    except Exception:
        logger.exception("[tutor] OpenAI call failed")
        return None


def _build_openai_system_prompt() -> str:
    """System prompt: sets the tutor persona and JSON contract.

    Pedagogy is modeled on Sheikh Ayman Rushdi Suwayd's teaching method
    (الإتقان لتلاوة القرآن on Iqra TV) — patient, warm, physical-feeling
    cues, generous praise, gentle correction. The agent should sound like
    Sheikh Suwayd would sound talking to a 6-year-old: never rushed,
    never harsh, always connecting articulation to the body (where the
    breath comes from, where the tongue rests, how the lips meet).
    """
    return (
        "You are NoorHafiz, a warm Quran tutor speaking out loud to a child "
        "aged 5-12 over video. Your teaching voice is modeled on Sheikh Ayman "
        "Rushdi Suwayd (الشيخ أيمن رشدي سويد): patient, smiling, never rushed, "
        "always grounded in the body. You receive a JSON object with practice "
        'context and you MUST respond with exactly: {"message": "one short sentence"}.\n'
        "\n"
        "PEDAGOGICAL VOICE (Suwayd-style):\n"
        "- Speak the way a kind grandfather teaches a grandchild — calm, slow, smiling.\n"
        "- For makharij struggles, point to the BODY: 'feel where the air comes from', "
        "'feel your throat vibrate', 'let the lips just touch'.\n"
        "- For sifaat (qalqala etc.) cue the FEELING: 'a tiny gentle bounce', "
        "'no force, just the echo'.\n"
        "- For ahkam, cue the CONNECTION: 'let the two words breathe together'.\n"
        "- Praise generously and specifically: 'mashaAllah, your makhraj was clean', "
        "'beautiful — the breath flowed just right'.\n"
        "- Correct gently — never 'wrong'. Use 'almost', 'one more time, calmly', "
        "'listen with me again'.\n"
        "- Endearments are welcome: 'habibi', 'little one', 'champ' — but vary them.\n"
        "\n"
        "TECHNICAL RULES:\n"
        "- One sentence, max 140 characters.\n"
        "- Never say numbers, percentages, counts, or 'X of Y'. The child sees the count on screen.\n"
        "- Never say 'failed', 'wrong', 'incorrect', 'error', 'score', 'accuracy', 'threshold'.\n"
        "- Vary your phrasing — do NOT start every reply with 'MashaAllah' or 'Good try'.\n"
        "- If hard_word is provided, you may include that exact Arabic word once, naturally.\n"
        "- If good_word is provided, acknowledge it briefly before the hard_word.\n"
        "- Match tone to action: celebrate move_next/lesson_complete; reassure on retry; gentle prompt on repeat.\n"
        "- Do NOT instruct what to do next ('press record', 'try again') — the app handles lesson flow.\n"
        "- Respond ONLY with the JSON object, no other text."
    )


def _build_openai_user_prompt(event: TutorMemoryEvent) -> str:
    """Build JSON context for OpenAI to rewrite the tutor sentence."""
    context = {
        "child_name": event.child_name,
        "surah_name": event.surah_name,
        "ayah": event.ayah,
        "accuracy_pct": round(event.accuracy),
        "passed": event.passed,
        "action": event.action,
        "repeat_count": event.repeat_count,
        "repeat_goal": event.repeat_goal,
    }

    good_word = getattr(event, "good_word", None)
    if good_word:
        context["good_word"] = good_word

    if event.hard_word:
        context["hard_word"] = event.hard_word

    if event.audio_unclear:
        context["audio_unclear"] = True

    if event.action == "move_next":
        next_ayah = getattr(event, "next_ayah", None) or event.ayah + 1
        context["next_ayah"] = next_ayah

    return json.dumps(context, ensure_ascii=False)


# ── Sanitization ──

def _sanitize_tutor_message(msg: str) -> str:
    """
    Sanitize an AI-generated message for child safety.
    - Strip markdown
    - Must be < 200 chars
    - No technical terms (threshold, accuracy %, failed, error)
    - Must be English (or Arabic with parent opt-in later)
    """
    import re
    msg = re.sub(r"[*_~`]", "", msg)
    msg = re.sub(r"#{1,6}\s*", "", msg)

    # First line only
    msg = msg.split("\n")[0].strip()

    # Truncate
    if len(msg) > 200:
        msg = msg[:200] + "…"

    # Blocklist technical terms
    blocked = ["threshold", "accuracy", "0%", "failed", "error", "wrong",
               "incorrect", "score", "percentage", "percent", "algorithm",
               "whisper", "transcription"]
    msg_lower = msg.lower()
    for term in blocked:
        if term in msg_lower:
            logger.warning("[tutor] Blocked message containing '%s': %r", term, msg)
            return "__blocked__"

    return msg if msg else "__empty__"


# ── Route ──

@router.post("/message", response_model=TutorMessageResponse)
async def get_tutor_message(
    req: TutorMessageRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Generate a tutor feedback message using OpenAI JSON wording.

    1. Load the tutor_memory_event from DB
    2. Verify the event belongs to a child of the current user
    3. Send JSON context to OpenAI
    4. OpenAI rewrites the tutor sentence only
    5. Sanitize and return the message

    If OpenAI is unavailable/times out, returns { ok: false, source: "fallback" }.
    The frontend must fall back to local tutor.ts message builders.
    Code still decides retry / repeat / move_next — OpenAI never controls flow.
    """
    # Load event
    event = db.query(TutorMemoryEvent).filter(
        TutorMemoryEvent.id == req.tutor_memory_event_id,
    ).first()

    if not event:
        raise HTTPException(status_code=404, detail="Tutor memory event not found")

    # Verify ownership via child
    from app.models.models import Child
    child = db.query(Child).filter(
        Child.id == event.child_id,
        Child.parent_id == current_user.id,
    ).first()

    if not child:
        raise HTTPException(status_code=403, detail="Access denied")

    # Store next_ayah if provided by frontend (for move_next action)
    if req.next_ayah is not None and event.action == "move_next":
        event.next_ayah = req.next_ayah
        db.commit()

    # Always start with local fallback — OpenAI is a wording upgrade only
    fallback = _generate_fallback_message(event)

    # Call OpenAI for wording rewrite
    raw = await _call_openai(event)

    if raw is None:
        return TutorMessageResponse(
            ok=False,
            message=fallback,
            source="fallback",
            error="timeout" if OPENAI_TUTOR_ENABLED else "disabled",
        )

    sanitized = _sanitize_tutor_message(raw)

    if sanitized in ("__blocked__", "__empty__"):
        logger.warning("[tutor] OpenAI message blocked/empty, using fallback: %r", raw)
        return TutorMessageResponse(
            ok=False,
            message=fallback,
            source="fallback",
            error="sanitization",
        )

    return TutorMessageResponse(
        ok=True,
        message=sanitized,
        source="openai",
    )


# ── Fallback message generator ──

def _generate_fallback_message(event: TutorMemoryEvent) -> str:
    """Generate a kid-friendly fallback message from event data.
    Used when OpenAI is unavailable or returns blocked content."""
    name = event.child_name or ""
    name_suffix = f", {name}" if name else ""
    good_word = getattr(event, "good_word", None)

    if event.audio_unclear:
        return "I could not hear you clearly. Move closer and try again."

    if event.action == "new_surah":
        return f"MashaAllah{name_suffix}! Let's start {event.surah_name}."

    if event.action == "lesson_complete":
        return f"Great job{name_suffix}! You finished your lesson for today."

    if event.passed:
        if event.action == "move_next":
            next_ayah = getattr(event, "next_ayah", None) or event.ayah + 1
            return f"Great work{name_suffix}! Moving to Ayah {next_ayah}."
        if event.repeat_count < event.repeat_goal:
            # No spoken metric — the on-screen counter conveys progress.
            return f"Beautiful{name_suffix}. One more time, even smoother."
        return f"MashaAllah{name_suffix}! You finished this ayah."

    # Not passed — retry encouragement
    if good_word and event.hard_word:
        return f"Nice — {good_word} was clear{name_suffix}. Let's work on {event.hard_word}."
    if good_word:
        return f"Good try{name_suffix} — I heard {good_word} clearly. Let's listen again and try once more."
    if event.hard_word:
        return f"Good try{name_suffix}. Let's practice {event.hard_word} again."

    return f"Good try{name_suffix}. Listen again and let's retry."
