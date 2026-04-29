export interface Surah {
  number: number
  name: string
  arabic: string
  ayahs: number
  revelation: string
}

export const SURAHS: Surah[] = [
  { number: 1, name: "Al-Fatiha", arabic: "الفاتحة", ayahs: 7, revelation: "Meccan" },
  { number: 2, name: "Al-Baqarah", arabic: "البقرة", ayahs: 286, revelation: "Medinan" },
  { number: 3, name: "Ali 'Imran", arabic: "آل عمران", ayahs: 200, revelation: "Medinan" },
  { number: 4, name: "An-Nisa", arabic: "النساء", ayahs: 176, revelation: "Medinan" },
  { number: 5, name: "Al-Ma'idah", arabic: "المائدة", ayahs: 120, revelation: "Medinan" },
  { number: 6, name: "Al-An'am", arabic: "الأنعام", ayahs: 165, revelation: "Meccan" },
  { number: 7, name: "Al-A'raf", arabic: "الأعراف", ayahs: 206, revelation: "Meccan" },
  { number: 8, name: "Al-Anfal", arabic: "الأنفال", ayahs: 75, revelation: "Medinan" },
  { number: 9, name: "At-Tawbah", arabic: "التوبة", ayahs: 129, revelation: "Medinan" },
  { number: 10, name: "Yunus", arabic: "يونس", ayahs: 109, revelation: "Meccan" },
  { number: 11, name: "Hud", arabic: "هود", ayahs: 123, revelation: "Meccan" },
  { number: 12, name: "Yusuf", arabic: "يوسف", ayahs: 111, revelation: "Meccan" },
  { number: 13, name: "Ar-Ra'd", arabic: "الرعد", ayahs: 43, revelation: "Medinan" },
  { number: 14, name: "Ibrahim", arabic: "إبراهيم", ayahs: 52, revelation: "Meccan" },
  { number: 15, name: "Al-Hijr", arabic: "الحجر", ayahs: 99, revelation: "Meccan" },
  { number: 16, name: "An-Nahl", arabic: "النحل", ayahs: 128, revelation: "Meccan" },
  { number: 17, name: "Al-Isra", arabic: "الإسراء", ayahs: 111, revelation: "Meccan" },
  { number: 18, name: "Al-Kahf", arabic: "الكهف", ayahs: 110, revelation: "Meccan" },
  { number: 19, name: "Maryam", arabic: "مريم", ayahs: 98, revelation: "Meccan" },
  { number: 20, name: "Taha", arabic: "طه", ayahs: 135, revelation: "Meccan" },
  { number: 21, name: "Al-Anbya", arabic: "الأنبياء", ayahs: 112, revelation: "Meccan" },
  { number: 22, name: "Al-Hajj", arabic: "الحج", ayahs: 78, revelation: "Medinan" },
  { number: 23, name: "Al-Mu'minun", arabic: "المؤمنون", ayahs: 118, revelation: "Meccan" },
  { number: 24, name: "An-Nur", arabic: "النور", ayahs: 64, revelation: "Medinan" },
  { number: 25, name: "Al-Furqan", arabic: "الفرقان", ayahs: 77, revelation: "Meccan" },
  { number: 26, name: "Ash-Shu'ara", arabic: "الشعراء", ayahs: 227, revelation: "Meccan" },
  { number: 27, name: "An-Naml", arabic: "النمل", ayahs: 93, revelation: "Meccan" },
  { number: 28, name: "Al-Qasas", arabic: "القصص", ayahs: 88, revelation: "Meccan" },
  { number: 29, name: "Al-Ankabut", arabic: "العنكبوت", ayahs: 69, revelation: "Meccan" },
  { number: 30, name: "Ar-Rum", arabic: "الروم", ayahs: 60, revelation: "Meccan" },
  { number: 31, name: "Luqman", arabic: "لقمان", ayahs: 34, revelation: "Meccan" },
  { number: 32, name: "As-Sajdah", arabic: "السجدة", ayahs: 30, revelation: "Meccan" },
  { number: 33, name: "Al-Ahzab", arabic: "الأحزاب", ayahs: 73, revelation: "Medinan" },
  { number: 34, name: "Saba", arabic: "سبأ", ayahs: 54, revelation: "Meccan" },
  { number: 35, name: "Fatir", arabic: "فاطر", ayahs: 45, revelation: "Meccan" },
  { number: 36, name: "Ya-Sin", arabic: "يس", ayahs: 83, revelation: "Meccan" },
  { number: 37, name: "As-Saffat", arabic: "الصافات", ayahs: 182, revelation: "Meccan" },
  { number: 38, name: "Sad", arabic: "ص", ayahs: 88, revelation: "Meccan" },
  { number: 39, name: "Az-Zumar", arabic: "الزمر", ayahs: 75, revelation: "Meccan" },
  { number: 40, name: "Ghafir", arabic: "غافر", ayahs: 85, revelation: "Meccan" },
  { number: 41, name: "Fussilat", arabic: "فصلت", ayahs: 54, revelation: "Meccan" },
  { number: 42, name: "Ash-Shuraa", arabic: "الشورى", ayahs: 53, revelation: "Meccan" },
  { number: 43, name: "Az-Zukhruf", arabic: "الزخرف", ayahs: 89, revelation: "Meccan" },
  { number: 44, name: "Ad-Dukhan", arabic: "الدخان", ayahs: 59, revelation: "Meccan" },
  { number: 45, name: "Al-Jathiyah", arabic: "الجاثية", ayahs: 37, revelation: "Meccan" },
  { number: 46, name: "Al-Ahqaf", arabic: "الأحقاف", ayahs: 35, revelation: "Meccan" },
  { number: 47, name: "Muhammad", arabic: "محمد", ayahs: 38, revelation: "Medinan" },
  { number: 48, name: "Al-Fath", arabic: "الفتح", ayahs: 29, revelation: "Medinan" },
  { number: 49, name: "Al-Hujurat", arabic: "الحجرات", ayahs: 18, revelation: "Medinan" },
  { number: 50, name: "Qaf", arabic: "ق", ayahs: 45, revelation: "Meccan" },
  { number: 51, name: "Adh-Dhariyat", arabic: "الذاريات", ayahs: 60, revelation: "Meccan" },
  { number: 52, name: "At-Tur", arabic: "الطور", ayahs: 49, revelation: "Meccan" },
  { number: 53, name: "An-Najm", arabic: "النجم", ayahs: 62, revelation: "Meccan" },
  { number: 54, name: "Al-Qamar", arabic: "القمر", ayahs: 55, revelation: "Meccan" },
  { number: 55, name: "Ar-Rahman", arabic: "الرحمن", ayahs: 78, revelation: "Medinan" },
  { number: 56, name: "Al-Waqi'ah", arabic: "الواقعة", ayahs: 96, revelation: "Meccan" },
  { number: 57, name: "Al-Hadid", arabic: "الحديد", ayahs: 29, revelation: "Medinan" },
  { number: 58, name: "Al-Mujadila", arabic: "المجادلة", ayahs: 22, revelation: "Medinan" },
  { number: 59, name: "Al-Hashr", arabic: "الحشر", ayahs: 24, revelation: "Medinan" },
  { number: 60, name: "Al-Mumtahanah", arabic: "الممتحنة", ayahs: 13, revelation: "Medinan" },
  { number: 61, name: "As-Saf", arabic: "الصف", ayahs: 14, revelation: "Medinan" },
  { number: 62, name: "Al-Jumu'ah", arabic: "الجمعة", ayahs: 11, revelation: "Medinan" },
  { number: 63, name: "Al-Munafiqun", arabic: "المنافقون", ayahs: 11, revelation: "Medinan" },
  { number: 64, name: "At-Taghabun", arabic: "التغابن", ayahs: 18, revelation: "Medinan" },
  { number: 65, name: "At-Talaq", arabic: "الطلاق", ayahs: 12, revelation: "Medinan" },
  { number: 66, name: "At-Tahrim", arabic: "التحريم", ayahs: 12, revelation: "Medinan" },
  { number: 67, name: "Al-Mulk", arabic: "الملك", ayahs: 30, revelation: "Meccan" },
  { number: 68, name: "Al-Qalam", arabic: "القلم", ayahs: 52, revelation: "Meccan" },
  { number: 69, name: "Al-Haqqah", arabic: "الحاقة", ayahs: 52, revelation: "Meccan" },
  { number: 70, name: "Al-Ma'arij", arabic: "المعارج", ayahs: 44, revelation: "Meccan" },
  { number: 71, name: "Nuh", arabic: "نوح", ayahs: 28, revelation: "Meccan" },
  { number: 72, name: "Al-Jinn", arabic: "الجن", ayahs: 28, revelation: "Meccan" },
  { number: 73, name: "Al-Muzzammil", arabic: "المزمل", ayahs: 20, revelation: "Meccan" },
  { number: 74, name: "Al-Muddaththir", arabic: "المدثر", ayahs: 56, revelation: "Meccan" },
  { number: 75, name: "Al-Qiyamah", arabic: "القيامة", ayahs: 40, revelation: "Meccan" },
  { number: 76, name: "Al-Insan", arabic: "الإنسان", ayahs: 31, revelation: "Medinan" },
  { number: 77, name: "Al-Mursalat", arabic: "المرسلات", ayahs: 50, revelation: "Meccan" },
  { number: 78, name: "An-Naba", arabic: "النبأ", ayahs: 40, revelation: "Meccan" },
  { number: 79, name: "An-Nazi'at", arabic: "النازعات", ayahs: 46, revelation: "Meccan" },
  { number: 80, name: "Abasa", arabic: "عبس", ayahs: 42, revelation: "Meccan" },
  { number: 81, name: "At-Takwir", arabic: "التكوير", ayahs: 29, revelation: "Meccan" },
  { number: 82, name: "Al-Infitar", arabic: "الانفطار", ayahs: 19, revelation: "Meccan" },
  { number: 83, name: "Al-Mutaffifin", arabic: "المطففين", ayahs: 36, revelation: "Meccan" },
  { number: 84, name: "Al-Inshiqaq", arabic: "الانشقاق", ayahs: 25, revelation: "Meccan" },
  { number: 85, name: "Al-Buruj", arabic: "البروج", ayahs: 22, revelation: "Meccan" },
  { number: 86, name: "At-Tariq", arabic: "الطارق", ayahs: 17, revelation: "Meccan" },
  { number: 87, name: "Al-A'la", arabic: "الأعلى", ayahs: 19, revelation: "Meccan" },
  { number: 88, name: "Al-Ghashiyah", arabic: "الغاشية", ayahs: 26, revelation: "Meccan" },
  { number: 89, name: "Al-Fajr", arabic: "الفجر", ayahs: 30, revelation: "Meccan" },
  { number: 90, name: "Al-Balad", arabic: "البلد", ayahs: 20, revelation: "Meccan" },
  { number: 91, name: "Ash-Shams", arabic: "الشمس", ayahs: 15, revelation: "Meccan" },
  { number: 92, name: "Al-Layl", arabic: "الليل", ayahs: 21, revelation: "Meccan" },
  { number: 93, name: "Ad-Duha", arabic: "الضحى", ayahs: 11, revelation: "Meccan" },
  { number: 94, name: "Ash-Sharh", arabic: "الشرح", ayahs: 8, revelation: "Meccan" },
  { number: 95, name: "At-Tin", arabic: "التين", ayahs: 8, revelation: "Meccan" },
  { number: 96, name: "Al-Alaq", arabic: "العلق", ayahs: 19, revelation: "Meccan" },
  { number: 97, name: "Al-Qadr", arabic: "القدر", ayahs: 5, revelation: "Meccan" },
  { number: 98, name: "Al-Bayyinah", arabic: "البينة", ayahs: 8, revelation: "Medinan" },
  { number: 99, name: "Az-Zalzalah", arabic: "الزلزلة", ayahs: 8, revelation: "Medinan" },
  { number: 100, name: "Al-Adiyat", arabic: "العاديات", ayahs: 11, revelation: "Meccan" },
  { number: 101, name: "Al-Qari'ah", arabic: "القارعة", ayahs: 11, revelation: "Meccan" },
  { number: 102, name: "At-Takathur", arabic: "التكاثر", ayahs: 8, revelation: "Meccan" },
  { number: 103, name: "Al-Asr", arabic: "العصر", ayahs: 3, revelation: "Meccan" },
  { number: 104, name: "Al-Humazah", arabic: "الهمزة", ayahs: 9, revelation: "Meccan" },
  { number: 105, name: "Al-Fil", arabic: "الفيل", ayahs: 5, revelation: "Meccan" },
  { number: 106, name: "Quraysh", arabic: "قريش", ayahs: 4, revelation: "Meccan" },
  { number: 107, name: "Al-Ma'un", arabic: "الماعون", ayahs: 7, revelation: "Meccan" },
  { number: 108, name: "Al-Kawthar", arabic: "الكوثر", ayahs: 3, revelation: "Meccan" },
  { number: 109, name: "Al-Kafirun", arabic: "الكافرون", ayahs: 6, revelation: "Meccan" },
  { number: 110, name: "An-Nasr", arabic: "النصر", ayahs: 3, revelation: "Medinan" },
  { number: 111, name: "Al-Masad", arabic: "المسد", ayahs: 5, revelation: "Meccan" },
  { number: 112, name: "Al-Ikhlas", arabic: "الإخلاص", ayahs: 4, revelation: "Meccan" },
  { number: 113, name: "Al-Falaq", arabic: "الفلق", ayahs: 5, revelation: "Meccan" },
  { number: 114, name: "An-Nas", arabic: "الناس", ayahs: 6, revelation: "Meccan" },
]

