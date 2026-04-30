// Quran audio from EveryAyah
// Format: https://everyayah.com/data/{RECITER}/{SSS}{AAA}.mp3
// Transliteration source: quran-json package, sourced from Tanzil.net.

// Audio proxied through backend to avoid CORS
const TEXT_API = '/nh/api/quran/ayah'

// ── Bismillah helpers ──

/** Standard Uthmani Bismillah for display as surah header */
export const BISMILLAH_ARABIC = '\u0628\u0650\u0633\u0652\u0645\u0650 \u0671\u0644\u0644\u064E\u0647\u0650 \u0671\u0644\u0631\u064E\u0651\u062D\u0652\u0645\u064E\u0670\u0646\u0650 \u0671\u0644\u0631\u064E\u0651\u062D\u0650\u06CC\u0645\u0650'

export const BISMILLAH_TRANSLITERATION = 'Bismi All\u0101hi Ar-Ra\u1E25m\u0101ni Ar-Ra\u1E25\u012Bm'

/**
 * Normalize Arabic text for matching: strip all diacritics,
 * Quranic marks, and whitespace so we can compare core letters only.
 */
function normalizeForMatch(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/[\u064B-\u065F\u0610-\u061A\u06D6-\u06ED\u0670\u06E1\u0640]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/** The Bismillah core text (diacritic-free) used for matching */
const BISMILLAH_CORE = normalizeForMatch(BISMILLAH_ARABIC)

/**
 * Al-Fatiha Ayah 1 IS the Bismillah (numbered ayah).
 */
export function isBismillahAyah(surah: number, ayah: number): boolean {
  return surah === 1 && ayah === 1
}

/**
 * Show Bismillah as an unnumbered header before Ayah 1 for all surahs
 * except Al-Fatiha (where it IS the ayah) and At-Tawbah (no Bismillah).
 */
export function shouldShowBismillahHeader(surah: number, ayah: number): boolean {
  return surah !== 1 && surah !== 9 && ayah === 1
}

/**
 * Strip a leading Bismillah from Arabic text using normalization.
 * Handles all common script variants (Uthmani, simplified, with/without diacritics).
 */
function stripBismillahFromArabic(text: string): string {
  const trimmed = text.trimStart()
  const norm = normalizeForMatch(trimmed)
  if (!norm.startsWith(BISMILLAH_CORE)) return text

  // Walk through original text to find where Bismillah ends.
  // We count "core" letters (non-diacritic, non-whitespace) until
  // we've matched all letters of BISMILLAH_CORE.
  let coreMatched = 0
  for (let i = 0; i < trimmed.length; i++) {
    const stripped = normalizeForMatch(trimmed[i])
    if (stripped.length > 0) {
      coreMatched++
      if (coreMatched >= BISMILLAH_CORE.length) {
        // Skip any trailing diacritics on the last core letter
        let end = i + 1
        while (end < trimmed.length && normalizeForMatch(trimmed[end]).length === 0) {
          end++
        }
        // Skip whitespace between Bismillah and first ayah word
        while (end < trimmed.length && /\s/.test(trimmed[end])) {
          end++
        }
        return trimmed.slice(end)
      }
    }
  }

  return text
}

/**
 * Strip Bismillah transliteration from Ayah 1 phonetic if the source includes it.
 */
function stripBismillahFromTransliteration(text: string): string {
  return text
    .replace(/^Bismi\s+Allahi\s+(alrrahmani\s+alrraheemi|Ar-Rahmani\s+Ar-Rahim)\s*/i, '')
    .replace(/^Bismillah[^a-zA-Z]*\s*/i, '')
}

/**
 * Get the display Arabic text for an ayah.
 * - Al-Fatiha Ayah 1: returns raw text as-is (Bismillah IS the ayah)
 * - At-Tawbah: returns raw text as-is (no Bismillah)
 * - All other surahs Ayah 1: strips leading Bismillah
 * - All other ayahs: returns raw text as-is
 */
export function getDisplayArabicAyahText(rawText: string, surah: number, ayah: number): string {
  if (surah === 1 || surah === 9 || ayah !== 1) return rawText
  return stripBismillahFromArabic(rawText)
}

/**
 * Get the display transliteration text for an ayah.
 * Same rules as getDisplayArabicAyahText but for transliteration.
 */
export function getDisplayTransliterationText(rawText: string, surah: number, ayah: number): string {
  if (surah === 1 || surah === 9 || ayah !== 1) return rawText
  return stripBismillahFromTransliteration(rawText)
}

export const RECITERS = [
  { id: 'Alafasy_128kbps', name: 'Mishary Alafasy', short: 'Alafasy' },
  { id: 'Husary_128kbps', name: 'Mahmoud Khalil Al-Husary', short: 'Husary' },
  { id: 'Mohammad_al_Tablaway_128kbps', name: 'Mohammad al-Tablawy', short: 'Tablawy' },
] as const

export type ReciterId = typeof RECITERS[number]['id']

const DEFAULT_RECITER: ReciterId = 'Alafasy_128kbps'

export function getSelectedReciter(): ReciterId {
  return (localStorage.getItem('nh-reciter') as ReciterId) || DEFAULT_RECITER
}

export function setSelectedReciter(id: ReciterId) {
  localStorage.setItem('nh-reciter', id)
}

function pad3(n: number): string {
  return String(n).padStart(3, '0')
}

export function getAyahAudioUrl(surah: number, ayah: number): string {
  const reciter = getSelectedReciter()
  return `/nh/api/quran/audio/${reciter}/${pad3(surah)}${pad3(ayah)}`
}

export async function getAyahText(surah: number, ayah: number): Promise<string> {
  try {
    const res = await fetch(`${TEXT_API}/${surah}:${ayah}`)
    const data = await res.json()
    if (data.code === 200 && data.data?.text) {
      return data.data.text
    }
    return ''
  } catch {
    return ''
  }
}

// Transliteration source: quran-json package, sourced from Tanzil.net.

interface QuranJsonVerse {
  id: number
  text: string
  transliteration: string
}

interface QuranJsonChapter {
  id: number
  name: string
  transliteration: string
  type: string
  total_verses: number
  verses: QuranJsonVerse[]
}

const transliterationCache = new Map<number, Map<number, string> | null>()

export function getPhoneticPreference(): boolean {
  return localStorage.getItem('nh-show-phonetic') !== 'false'
}

export function setPhoneticPreference(show: boolean) {
  localStorage.setItem('nh-show-phonetic', String(show))
}

/**
 * Fetch transliteration for an entire surah from quran-json CDN.
 * Returns a Map of ayah→transliteration, or null on failure.
 * Results are cached in memory per surah.
 */
export async function getSurahTransliteration(surah: number): Promise<Map<number, string> | null> {
  if (transliterationCache.has(surah)) {
    return transliterationCache.get(surah)!
  }

  try {
    const url = `https://cdn.jsdelivr.net/npm/quran-json@3.1.2/dist/chapters/${surah}.json`
    const res = await fetch(url)
    if (!res.ok) {
      transliterationCache.set(surah, null)
      return null
    }
    const chapter: QuranJsonChapter = await res.json()
    const map = new Map<number, string>()
    for (const verse of chapter.verses) {
      if (verse.transliteration) {
        map.set(verse.id, verse.transliteration)
      }
    }
    transliterationCache.set(surah, map)
    return map
  } catch {
    transliterationCache.set(surah, null)
    return null
  }
}

export async function scoreRecitation(
  audioBlob: Blob,
  surah: number,
  ayah: number,
  childId: number,
  durationSeconds: number,
): Promise<{
  accuracy: number
  transcript: string
  reference: string
  normalized_transcript: string
  normalized_reference: string
  feedback: string
  voice_text: string
  should_advance: boolean
  difficulty: string
  threshold: number
  attempt_number: number
  assisted_advance: boolean
  audio_unclear: boolean
  audio_unclear_reason: string | null
  audio_size_bytes: number
  audio_size_kb: number
  duration_seconds: number
  content_type: string
  whisper_model: string
  tutor_memory_event_id: number | null
  details: { correct: number; total: number; missing: any[]; extra: any[]; mistakes: any[] }
}> {
  const token = localStorage.getItem('nh-token')
  const formData = new FormData()
  formData.append('audio', audioBlob, 'recording.webm')
  formData.append('surah', String(surah))
  formData.append('ayah', String(ayah))
  formData.append('child_id', String(childId))
  formData.append('duration_seconds', String(durationSeconds))

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 120000) // 120s timeout (Pi Whisper cold start)

  try {
    const res = await fetch('/nh/api/recite/score', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
      body: formData,
      signal: controller.signal,
    })

    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(err.detail || 'Scoring failed')
    }

    return await res.json()
  } catch (err: any) {
    if (err.name === 'AbortError') {
      throw new Error('Scoring took too long. Please try again.')
    }
    throw err
  } finally {
    clearTimeout(timeout)
  }
}

