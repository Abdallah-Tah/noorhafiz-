"""Unit tests for Arabic normalization and fuzzy matching."""
import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.routers.recite import (
    normalize_arabic,
    _words_similar,
    _arabic_similarity,
    compare_texts_fuzzy,
    compare_texts_positional,
)


# ── Normalization tests ─────────────────────────────────────

def test_ayah_1_6():
    """Uthmani الصراط with dagger-alif word bridge."""
    ref = "ٱهۡدِنَا ٱلصِّرَ ٰ\u2060طَ ٱلۡمُسۡتَقِیمَ"
    result = normalize_arabic(ref)
    expected = "اهدنا الصراط المستقيم"
    assert result == expected, f"Got {result!r}, expected {expected!r}"


def test_basmala():
    """Basmala normalization."""
    ref = "بِسْمِ ٱللَّهِ ٱلرَّحْمَـٰنِ ٱلرَّحِيمِ"
    result = normalize_arabic(ref)
    # Note: \u0640\u0670 (tatweel+dagger_alif) is removed, not replaced with alif
    expected = "بسم الله الرحمن الرحيم"
    assert result == expected, f"Got {result!r}, expected {expected!r}"


def test_maliki():
    """مالك with tatweel+dagger alif — both stripped, comparison handles difference."""
    ref = "مَـٰلِكِ يَوْمِ ٱلدِّينِ"
    result = normalize_arabic(ref)
    # tatweel(ـ) and dagger_alif(ٰ) removed → no explicit alif
    # Fuzzy matcher handles Whisper's "مالك" vs reference "ملك"
    expected = "ملك يوم الدين"
    assert result == expected, f"Got {result!r}, expected {expected!r}"


def test_farsi_yeh():
    """Farsi Yeh (U+06CC) should become standard Yeh, not get deleted."""
    ref = "ٱلۡحَمۡدُ لِلَّهِ رَبِّ ٱلۡعَـٰلَمِینَ"
    result = normalize_arabic(ref)
    # tatweel+dagger_alif stripped (like ملك pattern), Farsi Yeh → ي
    expected = "الحمد لله رب العلمين"
    assert result == expected, f"Got {result!r}, expected {expected!r}"


def test_whisper_output_no_op():
    """Whisper output (modern Arabic) should be unchanged."""
    whisper = "اهدينة السرات المستقيم"
    result = normalize_arabic(whisper)
    assert result == whisper, f"Normalization should not change Whisper output"


def test_zerowidth_removal():
    """Zero-width characters must not create false word boundaries."""
    # Word joiner between letters should not become a space
    ref = "الر\u200Cحم\u200Dن"  # ZWNJ + ZWJ
    result = normalize_arabic(ref)
    assert " " not in result, f"Zero-width chars created spaces: {result!r}"
    assert result == "الرحمن", f"Got {result!r}"


# ── Fuzzy matching tests ────────────────────────────────────

def test_exact_match():
    assert _words_similar("اهدنا", "اهدنا") is True


def test_phonetic_substitution():
    """ص → س should match (sad↔sin)."""
    assert _words_similar("الصراط", "السرات") is True


def test_similarity_threshold():
    """Words with 72%+ edit distance similarity should match."""
    # اهدينة vs اهدنا = 6 vs 5 chars, 4 shared = ~0.727
    similarity = _arabic_similarity("اهدينة", "اهدنا")
    assert similarity >= 0.70, f"Similarity too low: {similarity}"
    assert _words_similar("اهدينة", "اهدنا") is True


def test_mustaqeem_match():
    """المستقيم should match itself (Farsi Yeh handled)."""
    assert _words_similar("المستقيم", "المستقيم") is True


def test_different_words():
    """Completely different words should not match."""
    assert _words_similar("اهدنا", "نعبد") is False


# ── Fuzzy comparison (full ayah) tests ───────────────────────

def test_fuzzy_beginner_close():
    """Beginner mode: close Whisper transcript should get partial credit."""
    ref = normalize_arabic("ٱهۡدِنَا ٱلصِّرَ ٰ\u2060طَ ٱلۡمُسۡتَقِیمَ")
    whisper = "اهدينة السرات المستقيم"
    result = compare_texts_fuzzy(ref, whisper)
    # Should match at least 1 word (المستقيم)
    assert result["correct"] >= 1, f"Expected >=1 match, got {result['correct']}/{result['total']}"
    assert result["accuracy"] >= 25, f"Accuracy too low: {result['accuracy']}%"


def test_positional_exact():
    """Positional: exact match = 100%."""
    ref = normalize_arabic("ٱهۡدِنَا ٱلصِّرَ ٰ\u2060طَ ٱلۡمُسۡتَقِیمَ")
    result = compare_texts_positional(ref, ref)
    assert result["accuracy"] == 100, f"Exact match failed: {result['accuracy']}%"


# ── Run ─────────────────────────────────────────────────────

if __name__ == "__main__":
    # Run all test functions
    passed = 0
    failed = 0
    for name, fn in list(globals().items()):
        if name.startswith("test_") and callable(fn):
            try:
                fn()
                print(f"  ✅ {name}")
                passed += 1
            except AssertionError as e:
                print(f"  ❌ {name}: {e}")
                failed += 1
            except Exception as e:
                print(f"  💥 {name}: {type(e).__name__}: {e}")
                failed += 1

    print(f"\n{'='*50}")
    print(f"Results: {passed} passed, {failed} failed, {passed+failed} total")
    if failed:
        print("❌ SOME TESTS FAILED")
        sys.exit(1)
    else:
        print("✅ ALL TESTS PASSED")
