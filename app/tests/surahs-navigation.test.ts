/**
 * Unit tests for study plan surah-level navigation.
 * Covers: getNextSurahForStudyPlan, getPreviousSurahForStudyPlan, getFirstAyahForSurahInStudyPlan
 */

import { describe, it, expect } from 'vitest'
import {
  getNextSurahForStudyPlan,
  getPreviousSurahForStudyPlan,
  getFirstAyahForSurahInStudyPlan,
  getStartAyahForStudyPlan,
} from '../src/lib/surahs'

describe('Surah Navigation - getFirstAyahForSurahInStudyPlan', () => {
  it('returns startAyah when surah === startSurah', () => {
    expect(getFirstAyahForSurahInStudyPlan(1, 1, 3)).toBe(3)
    expect(getFirstAyahForSurahInStudyPlan(2, 2, 5)).toBe(5)
  })

  it('returns 1 when surah !== startSurah', () => {
    expect(getFirstAyahForSurahInStudyPlan(2, 1, 3)).toBe(1)
    expect(getFirstAyahForSurahInStudyPlan(3, 2, 5)).toBe(1)
  })
})

describe('Surah Navigation - getStartAyahForStudyPlan', () => {
  it('returns configured start', () => {
    expect(getStartAyahForStudyPlan(1, 1)).toEqual({ surah: 1, ayah: 1 })
    expect(getStartAyahForStudyPlan(1, 3)).toEqual({ surah: 1, ayah: 3 })
    expect(getStartAyahForStudyPlan(2, 1)).toEqual({ surah: 2, ayah: 1 })
  })
})

// ── fatiha_forward ──

describe('Surah Navigation - fatiha_forward', () => {
  const preset = 'fatiha_forward'
  const startSurah = 1
  const startAyah = 1
  const endSurah = 114
  const endAyah = 6

  it('next from Al-Fatiha (1) → Al-Ikhlas (112)', () => {
    const next = getNextSurahForStudyPlan(1, preset, startSurah, startAyah, endSurah, endAyah)
    expect(next).toEqual({ surah: 112, ayah: 1 })
  })

  it('next from Al-Ikhlas (112) → Al-Falaq (113)', () => {
    const next = getNextSurahForStudyPlan(112, preset, startSurah, startAyah, endSurah, endAyah)
    expect(next).toEqual({ surah: 113, ayah: 1 })
  })

  it('next from Al-Maun (107) → null (last in explicit sequence)', () => {
    const next = getNextSurahForStudyPlan(107, preset, startSurah, startAyah, endSurah, endAyah)
    expect(next).toBeNull()
  })

  it('previous from Al-Ikhlas (112) → Al-Fatiha (1)', () => {
    const prev = getPreviousSurahForStudyPlan(112, preset, startSurah, startAyah, endSurah, endAyah)
    expect(prev).toEqual({ surah: 1, ayah: 1 })
  })

  it('previous from Al-Falaq (113) → Al-Ikhlas (112)', () => {
    const prev = getPreviousSurahForStudyPlan(113, preset, startSurah, startAyah, endSurah, endAyah)
    expect(prev).toEqual({ surah: 112, ayah: 1 })
  })

  it('previous from Al-Fatiha (1) → null (first in plan)', () => {
    const prev = getPreviousSurahForStudyPlan(1, preset, startSurah, startAyah, endSurah, endAyah)
    expect(prev).toBeNull()
  })
})

// ── al_fatiha_only ──

describe('Surah Navigation - al_fatiha_only', () => {
  const preset = 'al_fatiha_only'
  const startSurah = 1
  const startAyah = 1
  const endSurah = 1
  const endAyah = 7

  it('next from Al-Fatiha → null', () => {
    expect(getNextSurahForStudyPlan(1, preset, startSurah, startAyah, endSurah, endAyah)).toBeNull()
  })

  it('previous from Al-Fatiha → null', () => {
    expect(getPreviousSurahForStudyPlan(1, preset, startSurah, startAyah, endSurah, endAyah)).toBeNull()
  })
})

// ── selected_surah_only ──

describe('Surah Navigation - selected_surah (single surah)', () => {
  const preset = 'selected_surah'
  const startSurah = 112
  const startAyah = 1
  const endSurah = 112
  const endAyah = 4

  it('next from selected surah → null', () => {
    expect(getNextSurahForStudyPlan(112, preset, startSurah, startAyah, endSurah, endAyah)).toBeNull()
  })

  it('previous from selected surah → null', () => {
    expect(getPreviousSurahForStudyPlan(112, preset, startSurah, startAyah, endSurah, endAyah)).toBeNull()
  })

  it('first ayah for startSurah respects startAyah', () => {
    expect(getFirstAyahForSurahInStudyPlan(112, 112, 1)).toBe(1)
  })
})

// ── custom same-surah ──