export async function testMic(audioBlob: Blob, durationSeconds: number): Promise<{
  transcript: string
  normalized_transcript: string
  audio_size_bytes: number
  audio_size_kb: number
  duration_seconds: number
  has_meaningful_arabic: boolean
  audio_unclear: boolean
  audio_unclear_reason: string | null
  content_type: string
  whisper_model: string
}> {
  const token = localStorage.getItem('nh-token')
  const formData = new FormData()
  formData.append('audio', audioBlob, 'test-mic.webm')
  formData.append('duration_seconds', String(durationSeconds))

  const res = await fetch('/nh/api/recite/test-mic', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}` },
    body: formData,
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.detail || 'Mic test failed')
  }

  return res.json()
}

export type AudioResult = {
  played: boolean
  reason?: 'ended' | 'blocked' | 'error' | 'timeout'
}

export function playAudio(url: string): Promise<AudioResult> {
  return new Promise((resolve) => {
    const audio = new Audio(url)
    const timeout = setTimeout(() => {
      audio.pause()
      resolve({ played: false, reason: 'timeout' })
    }, 15000)
    audio.onended = () => { clearTimeout(timeout); resolve({ played: true, reason: 'ended' }) }
    audio.onerror = () => { clearTimeout(timeout); resolve({ played: false, reason: 'error' }) }
    audio.play().then(() => {
      // play started successfully — now we wait for onended
    }).catch(() => {
      clearTimeout(timeout)
      resolve({ played: false, reason: 'blocked' })
    })
  })
}

export type TutorVoice = 'english_male' | 'english_female' | 'arabic_male' | 'arabic_female'

const DEFAULT_TUTOR_VOICE: TutorVoice = 'english_male'

export function getTutorVoice(): TutorVoice {
  return (localStorage.getItem('nh-tutor-voice') as TutorVoice) || DEFAULT_TUTOR_VOICE
}

export function setTutorVoice(voice: TutorVoice) {
  localStorage.setItem('nh-tutor-voice', voice)
}

export type TutorSpeechResult = {
  played: boolean
  source: 'gemini' | 'browser_fallback' | 'none'
  reason?: 'blocked' | 'timeout' | 'http_error' | 'empty_audio' | 'abort' | 'unknown'
}

export type TutorSpeechOptions = {
  fetchTimeoutMs?: number
  fallback?: boolean
}

/**
 * Play tutor feedback using Gemini TTS via backend.
 * Falls back to browser speechSynthesis only when allowed.
 * Returns a detailed result object so callers know exactly what happened.
 *
 * Logging: every step is logged to console with [NoorHafiz TTS] prefix.
 * This makes debugging audio issues trivial.
 */
export async function playTutorFeedback(
  text: string,
  voice?: TutorVoice,
  options: TutorSpeechOptions = {},
): Promise<TutorSpeechResult> {
  console.log('[NoorHafiz TTS] request start')

  if (!text?.trim()) {
    console.log('[NoorHafiz TTS] failed reason=empty_text')
    return { played: false, source: 'none', reason: 'unknown' }
  }

  const tutorVoice = voice || getTutorVoice()
  const lang = tutorVoice.startsWith('arabic') ? 'ar' : 'en'
  const fetchTimeoutMs = options.fetchTimeoutMs ?? 10000
  const allowFallback = options.fallback !== false

  console.log('[NoorHafiz TTS] provider=gemini voice=%s lang=%s', tutorVoice, lang)

  try {
    const token = localStorage.getItem('nh-token')
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), fetchTimeoutMs)

    const res = await fetch('/nh/api/tts/tutor', {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ text, voice: tutorVoice, language: lang }),
    })

    clearTimeout(timeout)

    console.log('[NoorHafiz TTS] backend status=%d', res.status)

    if (!res.ok) {
      console.log('[NoorHafiz TTS] failed reason=http_error (%d)', res.status)
      if (!allowFallback) return { played: false, source: 'none', reason: 'http_error' }
      return playFallbackSpeech(text, lang)
    }

    const blob = await res.blob()
    const audioBytes = blob.size
    console.log('[NoorHafiz TTS] audio bytes=%d', audioBytes)

    if (audioBytes === 0) {
      console.log('[NoorHafiz TTS] failed reason=empty_audio')
      if (!allowFallback) return { played: false, source: 'none', reason: 'empty_audio' }
      return playFallbackSpeech(text, lang)
    }

    const url = URL.createObjectURL(blob)

    try {
      console.log('[NoorHafiz TTS] audio play start')
      const audioResult = await playAudio(url)
      if (audioResult.played) {
        console.log('[NoorHafiz TTS] audio play ended')
        return { played: true, source: 'gemini' }
      }
      console.log('[NoorHafiz TTS] audio blocked reason=%s', audioResult.reason || 'blocked')
      if (!allowFallback) return { played: false, source: 'none', reason: 'blocked' }
      return playFallbackSpeech(text, lang)
    } finally {
      URL.revokeObjectURL(url)
    }
  } catch (err: any) {
    if (err?.name === 'AbortError') {
      console.log('[NoorHafiz TTS] failed reason=abort')
      return { played: false, source: 'none', reason: 'abort' }
    }
    console.log('[NoorHafiz TTS] failed reason=%s', err?.message || 'unknown')
    if (!allowFallback) return { played: false, source: 'none', reason: 'unknown' }
    return playFallbackSpeech(text, lang)
  }
}

/** Browser speechSynthesis fallback with full logging */
async function playFallbackSpeech(text: string, lang: string): Promise<TutorSpeechResult> {
  console.log('[NoorHafiz TTS] fallback speechSynthesis start')
  try {
    if ('speechSynthesis' in window) {
      return await new Promise<TutorSpeechResult>((resolve) => {
        window.speechSynthesis.cancel()
        const utterance = new SpeechSynthesisUtterance(text)
        utterance.rate = 0.9
        utterance.pitch = 1.1
        utterance.lang = lang === 'ar' ? 'ar-SA' : 'en-US'
        const timeout = setTimeout(() => {
          window.speechSynthesis.cancel()
          console.log('[NoorHafiz TTS] fallback speechSynthesis timeout')
          resolve({ played: false, source: 'none', reason: 'timeout' })
        }, 8000)
        utterance.onend = () => {
          clearTimeout(timeout)
          console.log('[NoorHafiz TTS] fallback speechSynthesis ended')
          resolve({ played: true, source: 'browser_fallback' })
        }
        utterance.onerror = () => {
          clearTimeout(timeout)
          console.log('[NoorHafiz TTS] fallback speechSynthesis blocked')
          resolve({ played: false, source: 'none', reason: 'blocked' })
        }
        window.speechSynthesis.speak(utterance)
      })
    }
    console.log('[NoorHafiz TTS] fallback unavailable (no speechSynthesis)')
    return { played: false, source: 'none', reason: 'unknown' }
  } catch {
    console.log('[NoorHafiz TTS] fallback speechSynthesis error')
    return { played: false, source: 'none', reason: 'unknown' }
  }
}

export async function previewTutorVoice(voice: TutorVoice): Promise<TutorSpeechResult> {
  const lang = voice.startsWith('arabic') ? 'ar' : 'en'
  const text = lang === 'ar'
    ? 'مرحبا، أنا معلمك. هيا نتعلم معا!'
    : 'Hello! I am your Quran tutor. Let us learn together!'
  return playTutorFeedback(text, voice)
}

/** Check TTS backend health */
export async function checkTtsHealth(): Promise<{ ok: boolean; provider: string; status: number }> {
  try {
    const token = localStorage.getItem('nh-token')
    const res = await fetch('/nh/api/tts/health', {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
    const data = await res.json().catch(() => ({}))
    return { ok: res.ok, provider: data.provider || 'unknown', status: res.status }
  } catch {
    return { ok: false, provider: 'unknown', status: 0 }
  }
}