export function searchSurahs(query: string): Surah[] {
  const q = query.toLowerCase().trim()
  if (!q) return SURAHS
  return SURAHS.filter(s =>
    s.name.toLowerCase().includes(q) ||
    s.arabic.includes(q) ||
    String(s.number) === q
  )
}

export function getSurah(number: number): Surah | undefined {
  return SURAHS.find(s => s.number === number)
}

// ── Study Plan Sequences ──────────────────────────────────
// Some presets use an explicit surah order instead of Quran order.
// Empty array = fall back to Quran order within the start/end range.

export const STUDY_PLAN_SEQUENCES: Record<string, number[]> = {
  // Al-Fatiha → short surahs (beginner-friendly Juz Amma entry)
  fatiha_forward: [
    1,    // Al-Fatiha
    112,  // Al-Ikhlas
    113,  // Al-Falaq
    114,  // An-Nas
    108,  // Al-Kawthar
    103,  // Al-Asr
    110,  // An-Nasr
    109,  // Al-Kafirun
    105,  // Al-Fil
    106,  // Quraysh
    107,  // Al-Ma'un
    // Remaining Juz Amma (78-111, 101, 102, 104) follows in Quran order
  ],

  // Al-Fatiha only (1:1 → 1:7, then stop/repeat)
  al_fatiha_only: [1],

  // Short surahs first (108-114, Quran order)
  short_surahs: [108, 109, 110, 111, 112, 113, 114],

  // Al-Ikhlas to An-Nas
  ikhlas_nas: [112, 113, 114],

  // Juz Amma = Quran order 78-114 (no explicit sequence needed — range handles it)
  juz_amma: [],

  // Custom range = use exact start/end boundaries
  custom: [],

  // Selected surah only = stay within one surah
  selected_surah: [],

  // Legacy alias — same as fatiha_forward
  al_fatiha_then_juz_amma: [],
}

