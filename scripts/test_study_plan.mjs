// NoorHafiz Study Plan Validation Test Suite
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const SURAH_AYAHS = {
  1: 7, 2: 286, 78: 40, 79: 46, 112: 4, 113: 5, 114: 6,
  108: 3, 103: 3, 110: 3, 109: 6, 105: 5, 106: 4, 107: 7,
};
function getSurahAyahs(s) { return SURAH_AYAHS[s] ?? 0; }

const SEQUENCES = {
  fatiha_forward: [1, 112, 113, 114, 108, 103, 110, 109, 105, 106, 107],
  al_fatiha_only: [1],
  short_surahs: [108, 109, 110, 111, 112, 113, 114],
  ikhlas_nas: [112, 113, 114],
  juz_amma: [],
  custom: [],
  selected_surah: [],
  al_fatiha_then_juz_amma: [],
};

function isAyahInStudyPlan(surah, ayah, preset, startSurah, startAyah, endSurah, endAyah) {
  const surahAyahs = getSurahAyahs(surah);
  if (!surahAyahs || ayah < 1 || ayah > surahAyahs) return false;
  const presetKey = preset === 'al_fatiha_then_juz_amma' ? 'fatiha_forward' : preset;
  const sequence = SEQUENCES[presetKey];
  if (sequence && sequence.length > 0) {
    return sequence.includes(surah);
  }
  if (surah < startSurah || surah > endSurah) return false;
  if (surah === startSurah && ayah < startAyah) return false;
  if (surah === endSurah && ayah > endAyah) return false;
  return true;
}

// ── TESTS ──

const tests = [
  // 1. Al-Fatiha then Short Surahs: Al-Baqarah is OUTSIDE
  { name: '1. Fatiha→Short: Al-Baqarah 2:1 OUTSIDE', fn: () => isAyahInStudyPlan(2, 1, 'fatiha_forward', 1, 1, 114, 6), expect: false },
  { name: '1b. Fatiha→Short: Al-Fatiha 1:3 INSIDE', fn: () => isAyahInStudyPlan(1, 3, 'fatiha_forward', 1, 1, 114, 6), expect: true },
  { name: '1c. Fatiha→Short: Al-Ikhlas 112:1 INSIDE', fn: () => isAyahInStudyPlan(112, 1, 'fatiha_forward', 1, 1, 114, 6), expect: true },
  { name: '1d. Fatiha→Short: An-Nas 114:6 INSIDE', fn: () => isAyahInStudyPlan(114, 6, 'fatiha_forward', 1, 1, 114, 6), expect: true },
  { name: '1e. Fatiha→Short via alias: Al-Baqarah 2:1 OUTSIDE', fn: () => isAyahInStudyPlan(2, 1, 'al_fatiha_then_juz_amma', 1, 1, 114, 6), expect: false },

  // 2. Al-Fatiha only
  { name: '2. Fatiha only: Al-Fatiha 1:5 INSIDE', fn: () => isAyahInStudyPlan(1, 5, 'al_fatiha_only', 1, 1, 1, 7), expect: true },
  { name: '2b. Fatiha only: Al-Fatiha 1:7 INSIDE', fn: () => isAyahInStudyPlan(1, 7, 'al_fatiha_only', 1, 1, 1, 7), expect: true },
  { name: '2c. Fatiha only: Al-Baqarah 2:1 OUTSIDE', fn: () => isAyahInStudyPlan(2, 1, 'al_fatiha_only', 1, 1, 1, 7), expect: false },

  // 3. Ikhlas→Nas
  { name: '3. Ikhlas→Nas: Al-Ikhlas 112:4 INSIDE', fn: () => isAyahInStudyPlan(112, 4, 'ikhlas_nas', 112, 1, 114, 6), expect: true },
  { name: '3b. Ikhlas→Nas: Al-Falaq 113:3 INSIDE', fn: () => isAyahInStudyPlan(113, 3, 'ikhlas_nas', 112, 1, 114, 6), expect: true },
  { name: '3c. Ikhlas→Nas: Al-Fatiha 1:1 OUTSIDE', fn: () => isAyahInStudyPlan(1, 1, 'ikhlas_nas', 112, 1, 114, 6), expect: false },

  // 4. Custom Range 1:3→1:5
  { name: '4. Custom 1:3-1:5: ayah 4 INSIDE', fn: () => isAyahInStudyPlan(1, 4, 'custom', 1, 3, 1, 5), expect: true },
  { name: '4b. Custom 1:3-1:5: ayah 6 OUTSIDE', fn: () => isAyahInStudyPlan(1, 6, 'custom', 1, 3, 1, 5), expect: false },
  { name: '4c. Custom 1:3-1:5: ayah 2 OUTSIDE', fn: () => isAyahInStudyPlan(1, 2, 'custom', 1, 3, 1, 5), expect: false },

  // 5. Juz Amma
  { name: '5. Juz Amma: surah 78 INSIDE', fn: () => isAyahInStudyPlan(78, 1, 'juz_amma', 78, 1, 114, 6), expect: true },
  { name: '5b. Juz Amma: surah 79 INSIDE', fn: () => isAyahInStudyPlan(79, 1, 'juz_amma', 78, 1, 114, 6), expect: true },
  { name: '5c. Juz Amma: Al-Fatiha 1:1 OUTSIDE', fn: () => isAyahInStudyPlan(1, 1, 'juz_amma', 78, 1, 114, 6), expect: false },
  { name: '5d. Juz Amma: An-Nas 114:7 OUTSIDE (no ayah 7)', fn: () => isAyahInStudyPlan(114, 7, 'juz_amma', 78, 1, 114, 6), expect: false },

  // 6. Selected surah (Al-Fatiha)
  { name: '6. Selected: Al-Fatiha 1:3 INSIDE', fn: () => isAyahInStudyPlan(1, 3, 'selected_surah', 1, 1, 1, 7), expect: true },
  { name: '6b. Selected: Al-Ikhlas 112:1 OUTSIDE', fn: () => isAyahInStudyPlan(112, 1, 'selected_surah', 1, 1, 1, 7), expect: false },
];

let passed = 0, failed = 0;
for (const t of tests) {
  const result = t.fn();
  const ok = result === t.expect;
  console.log(`${ok ? '✅' : '❌'} ${t.name}${!ok ? `\n   Expected: ${t.expect}, Got: ${result}` : ''}`);
  ok ? passed++ : failed++;
}

console.log(`\n${passed}/${tests.length} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
