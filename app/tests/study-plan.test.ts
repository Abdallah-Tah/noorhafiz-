/**
 * Unit tests for study plan next ayah logic.
 * Tests cover:
 * - Al-Fatiha then Short Surahs: 1:7 => 112:1
 * - Al-Fatiha only: 1:7 => complete/null
 * - Custom range 1:3→1:5: 1:5 => complete/null
 * - Custom range repeat: 1:5 => 1:3
 */

import { describe, it, expect } from 'vitest'
import {
  getNextAyahForStudyPlan,
  STUDY_PLAN_SEQUENCES,
} from '../src/lib/surahs'

describe('Study Plan - Next Ayah Logic', () => {
  // ── Al-Fatiha then Short Surahs ─────────────────────────────────────

  describe('Al-Fatiha then Short Surahs (fatiha_forward)', () => {
    it('should go from Al-Fatiha 1:7 to Al-Ikhlas 112:1', () => {
      const next = getNextAyahForStudyPlan(
        1, 7,           // current: Al-Fatiha, ayah 7
        'fatiha_forward',
        1, 1,           // start: Al-Fatiha, ayah 1
        114, 6,         // end: An-Nas, ayah 6
        'stop',         // completion behavior
      )

      expect(next).not.toBeNull()
      expect(next?.surah).toBe(112)
      expect(next?.ayah).toBe(1)
    })

    it('should go from Al-Ikhlas 112:4 to Al-Falaq 113:1', () => {
      const next = getNextAyahForStudyPlan(
        112, 4,         // current: Al-Ikhlas, last ayah
        'fatiha_forward',
        1, 1,
        114, 6,
        'stop',
      )

      expect(next).not.toBeNull()
      expect(next?.surah).toBe(113)
      expect(next?.ayah).toBe(1)
    })

    it('should go from Al-Falaq 113:5 to An-Nas 114:1', () => {
      const next = getNextAyahForStudyPlan(
        113, 5,         // current: Al-Falaq, last ayah
        'fatiha_forward',
        1, 1,
        114, 6,
        'stop',
      )

      expect(next).not.toBeNull()
      expect(next?.surah).toBe(114)
      expect(next?.ayah).toBe(1)
    })

    it('should wrap to next surah in sequence after An-Nas (114:6 → 108:1)', () => {
      // fatiha_forward continues past An-Nas to Al-Kawthar
      const next = getNextAyahForStudyPlan(
        114, 6,         // current: An-Nas, last ayah
        'fatiha_forward',
        1, 1,
        114, 6,
        'stop',
      )

      expect(next).not.toBeNull()
      expect(next?.surah).toBe(108)
      expect(next?.ayah).toBe(1)
    })

    it('should continue sequence after An-Nas (108:1 follows 114:6)', () => {
      const next = getNextAyahForStudyPlan(
        114, 6,         // current: An-Nas, last ayah
        'fatiha_forward',
        1, 1,
        114, 6,
        'repeat',       // completion behavior
      )

      expect(next).not.toBeNull()
      expect(next?.surah).toBe(108)
      expect(next?.ayah).toBe(1)
    })
  })

  // ── Al-Fatiha Only ───────────────────────────────────────────────────

  describe('Al-Fatiha only (al_fatiha_only)', () => {
    it('should return null after Al-Fatiha 1:7 with stop behavior', () => {
      const next = getNextAyahForStudyPlan(
        1, 7,           // current: Al-Fatiha, ayah 7
        'al_fatiha_only',
        1, 1,           // start: Al-Fatiha, ayah 1
        1, 7,           // end: Al-Fatiha, ayah 7
        'stop',
      )

      expect(next).toBeNull()
    })

    it('should repeat to 1:1 after Al-Fatiha 1:7 with repeat behavior', () => {
      const next = getNextAyahForStudyPlan(
        1, 7,           // current: Al-Fatiha, ayah 7
        'al_fatiha_only',
        1, 1,
        1, 7,
        'repeat',
      )

      expect(next).not.toBeNull()
      expect(next?.surah).toBe(1)
      expect(next?.ayah).toBe(1)
    })

    it('should advance within Al-Fatiha (1:1 → 1:2)', () => {
      const next = getNextAyahForStudyPlan(
        1, 1,
        'al_fatiha_only',
        1, 1,
        1, 7,
        'stop',
      )

      expect(next).not.toBeNull()
      expect(next?.surah).toBe(1)
      expect(next?.ayah).toBe(2)
    })
  })

  // ── Custom Range ─────────────────────────────────────────────────────

  describe('Custom range (custom)', () => {
    it('should return null after end ayah with stop behavior', () => {
      // Custom range 1:3 → 1:5
      const next = getNextAyahForStudyPlan(
        1, 5,           // current: Al-Fatiha, ayah 5 (end boundary)
        'custom',
        1, 3,           // start: Al-Fatiha, ayah 3
        1, 5,           // end: Al-Fatiha, ayah 5
        'stop',
      )

      expect(next).toBeNull()
    })

    it('should repeat to start ayah with repeat behavior', () => {
      // Custom range 1:3 → 1:5
      const next = getNextAyahForStudyPlan(
        1, 5,           // current: Al-Fatiha, ayah 5 (end boundary)
        'custom',
        1, 3,           // start: Al-Fatiha, ayah 3
        1, 5,           // end: Al-Fatiha, ayah 5
        'repeat',
      )

      expect(next).not.toBeNull()
      expect(next?.surah).toBe(1)
      expect(next?.ayah).toBe(3)
    })

    it('should advance within custom range (1:3 → 1:4)', () => {
      const next = getNextAyahForStudyPlan(
        1, 3,           // current: Al-Fatiha, ayah 3
        'custom',
        1, 3,
        1, 5,
        'stop',
      )

      expect(next).not.toBeNull()
      expect(next?.surah).toBe(1)
      expect(next?.ayah).toBe(4)
    })

    it('should handle cross-surah custom range (1:7 → 2:1)', () => {
      const next = getNextAyahForStudyPlan(
        1, 7,           // current: Al-Fatiha, ayah 7
        'custom',
        1, 1,
        2, 10,          // end: Al-Baqarah, ayah 10
        'stop',
      )

      expect(next).not.toBeNull()
      expect(next?.surah).toBe(2)
      expect(next?.ayah).toBe(1)
    })
  })

  // ── Short Surahs ─────────────────────────────────────────────────────

  describe('Short Surahs (short_surahs)', () => {
    it('should go from 108:3 to 109:1', () => {
      const next = getNextAyahForStudyPlan(
        108, 3,         // Al-Kawtharah, last ayah
        'short_surahs',
        108, 1,
        114, 6,
        'stop',
      )

      expect(next).not.toBeNull()
      expect(next?.surah).toBe(109)
      expect(next?.ayah).toBe(1)
    })

    it('should return null after 114:6 with stop behavior', () => {
      const next = getNextAyahForStudyPlan(
        114, 6,
        'short_surahs',
        108, 1,
        114, 6,
        'stop',
      )

      expect(next).toBeNull()
    })
  })

  // ── Al-Ikhlas to An-Nas ──────────────────────────────────────────────

  describe('Al-Ikhlas to An-Nas (ikhlas_nas)', () => {
    it('should go from 112:4 to 113:1', () => {
      const next = getNextAyahForStudyPlan(
        112, 4,
        'ikhlas_nas',
        112, 1,
        114, 6,
        'stop',
      )

      expect(next).not.toBeNull()
      expect(next?.surah).toBe(113)
      expect(next?.ayah).toBe(1)
    })

    it('should go from 113:5 to 114:1', () => {
      const next = getNextAyahForStudyPlan(
        113, 5,
        'ikhlas_nas',
        112, 1,
        114, 6,
        'stop',
      )

      expect(next).not.toBeNull()
      expect(next?.surah).toBe(114)
      expect(next?.ayah).toBe(1)
    })

    it('should return null after 114:6', () => {
      const next = getNextAyahForStudyPlan(
        114, 6,
        'ikhlas_nas',
        112, 1,
        114, 6,
        'stop',
      )

      expect(next).toBeNull()
    })
  })

  // ── Edge Cases ───────────────────────────────────────────────────────

  describe('Edge Cases', () => {
    it('should handle first ayah of first surah in sequence', () => {
      const next = getNextAyahForStudyPlan(
        1, 1,
        'fatiha_forward',
        1, 1,
        114, 6,
        'stop',
      )

      expect(next).not.toBeNull()
      expect(next?.surah).toBe(1)
      expect(next?.ayah).toBe(2)
    })

    it('should handle middle of surah', () => {
      const next = getNextAyahForStudyPlan(
        112, 2,
        'fatiha_forward',
        1, 1,
        114, 6,
        'stop',
      )

      expect(next).not.toBeNull()
      expect(next?.surah).toBe(112)
      expect(next?.ayah).toBe(3)
    })

    it('should return null for invalid surah number', () => {
      const next = getNextAyahForStudyPlan(
        999, 1,         // Invalid surah
        'custom',
        1, 1,
        114, 6,
        'stop',
      )

      expect(next).toBeNull()
    })
  })
})