/**
 * Learning-path-aware next ayah.
 * Respects explicit study-plan sequences (non-Quran-order) for presets like fatiha_forward.
 * Falls back to Quran order within start/end range for presets without explicit sequences.
 */
export function getNextAyahForStudyPlan(
  currentSurah: number,
  currentAyah: number,
  preset: string,
  startSurah: number,
  startAyah: number,
  endSurah: number,
  endAyah: number,
  completionBehavior: string,
): { surah: number; ayah: number } | null {
  const surahData = getSurah(currentSurah)
  if (!surahData) return null

  // Normalize aliases
  const presetKey = preset === 'al_fatiha_then_juz_amma' ? 'fatiha_forward' : preset
  const sequence = STUDY_PLAN_SEQUENCES[presetKey]

  // ── Explicit sequence path ──
  if (sequence && sequence.length > 0) {
    const next = _getNextInSequence(currentSurah, currentAyah, sequence, endSurah, endAyah, completionBehavior, startSurah, startAyah)
    if (next) {
      console.log('[StudyPlan] current=%d:%d preset=%s next=%d:%d (from sequence)', currentSurah, currentAyah, preset, next.surah, next.ayah)
      return next
    }
  }

  // ── Range-based path (Quran order within boundaries) ──
  const next = _getNextInRange(currentSurah, currentAyah, startSurah, startAyah, endSurah, endAyah, completionBehavior)
  if (next) {
    console.log('[StudyPlan] current=%d:%d preset=%s next=%d:%d (from range)', currentSurah, currentAyah, preset, next.surah, next.ayah)
  } else {
    console.log('[StudyPlan] current=%d:%d preset=%s next=null (lesson complete)', currentSurah, currentAyah, preset)
  }
  return next
}