describe('Surah Navigation - custom same surah (1:3 → 1:5)', () => {
  const preset = 'custom'
  const startSurah = 1
  const startAyah = 3
  const endSurah = 1
  const endAyah = 5

  it('next from Al-Fatiha → null (only one surah in plan)', () => {
    expect(getNextSurahForStudyPlan(1, preset, startSurah, startAyah, endSurah, endAyah)).toBeNull()
  })

  it('previous from Al-Fatiha → null', () => {
    expect(getPreviousSurahForStudyPlan(1, preset, startSurah, startAyah, endSurah, endAyah)).toBeNull()
  })

  it('startOver returns 1:3', () => {
    expect(getStartAyahForStudyPlan(startSurah, startAyah)).toEqual({ surah: 1, ayah: 3 })
  })
})

// ── custom multi-surah ──

describe('Surah Navigation - custom multi-surah (1:3 → 2:5)', () => {
  const preset = 'custom'
  const startSurah = 1
  const startAyah = 3
  const endSurah = 2
  const endAyah = 5

  it('next from surah 1 → surah 2 ayah 1', () => {
    const next = getNextSurahForStudyPlan(1, preset, startSurah, startAyah, endSurah, endAyah)
    expect(next).toEqual({ surah: 2, ayah: 1 })
  })

  it('previous from surah 2 → surah 1 ayah 3 (respects startAyah)', () => {
    const prev = getPreviousSurahForStudyPlan(2, preset, startSurah, startAyah, endSurah, endAyah)
    expect(prev).toEqual({ surah: 1, ayah: 3 })
  })

  it('previous from surah 1 → null', () => {
    expect(getPreviousSurahForStudyPlan(1, preset, startSurah, startAyah, endSurah, endAyah)).toBeNull()
  })

  it('next from surah 2 → null', () => {
    expect(getNextSurahForStudyPlan(2, preset, startSurah, startAyah, endSurah, endAyah)).toBeNull()
  })
})

// ── juz_amma ──

describe('Surah Navigation - juz_amma', () => {
  const preset = 'juz_amma'
  const startSurah = 78
  const startAyah = 1
  const endSurah = 114
  const endAyah = 6

  it('next from An-Naba (78) → An-Naziat (79)', () => {
    const next = getNextSurahForStudyPlan(78, preset, startSurah, startAyah, endSurah, endAyah)
    expect(next).toEqual({ surah: 79, ayah: 1 })
  })

  it('previous from An-Naziat (79) → An-Naba (78)', () => {
    const prev = getPreviousSurahForStudyPlan(79, preset, startSurah, startAyah, endSurah, endAyah)
    expect(prev).toEqual({ surah: 78, ayah: 1 })
  })

  it('next from An-Nas (114) → null', () => {
    expect(getNextSurahForStudyPlan(114, preset, startSurah, startAyah, endSurah, endAyah)).toBeNull()
  })

  it('previous from An-Naba (78) → null', () => {
    expect(getPreviousSurahForStudyPlan(78, preset, startSurah, startAyah, endSurah, endAyah)).toBeNull()
  })
})

// ── short_surahs ──

describe('Surah Navigation - short_surahs', () => {
  const preset = 'short_surahs'
  const startSurah = 108
  const startAyah = 1
  const endSurah = 114
  const endAyah = 6

  it('next from Al-Kawthar (108) → Al-Kafirun (109)', () => {
    const next = getNextSurahForStudyPlan(108, preset, startSurah, startAyah, endSurah, endAyah)
    expect(next).toEqual({ surah: 109, ayah: 1 })
  })

  it('previous from Al-Kafirun (109) → Al-Kawthar (108)', () => {
    const prev = getPreviousSurahForStudyPlan(109, preset, startSurah, startAyah, endSurah, endAyah)
    expect(prev).toEqual({ surah: 108, ayah: 1 })
  })

  it('next from An-Nas (114) → null', () => {
    expect(getNextSurahForStudyPlan(114, preset, startSurah, startAyah, endSurah, endAyah)).toBeNull()
  })
})

// ── ikhlas_nas ──

describe('Surah Navigation - ikhlas_nas', () => {
  const preset = 'ikhlas_nas'
  const startSurah = 112
  const startAyah = 1
  const endSurah = 114
  const endAyah = 6

  it('next from Al-Ikhlas (112) → Al-Falaq (113)', () => {
    const next = getNextSurahForStudyPlan(112, preset, startSurah, startAyah, endSurah, endAyah)
    expect(next).toEqual({ surah: 113, ayah: 1 })
  })

  it('previous from Al-Falaq (113) → Al-Ikhlas (112)', () => {
    const prev = getPreviousSurahForStudyPlan(113, preset, startSurah, startAyah, endSurah, endAyah)
    expect(prev).toEqual({ surah: 112, ayah: 1 })
  })

  it('previous from Al-Ikhlas (112) → null', () => {
    expect(getPreviousSurahForStudyPlan(112, preset, startSurah, startAyah, endSurah, endAyah)).toBeNull()
  })
})