describe('Study Plan - Study Plan Sequences', () => {
  it('should have fatiha_forward sequence defined', () => {
    expect(STUDY_PLAN_SEQUENCES.fatiha_forward).toBeDefined()
    expect(STUDY_PLAN_SEQUENCES.fatiha_forward.length).toBeGreaterThan(0)
    expect(STUDY_PLAN_SEQUENCES.fatiha_forward[0]).toBe(1)  // Al-Fatiha
    expect(STUDY_PLAN_SEQUENCES.fatiha_forward[1]).toBe(112) // Al-Ikhlas
  })

  it('should have al_fatiha_only sequence defined', () => {
    expect(STUDY_PLAN_SEQUENCES.al_fatiha_only).toBeDefined()
    expect(STUDY_PLAN_SEQUENCES.al_fatiha_only).toEqual([1])
  })

  it('should have short_surahs sequence defined', () => {
    expect(STUDY_PLAN_SEQUENCES.short_surahs).toBeDefined()
    expect(STUDY_PLAN_SEQUENCES.short_surahs).toEqual([108, 109, 110, 111, 112, 113, 114])
  })

  it('should have ikhlas_nas sequence defined', () => {
    expect(STUDY_PLAN_SEQUENCES.ikhlas_nas).toBeDefined()
    expect(STUDY_PLAN_SEQUENCES.ikhlas_nas).toEqual([112, 113, 114])
  })

  it('should have empty sequence for juz_amma (uses range)', () => {
    expect(STUDY_PLAN_SEQUENCES.juz_amma).toBeDefined()
    expect(STUDY_PLAN_SEQUENCES.juz_amma).toEqual([])
  })

  it('should have empty sequence for custom (uses range)', () => {
    expect(STUDY_PLAN_SEQUENCES.custom).toBeDefined()
    expect(STUDY_PLAN_SEQUENCES.custom).toEqual([])
  })
})