/**
 * Learning-path-aware previous ayah (reverse).
 */
export function getPreviousAyahForStudyPlan(
  currentSurah: number,
  currentAyah: number,
  preset: string,
  startSurah: number,
  startAyah: number,
  _endSurah: number,
  _endAyah: number,
  _completionBehavior: string,
): { surah: number; ayah: number } | null {
  const surahData = getSurah(currentSurah)
  if (!surahData) return null

  const presetKey = preset === 'al_fatiha_then_juz_amma' ? 'fatiha_forward' : preset
  const sequence = STUDY_PLAN_SEQUENCES[presetKey]

  if (sequence && sequence.length > 0) {
    const prev = _getPrevInSequence(currentSurah, currentAyah, sequence)
    if (prev) {
      console.log('[StudyPlan] current=%d:%d preset=%s prev=%d:%d (from sequence)', currentSurah, currentAyah, preset, prev.surah, prev.ayah)
      return prev
    }
  }

  // Fall back to range-based reverse
  return _getPrevInRange(currentSurah, currentAyah, startSurah, startAyah)
}

// ── Internal helpers ──────────────────────────────────────

function _getSurahAyahs(surahNum: number): number {
  return getSurah(surahNum)?.ayahs ?? 0
}

function _getNextInSequence(
  currentSurah: number,
  currentAyah: number,
  sequence: number[],
  endSurah: number,
  endAyah: number,
  completionBehavior: string,
  startSurah: number,
  startAyah: number,
): { surah: number; ayah: number } | null {
  const surahIdx = sequence.indexOf(currentSurah)

  if (surahIdx === -1) {
    // Current surah not in explicit sequence — fall back to range
    return null
  }

  const surahAyahs = _getSurahAyahs(currentSurah)

  // Still within current surah?
  if (currentAyah < surahAyahs) {
    return { surah: currentSurah, ayah: currentAyah + 1 }
  }

  // Last ayah of current surah — find next surah
  let nextIdx = surahIdx + 1

  // If we're at the last surah in the explicit sequence,
  // fall back to Quran order for remaining Juz Amma surahs
  if (nextIdx >= sequence.length) {
    // Sequence exhausted — fall back to range logic starting from where we are
    return _getNextSurahInRange(currentSurah, endSurah, endAyah, completionBehavior, startSurah, startAyah)
  }

  const nextSurah = sequence[nextIdx]
  return { surah: nextSurah, ayah: 1 }
}

