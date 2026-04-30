"""
OpenClaw tutor message generation router.

Flow:
  Frontend → NoorHafiz backend → OpenClaw (with 2s timeout)
  Fallback: local tutor.ts message builders in the frontend.

Never stores critical learning data in OpenClaw.
OpenClaw is only tutor personality — DB is the source of truth.
"""

import asyncio
import logging
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.models import User, TutorMemoryEvent
from app.auth import get_current_user

logger = logging.getLogger("noorhafiz.tutor")

router = APIRouter(prefix="/tutor", tags=["tutor"])

# OpenClaw timeout — must NOT block the practice flow
OPENCLAW_TIMEOUT_S = 2.0


# ── Pydantic schemas ──

class TutorMessageRequest(BaseModel):
    tutor_memory_event_id: int


class TutorMessageResponse(BaseModel):
    ok: bool
    message: str | None = None
    source: str  # "openclaw" | "fallback"
    error: str | None = None


# ── OpenClaw call (with hard timeout) ──

async def _call_openclaw(prompt: str, timeout_s: float = OPENCLAW_TIMEOUT_S) -> str | None:
    """
    Call OpenClaw CLI to generate a tutor message.
    Returns the message string, or None on timeout/error.
    """
    try:
        proc = await asyncio.create_subprocess_exec(
            "openclaw", "capability", "model", "run",
            "--prompt", prompt,
            "--model", "gpt-nano",
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, stderr = await asyncio.wait_for(
            proc.communicate(),
            timeout=timeout_s,
        )

        if proc.returncode == 0 and stdout:
            msg = stdout.decode("utf-8").strip()
            # Basic sanitization — strip any markdown, code fences, or overly long output
            msg = msg.split("\n")[0]  # first line only
            if len(msg) > 200:
                msg = msg[:200] + "…"
            if msg:
                logger.info("[tutor] OpenClaw message: %r", msg)
                return msg

        if stderr:
            logger.warning("[tutor] OpenClaw stderr: %s", stderr.decode("utf-8", errors="replace")[:200])

        return None

    except asyncio.TimeoutError:
        logger.warning("[tutor] OpenClaw timed out after %.1fs", timeout_s)
        return None
    except FileNotFoundError:
        logger.warning("[tutor] OpenClaw CLI not found — is it installed?")
        return None
    except Exception:
        logger.exception("[tutor] OpenClaw call failed")
        return None


def _sanitize_tutor_message(msg: str) -> str:
    """
    Sanitize an OpenClaw-generated message for child safety.
    - Strip markdown
    - Must be < 200 chars
    - No technical terms (threshold, accuracy %, failed, error)
    - Must be English (or Arabic with parent opt-in later)
    """
    # Strip markdown formatting
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
            # Don't return a partially-blocked message — safety first
            logger.warning("[tutor] Blocked message containing '%s': %r", term, msg)
            return "__blocked__"

    return msg if msg else "__empty__"


@router.post("/message", response_model=TutorMessageResponse)
async def get_tutor_message(
    req: TutorMessageRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Generate a tutor feedback message using OpenClaw.

    1. Load the tutor_memory_event from DB
    2. Verify the event belongs to a child of the current user
    3. Build a prompt for OpenClaw
    4. Call OpenClaw with 2s timeout
    5. Sanitize and return the message

    If OpenClaw is unavailable/times out, returns { ok: false, source: "fallback" }.
    The frontend must fall back to local tutor.ts message builders.
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

    # Build prompt
    prompt = _build_tutor_prompt(event)

    # Call OpenClaw
    raw = await _call_openclaw(prompt)

    if raw is None:
        fallback = _generate_fallback_message(event)
        return TutorMessageResponse(
            ok=False,
            message=fallback,
            source="fallback",
            error="timeout",
        )

    sanitized = _sanitize_tutor_message(raw)

    if sanitized in ("__blocked__", "__empty__"):
        logger.warning("[tutor] OpenClaw message was blocked/empty: %r", raw)
        fallback = _generate_fallback_message(event)
        return TutorMessageResponse(
            ok=False,
            message=fallback,
            source="fallback",
            error="sanitization",
        )

    return TutorMessageResponse(
        ok=True,
        message=sanitized,
        source="openclaw",
    )


def _build_tutor_prompt(event: TutorMemoryEvent) -> str:
    """
    Build a short, structured prompt for OpenClaw to generate child-friendly
    tutor feedback based on the tutor_memory_event.
    """
    parts = [
        "You are NoorHafiz, a Quran tutor for children.",
        "Generate ONE short, warm sentence (max 150 chars) in English.",
        "Rules:",
        "- Never say 'failed', '0%', 'wrong', or technical words.",
        "- Use 'MashaAllah' for praise, 'Good try' for encouragement.",
        "- Mention the hard word if there is one.",
        "- Sound like a real teacher talking to a child.",
        "",
        f"Context: Child={event.child_name}, Surah={event.surah_name}, Ayah={event.ayah}.",
        f"Accuracy={event.accuracy:.0f}%, Passed={event.passed}, Action={event.action}.",
        f"Repeat progress: {event.repeat_count}/{event.repeat_goal}.",
    ]

    if event.hard_word:
        parts.append(f"Hard word to focus on: {event.hard_word}.")

    if event.audio_unclear:
        parts.append("The audio was unclear — child needs to try again.")

    if event.action == "move_next":
        parts.append("Child is advancing to the next ayah — be encouraging.")
    elif event.action == "retry":
        parts.append("Child is retrying the same ayah — be supportive, not punishing.")
    elif event.action == "new_surah":
        parts.append("Child finished a surah and is starting a new one — celebrate!")
    elif event.action == "lesson_complete":
        parts.append("Child completed today's lesson — big celebration!")

    return "\n".join(parts)


def _generate_fallback_message(event: TutorMemoryEvent) -> str:
    """Generate a kid-friendly fallback message from event data.
    Used when OpenClaw is unavailable or returns blocked content."""
    name = event.child_name or ""

    if event.audio_unclear:
        return "I could not hear you clearly. Move closer and try again."

    if event.action == "new_surah":
        return f"MashaAllah{', ' + name if name else ''}! Let's start {event.surah_name}."

    if event.action == "lesson_complete":
        return f"Great job{', ' + name if name else ''}! You finished your lesson for today."

    if event.passed:
        if event.action == "move_next":
            return f"Great work{', ' + name if name else ''}! Moving to Ayah {event.ayah}."
        if event.repeat_count < event.repeat_goal:
            return f"Nice work{', ' + name if name else ''}. That's {event.repeat_count} of {event.repeat_goal} good repeats."
        return f"MashaAllah{', ' + name if name else ''}! You finished this ayah."

    # Not passed — retry encouragement
    if event.hard_word:
        return f"Good try{', ' + name if name else ''}. Let's practice {event.hard_word} again."

    return f"Good try{', ' + name if name else ''}. Listen again and let's retry."
