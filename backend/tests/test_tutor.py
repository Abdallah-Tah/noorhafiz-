"""
Unit tests for tutor message sanitization and fallback behavior.
"""
import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.routers.tutor import _sanitize_tutor_message, _build_tutor_prompt
from app.models.models import TutorMemoryEvent


# ═════════════════════════════════════════════════════════════════════════════
# TUTOR MESSAGE SANITIZATION TESTS
# ═════════════════════════════════════════════════════════════════════════════

def test_sanitize_removes_markdown():
    """Markdown formatting should be stripped."""
    msg = "**Great job!** You recited _beautifully_."
    result = _sanitize_tutor_message(msg)
    assert "*" not in result, f"Markdown not stripped: {result!r}"
    assert result == "Great job! You recited beautifully."


def test_sanitize_removes_headers():
    """Markdown headers should be stripped."""
    msg = "### Excellent work!"
    result = _sanitize_tutor_message(msg)
    assert not result.startswith("###"), f"Header not stripped: {result!r}"
    assert result == "Excellent work!"


def test_sanitize_truncates_long_messages():
    """Messages over 200 chars should be truncated."""
    msg = "MashaAllah! " + "a" * 200
    result = _sanitize_tutor_message(msg)
    assert len(result) <= 203, f"Message not truncated: {len(result)} chars"
    assert result.endswith("…"), f"Truncated message should end with ellipsis"


def test_sanitize_blocks_threshold():
    """Messages containing 'threshold' should be blocked."""
    msg = "You passed the threshold!"
    result = _sanitize_tutor_message(msg)
    assert result == "__blocked__", f"Should block 'threshold': {result!r}"


def test_sanitize_blocks_accuracy():
    """Messages containing 'accuracy' should be blocked."""
    msg = "Your accuracy was 85%!"
    result = _sanitize_tutor_message(msg)
    assert result == "__blocked__", f"Should block 'accuracy': {result!r}"


def test_sanitize_blocks_failed():
    """Messages containing 'failed' should be blocked."""
    msg = "Don't worry if you failed."
    result = _sanitize_tutor_message(msg)
    assert result == "__blocked__", f"Should block 'failed': {result!r}"


def test_sanitize_blocks_wrong():
    """Messages containing 'wrong' should be blocked."""
    msg = "That was wrong, try again."
    result = _sanitize_tutor_message(msg)
    assert result == "__blocked__", f"Should block 'wrong': {result!r}"


def test_sanitize_blocks_error():
    """Messages containing 'error' should be blocked."""
    msg = "There was an error in your recitation."
    result = _sanitize_tutor_message(msg)
    assert result == "__blocked__", f"Should block 'error': {result!r}"


def test_sanitize_blocks_score():
    """Messages containing 'score' should be blocked."""
    msg = "Your score was 80%."
    result = _sanitize_tutor_message(msg)
    assert result == "__blocked__", f"Should block 'score': {result!r}"


def test_sanitize_blocks_percentage():
    """Messages containing 'percent' or 'percentage' should be blocked."""
    msg1 = "You got 80 percent!"
    result1 = _sanitize_tutor_message(msg1)
    assert result1 == "__blocked__", f"Should block 'percent': {result1!r}"

    msg2 = "The percentage was high."
    result2 = _sanitize_tutor_message(msg2)
    assert result2 == "__blocked__", f"Should block 'percentage': {result2!r}"


def test_sanitize_blocks_0_percent():
    """Messages containing '0%' should be blocked."""
    msg = "You got 0% correct."
    result = _sanitize_tutor_message(msg)
    assert result == "__blocked__", f"Should block '0%': {result!r}"


def test_sanitize_blocks_whisper():
    """Messages containing 'whisper' should be blocked."""
    msg = "Whisper heard your voice."
    result = _sanitize_tutor_message(msg)
    assert result == "__blocked__", f"Should block 'whisper': {result!r}"


def test_sanitize_blocks_transcription():
    """Messages containing 'transcription' should be blocked."""
    msg = "The transcription was unclear."
    result = _sanitize_tutor_message(msg)
    assert result == "__blocked__", f"Should block 'transcription': {result!r}"


def test_sanitize_blocks_algorithm():
    """Messages containing 'algorithm' should be blocked."""
    msg = "Our algorithm detected improvement."
    result = _sanitize_tutor_message(msg)
    assert result == "__blocked__", f"Should block 'algorithm': {result!r}"


def test_sanitize_allows_encouraging():
    """Encouraging messages should pass through."""
    msg = "MashaAllah! Great job on your recitation."
    result = _sanitize_tutor_message(msg)
    assert result == msg, f"Encouraging message should pass: {result!r}"


def test_sanitize_allows_good_try():
    """Encouraging 'good try' messages should pass through."""
    msg = "Good try! Let's practice that word again."
    result = _sanitize_tutor_message(msg)
    assert result == msg, f"'Good try' message should pass: {result!r}"


def test_sanitize_empty_string():
    """Empty string should return __empty__."""
    result = _sanitize_tutor_message("")
    assert result == "__empty__", f"Empty string should be __empty__: {result!r}"


def test_sanitize_whitespace_only():
    """Whitespace-only string should return __empty__."""
    result = _sanitize_tutor_message("   \n\t  ")
    assert result == "__empty__", f"Whitespace should be __empty__: {result!r}"