function _getPrevInSequence(
  currentSurah: number,
  currentAyah: number,
  sequence: number[],
): { surah: number; ayah: number } | null {
  const surahIdx = sequence.indexOf(currentSurah)

  if (surahIdx === -1) return null

  // Previous ayah within same surah?
  if (currentAyah > 1) {
    return { surah: currentSurah, ayah: currentAyah - 1 }
  }

  // First ayah — go to previous surah in sequence
  if (surahIdx > 0) {
    const prevSurah = sequence[surahIdx - 1]
    return { surah: prevSurah, ayah: _getSurahAyahs(prevSurah) }
  }

  // At start of first surah — nowhere to go back
  return null
}

function _getNextInRange(
  currentSurah: number,
  currentAyah: number,
  startSurah: number,
  startAyah: number,
  endSurah: number,
  endAyah: number,
  completionBehavior: string,
): { surah: number; ayah: number } | null {
  const surahAyahs = _getSurahAyahs(currentSurah)

  // Are we at or past the range boundary (same surah)?
  if (currentSurah === endSurah && currentAyah >= endAyah) {
    return _handleCompletion(completionBehavior, startSurah, startAyah)
  }

  if (currentAyah < surahAyahs) {
    // Still within current surah, and not at the boundary yet
    return { surah: currentSurah, ayah: currentAyah + 1 }
  }

  // Last ayah of current surah — check if we're at the end
  if (currentSurah >= endSurah) {
    return _handleCompletion(completionBehavior, startSurah, startAyah)
  }

  // Find next surah in Quran order
  return _getNextSurahInRange(currentSurah, endSurah, endAyah, completionBehavior, startSurah, startAyah)
}

