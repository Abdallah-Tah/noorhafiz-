/**
 * Unit tests for Bismillah stripping and display logic.
 *
 * Covers:
 * - Exact prefix matching (no overshoot into ayah text)
 * - All known Bismillah variants
 * - Surah-specific rules (Fatiha, Tawbah, others)
 * - Debug logging for surah 112 ayah 1
 */

import { describe, it, expect, vi } from 'vitest'
import {
  BISMILLAH_ARABIC,
  isBismillahAyah,
  shouldShowBismillahHeader,
  stripBismillahFromArabic,
  getDisplayArabicAyahText,
} from '../src/lib/quran'

// ── Exact API texts (from alquran.cloud / Tanzil Uthmani source) ──

const API_BISMILLAH = 'بِسۡمِ ٱللَّهِ ٱلرَّحۡمَـٰنِ ٱلرَّحِیمِ'

const AL_FATIHA_1 = 'بِسۡمِ ٱللَّهِ ٱلرَّحۡمَـٰنِ ٱلرَّحِیمِ'
const AL_BAQARAH_1 = 'بِسۡمِ ٱللَّهِ ٱلرَّحۡمَـٰنِ ٱلرَّحِیمِ الۤمۤ'
const AL_IKHLAS_1 = 'بِسۡمِ ٱللَّهِ ٱلرَّحۡمَـٰنِ ٱلرَّحِیمِ قُلۡ هُوَ ٱللَّهُ أَحَدٌ'
const AL_FALAQ_1 = 'بِسۡمِ ٱللَّهِ ٱلرَّحۡمَـٰنِ ٱلرَّحِیمِ قُلۡ أَعُوذُ بِرَبِّ ٱلۡفَلَقِ'
const AL_MASAD_1 = 'بِسۡمِ ٱللَّهِ ٱلرَّحۡمَـٰنِ ٱلرَّحِیمِ تَبَّتۡ یَدَاۤ أَبِی لَهَبࣲ وَتَبَّ'
const AT_TAWBAH_1 = 'بَرَاۤءَةࣱ مِّنَ ٱللَّهِ وَرَسُولِهِۦۤ إِلَى ٱلَّذِینَ عَـٰهَدتُّم مِّنَ ٱلۡمُشۡرِكِینَ'

// ── stripBismillahFromArabic ──

describe('stripBismillahFromArabic', () => {
  it('strips API Bismillah from Al-Baqarah 1', () => {
    const result = stripBismillahFromArabic(AL_BAQARAH_1)
    expect(result).toBe('الۤمۤ')
  })

  it('strips API Bismillah from Al-Ikhlas 1 and preserves full ayah', () => {
    const result = stripBismillahFromArabic(AL_IKHLAS_1)
    expect(result).toBe('قُلۡ هُوَ ٱللَّهُ أَحَدٌ')
  })

  it('strips API Bismillah from Al-Falaq 1', () => {
    const result = stripBismillahFromArabic(AL_FALAQ_1)
    expect(result).toBe('قُلۡ أَعُوذُ بِرَبِّ ٱلۡفَلَقِ')
  })

  it('strips API Bismillah from Al-Masad 1', () => {
    const result = stripBismillahFromArabic(AL_MASAD_1)
    expect(result).toBe('تَبَّتۡ یَدَاۤ أَبِی لَهَبࣲ وَتَبَّ')
  })

  it('strips U+0652 sukun variant', () => {
    const variant = 'بِسْمِ ٱللَّهِ ٱلرَّحْمَـٰنِ ٱلرَّحِيمِ قُلۡ هُوَ ٱللَّهُ أَحَدٌ'
    const result = stripBismillahFromArabic(variant)
    expect(result).toBe('قُلۡ هُوَ ٱللَّهُ أَحَدٌ')
  })

  it('strips undiacritized variant', () => {
    const variant = 'بسم الله الرحمن الرحيم قُلۡ هُوَ ٱللَّهُ أَحَدٌ'
    const result = stripBismillahFromArabic(variant)
    expect(result).toBe('قُلۡ هُوَ ٱللَّهُ أَحَدٌ')
  })

  it('strips variant with alef wasla but no diacritics', () => {
    const variant = 'بسم ٱلله ٱلرحمن ٱلرحيم قُلۡ هُوَ ٱللَّهُ أَحَدٌ'
    const result = stripBismillahFromArabic(variant)
    expect(result).toBe('قُلۡ هُوَ ٱللَّهُ أَحَدٌ')
  })

  it('returns raw text unchanged when no Bismillah prefix', () => {
    const noBismillah = 'قُلۡ هُوَ ٱللَّهُ أَحَدٌ'
    const result = stripBismillahFromArabic(noBismillah)
    expect(result).toBe(noBismillah)
  })

  it('returns raw text unchanged for partial prefix match', () => {
    // "بسم الله الرحمن" is missing "الرحيم" — not a full Bismillah, do not strip
    const partial = 'بسم الله الرحمن'
    const result = stripBismillahFromArabic(partial)
    expect(result).toBe(partial)
  })

  it('returns raw text unchanged for At-Tawbah 1 (no Bismillah)', () => {
    const result = stripBismillahFromArabic(AT_TAWBAH_1)
    expect(result).toBe(AT_TAWBAH_1)
  })

  it('handles leading whitespace before Bismillah', () => {
    const withSpace = '  ' + AL_IKHLAS_1
    const result = stripBismillahFromArabic(withSpace)
    expect(result).toBe('قُلۡ هُوَ ٱللَّهُ أَحَدٌ')
  })

  it('handles extra spaces after Bismillah', () => {
    const withExtraSpace = API_BISMILLAH + '  ' + 'قُلۡ هُوَ ٱللَّهُ أَحَدٌ'
    const result = stripBismillahFromArabic(withExtraSpace)
    expect(result).toBe('قُلۡ هُوَ ٱللَّهُ أَحَدٌ')
  })

  it('does not strip words that happen to start like Bismillah', () => {
    const text = 'بِسۡمِ ٱللَّهِ alone without the rest'
    const result = stripBismillahFromArabic(text)
    expect(result).toBe(text)
  })
})