def test_sanitize_first_line_only():
    """Only the first line should be returned."""
    msg = "Great job!\nThis is a second line.\nAnd a third."
    result = _sanitize_tutor_message(msg)
    assert "\n" not in result, f"Should only return first line: {result!r}"
    assert result == "Great job!", f"First line should be returned: {result!r}"


def test_sanitize_case_insensitive_blocking():
    """Blocking should be case-insensitive."""
    msg = "You passed the THRESHOLD!"
    result = _sanitize_tutor_message(msg)
    assert result == "__blocked__", f"Should block case-insensitively: {result!r}"


# ═════════════════════════════════════════════════════════════════════════════
# TUTOR PROMPT BUILDING TESTS
# ═════════════════════════════════════════════════════════════════════════════

def test_build_prompt_basic():
    """Prompt should include all required context."""
    event = TutorMemoryEvent(
        child_name="Ahmed",
        surah_name="Al-Fatiha",
        ayah=1,
        accuracy=85.0,
        passed=True,
        action="move_next",
        repeat_count=2,
        repeat_goal=3,
        hard_word=None,
        audio_unclear=False,
    )

    prompt = _build_tutor_prompt(event)

    assert "Ahmed" in prompt, "Child name should be in prompt"
    assert "Al-Fatiha" in prompt, "Surah name should be in prompt"
    assert "Ayah=1" in prompt or "ayah 1" in prompt.lower(), "Ayah should be in prompt"
    assert "85%" in prompt, "Accuracy should be in prompt"
    assert "Passed=True" in prompt or "passed" in prompt.lower(), "Passed should be in prompt"


def test_build_prompt_includes_hard_word():
    """Prompt should include hard word if present."""
    event = TutorMemoryEvent(
        child_name="Ahmed",
        surah_name="Al-Fatiha",
        ayah=1,
        accuracy=70.0,
        passed=False,
        action="retry",
        repeat_count=1,
        repeat_goal=3,
        hard_word="المستقيم",
        audio_unclear=False,
    )

    prompt = _build_tutor_prompt(event)

    assert "المستقيم" in prompt, "Hard word should be in prompt"


def test_build_prompt_includes_audio_unclear():
    """Prompt should mention audio unclear if applicable."""
    event = TutorMemoryEvent(
        child_name="Ahmed",
        surah_name="Al-Fatiha",
        ayah=1,
        accuracy=0.0,
        passed=False,
        action="retry",
        repeat_count=0,
        repeat_goal=3,
        hard_word=None,
        audio_unclear=True,
    )

    prompt = _build_tutor_prompt(event)

    assert "unclear" in prompt.lower(), "Audio unclear should be mentioned"


def test_build_prompt_action_retry():
    """Prompt should indicate child is retrying."""
    event = TutorMemoryEvent(
        child_name="Ahmed",
        surah_name="Al-Fatiha",
        ayah=1,
        accuracy=50.0,
        passed=False,
        action="retry",
        repeat_count=1,
        repeat_goal=3,
        hard_word=None,
        audio_unclear=False,
    )

    prompt = _build_tutor_prompt(event)

    assert "retry" in prompt.lower() or "retrying" in prompt.lower(), \
        "Prompt should indicate retry action"


def test_build_prompt_action_move_next():
    """Prompt should indicate child is advancing."""
    event = TutorMemoryEvent(
        child_name="Ahmed",
        surah_name="Al-Fatiha",
        ayah=7,
        accuracy=95.0,
        passed=True,
        action="move_next",
        repeat_count=3,
        repeat_goal=3,
        hard_word=None,
        audio_unclear=False,
    )

    prompt = _build_tutor_prompt(event)

    assert "advancing" in prompt.lower() or "move" in prompt.lower(), \
        "Prompt should indicate advancing action"


def test_build_prompt_repeat_progress():
    """Prompt should include repeat progress."""
    event = TutorMemoryEvent(
        child_name="Ahmed",
        surah_name="Al-Fatiha",
        ayah=1,
        accuracy=80.0,
        passed=True,
        action="repeat",
        repeat_count=2,
        repeat_goal=3,
        hard_word=None,
        audio_unclear=False,
    )

    prompt = _build_tutor_prompt(event)

    assert "2/3" in prompt or "2 of 3" in prompt.lower(), \
        "Repeat progress should be in prompt"


# ═════════════════════════════════════════════════════════════════════════════
# TEST RUNNER
# ═════════════════════════════════════════════════════════════════════════════

if __name__ == "__main__":
    passed = 0
    failed = 0
    errors = []

    for name, fn in list(globals().items()):
        if name.startswith("test_") and callable(fn):
            try:
                fn()
                print(f"  ✅ {name}")
                passed += 1
            except AssertionError as e:
                print(f"  ❌ {name}: {e}")
                errors.append((name, str(e)))
                failed += 1
            except Exception as e:
                print(f"  💥 {name}: {type(e).__name__}: {e}")
                errors.append((name, f"{type(e).__name__}: {e}"))
                failed += 1

    print(f"\n{'='*60}")
    print(f"Results: {passed} passed, {failed} failed, {passed+failed} total")

    if errors:
        print(f"\n{'='*60}")
        print("FAILURES:")
        for name, err in errors:
            print(f"  - {name}: {err}")
        print("\n❌ SOME TESTS FAILED")
        sys.exit(1)
    else:
        print("✅ ALL TESTS PASSED")
        sys.exit(0)