function _getNextSurahInRange(
  currentSurah: number,
  endSurah: number,
  endAyah: number,
  completionBehavior: string,
  startSurah: number,
  startAyah: number,
): { surah: number; ayah: number } | null {
  // Find next surah in Quran order
  let nextSurah = currentSurah + 1
  while (nextSurah <= endSurah) {
    const data = getSurah(nextSurah)
    if (data) {
      // If nextSurah is the end surah, verify endAyah >= 1
      if (nextSurah === endSurah && endAyah < 1) {
        nextSurah++
        continue
      }
      return { surah: nextSurah, ayah: 1 }
    }
    nextSurah++
  }

  // No more surahs in range — handle completion
  return _handleCompletion(completionBehavior, startSurah, startAyah)
}

function _getPrevInRange(
  currentSurah: number,
  currentAyah: number,
  startSurah: number,
  _startAyah: number,
): { surah: number; ayah: number } | null {
  if (currentAyah > 1) {
    return { surah: currentSurah, ayah: currentAyah - 1 }
  }

  // At ayah 1 — go to previous surah's last ayah
  if (currentSurah > startSurah) {
    let prevSurah = currentSurah - 1
    while (prevSurah >= startSurah) {
      const data = getSurah(prevSurah)
      if (data) {
        return { surah: prevSurah, ayah: data.ayahs }
      }
      prevSurah--
    }
  }

  // At start of range
  return null
}

function _handleCompletion(
  behavior: string,
  startSurah: number,
  startAyah: number,
): { surah: number; ayah: number } | null {
  if (behavior === 'repeat') {
    return { surah: startSurah, ayah: startAyah }
  }
  return null
}

/**
 * Validate that a given surah/ayah position belongs to the assigned Study Plan.
 * Used to detect stale DB state from old broken logic (e.g. Al-Baqarah saved
 * while the child is on Al-Fatiha → Short Surahs).
 */
export function isAyahInStudyPlan(
  surah: number,
  ayah: number,
  preset: string,
  startSurah: number,
  startAyah: number,
  endSurah: number,
  endAyah: number,
): boolean {
  const surahAyahs = _getSurahAyahs(surah)
  // Ayah must be valid for this surah to begin with
  if (!surahAyahs || ayah < 1 || ayah > surahAyahs) return false

  const presetKey = preset === 'al_fatiha_then_juz_amma' ? 'fatiha_forward' : preset
  const sequence = STUDY_PLAN_SEQUENCES[presetKey]

  // ── Presets with explicit surah sequences ──
  // A position is valid if the surah appears in the sequence.
  // Surahs outside the sequence (e.g. Al-Baqarah for fatiha_forward) are
  // only reachable via the old broken Quran-order logic.
  if (sequence && sequence.length > 0) {
    return sequence.includes(surah)
  }

  // ── Range-based presets (juz_amma, custom) ──
  if (surah < startSurah || surah > endSurah) return false
  if (surah === startSurah && ayah < startAyah) return false
  if (surah === endSurah && ayah > endAyah) return false

  return true
}

/** Human-readable sequence description for the Assigned Lesson card */
export function getStudyPlanDescription(preset: string, startSurah: number, endSurah: number): string {
  const presetKey = preset === 'al_fatiha_then_juz_amma' ? 'fatiha_forward' : preset
  const sequence = STUDY_PLAN_SEQUENCES[presetKey]

  if (sequence && sequence.length > 0) {
    if (presetKey === 'al_fatiha_only' || presetKey === 'selected_surah') {
      const name = getSurah(startSurah)?.name || `Surah ${startSurah}`
      return `${name}`
    }
    if (presetKey === 'fatiha_forward') {
      return 'Al-Fatiha → Short Surahs'
    }
    if (presetKey === 'ikhlas_nas') {
      return 'Al-Ikhlas → An-Nas'
    }
    if (presetKey === 'short_surahs') {
      return 'Short Surahs (108–114)'
    }
  }

  if (presetKey === 'juz_amma') {
    return 'Juz Amma (78–114)'
  }
  if (presetKey === 'custom') {
    const s = getSurah(startSurah)?.name || `Surah ${startSurah}`
    const e = getSurah(endSurah)?.name || `Surah ${endSurah}`
    return `${s} → ${e}`
  }

  return `${getSurah(startSurah)?.name || startSurah} → ${getSurah(endSurah)?.name || endSurah}`
}