// ── getDisplayArabicAyahText ──

describe('getDisplayArabicAyahText', () => {
  it('Al-Fatiha 1: returns raw text as-is, no header', () => {
    const result = getDisplayArabicAyahText(AL_FATIHA_1, 1, 1)
    expect(result).toBe(AL_FATIHA_1)
    expect(isBismillahAyah(1, 1)).toBe(true)
    expect(shouldShowBismillahHeader(1, 1)).toBe(false)
  })

  it('Al-Baqarah 1: strips Bismillah, shows header', () => {
    const result = getDisplayArabicAyahText(AL_BAQARAH_1, 2, 1)
    expect(result).toBe('الۤمۤ')
    expect(shouldShowBismillahHeader(2, 1)).toBe(true)
  })

  it('Al-Ikhlas 1: strips Bismillah, preserves full ayah, shows header', () => {
    const result = getDisplayArabicAyahText(AL_IKHLAS_1, 112, 1)
    expect(result).toBe('قُلۡ هُوَ ٱللَّهُ أَحَدٌ')
    expect(shouldShowBismillahHeader(112, 1)).toBe(true)
  })

  it('Al-Masad 1: strips Bismillah, preserves full ayah', () => {
    const result = getDisplayArabicAyahText(AL_MASAD_1, 111, 1)
    expect(result).toBe('تَبَّتۡ یَدَاۤ أَبِی لَهَبࣲ وَتَبَّ')
    expect(shouldShowBismillahHeader(111, 1)).toBe(true)
  })

  it('At-Tawbah 1: no stripping, no header', () => {
    const result = getDisplayArabicAyahText(AT_TAWBAH_1, 9, 1)
    expect(result).toBe(AT_TAWBAH_1)
    expect(shouldShowBismillahHeader(9, 1)).toBe(false)
  })

  it('returns raw text unchanged when no Bismillah in raw text', () => {
    const noBismillah = 'قُلۡ هُوَ ٱللَّهُ أَحَدٌ'
    const result = getDisplayArabicAyahText(noBismillah, 112, 1)
    expect(result).toBe(noBismillah)
    expect(shouldShowBismillahHeader(112, 1)).toBe(true)
  })

  it('non-ayah-1 returns raw text unchanged regardless of surah', () => {
    const text = 'ٱللَّهُ أَحَدٌ'
    const result = getDisplayArabicAyahText(text, 112, 2)
    expect(result).toBe(text)
  })
})

// ── Debug logging ──

describe('Bismillah debug logging', () => {
  it('logs debug info for surah 112 ayah 1', () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    getDisplayArabicAyahText(AL_IKHLAS_1, 112, 1)

    expect(logSpy).toHaveBeenCalledWith('[Bismillah Debug]')
    expect(logSpy).toHaveBeenCalledWith('raw=', AL_IKHLAS_1)
    expect(logSpy).toHaveBeenCalledWith('display=', 'قُلۡ هُوَ ٱللَّهُ أَحَدٌ')
    expect(logSpy).toHaveBeenCalledWith('header=', true)

    logSpy.mockRestore()
  })

  it('does not log debug info for other surahs', () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    getDisplayArabicAyahText(AL_BAQARAH_1, 2, 1)

    expect(logSpy).not.toHaveBeenCalledWith('[Bismillah Debug]')

    logSpy.mockRestore()
  })
})

// ── Rules ──

describe('Surah rules', () => {
  it('Al-Fatiha is Bismillah ayah', () => {
    expect(isBismillahAyah(1, 1)).toBe(true)
  })

  it('Al-Fatiha ayah 2 is not Bismillah ayah', () => {
    expect(isBismillahAyah(1, 2)).toBe(false)
  })

  it('shows Bismillah header for Al-Baqarah 1', () => {
    expect(shouldShowBismillahHeader(2, 1)).toBe(true)
  })

  it('shows Bismillah header for Al-Ikhlas 1', () => {
    expect(shouldShowBismillahHeader(112, 1)).toBe(true)
  })

  it('does not show Bismillah header for Al-Fatiha 1', () => {
    expect(shouldShowBismillahHeader(1, 1)).toBe(false)
  })

  it('does not show Bismillah header for At-Tawbah 1', () => {
    expect(shouldShowBismillahHeader(9, 1)).toBe(false)
  })

  it('does not show Bismillah header for non-ayah-1', () => {
    expect(shouldShowBismillahHeader(2, 2)).toBe(false)
    expect(shouldShowBismillahHeader(112, 4)).toBe(false)
  })
})

// ── Regression: must never strip ayah text ──

describe('Regression guards', () => {
  it('Al-Ikhlas 1: display must include قُلۡ and هُوَ', () => {
    const display = getDisplayArabicAyahText(AL_IKHLAS_1, 112, 1)
    expect(display).toContain('قُلۡ')
    expect(display).toContain('هُوَ')
  })

  it('Al-Baqarah 1: display must be الۤمۤ', () => {
    const display = getDisplayArabicAyahText(AL_BAQARAH_1, 2, 1)
    expect(display).toBe('الۤمۤ')
  })

  it('Al-Masad 1: display must include تَبَّتۡ', () => {
    const display = getDisplayArabicAyahText(AL_MASAD_1, 111, 1)
    expect(display).toContain('تَبَّتۡ')
  })
})
