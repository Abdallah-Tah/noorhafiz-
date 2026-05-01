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
 * Known exact Bismillah variants from different Quran text sources.
 * Longest first so we match the complete prefix.
 */
const BISMILLAH_VARIANTS = [
  // API variant (Uthmani from alquran.cloud / Tanzil)
  // Uses U+06E4 small high meem for sukun, U+06CC farsi yeh
  '\u0628\u0650\u0633\u06E1\u0645\u0650 \u0671\u0644\u0644\u0651\u064E\u0647\u0650 \u0671\u0644\u0631\u0651\u064E\u062D\u06E1\u0645\u064E\u0640\u0670\u0646\u0650 \u0671\u0644\u0631\u0651\u064E\u062D\u0650\u06CC\u0645\u0650',
  // Standard diacritized with U+0652 sukun
  '\u0628\u0650\u0633\u0652\u0645\u0650 \u0671\u0644\u0644\u0651\u064E\u0647\u0650 \u0671\u0644\u0631\u0651\u064E\u062D\u0652\u0645\u064E\u0640\u0670\u0646\u0650 \u0671\u0644\u0631\u0651\u064E\u062D\u0650\u064A\u0645\u0650',
  '\u0628\u0650\u0633\u0652\u0645\u0650 \u0671\u0644\u0644\u0651\u064E\u0647\u0650 \u0671\u0644\u0631\u0651\u064E\u062D\u0652\u0645\u064E\u0670\u0646\u0650 \u0671\u0644\u0631\u0651\u064E\u062D\u0650\u064A\u0645\u0650',
  '\u0628\u0650\u0633\u0652\u0645\u0650 \u0627\u0644\u0644\u0651\u064E\u0647\u0650 \u0627\u0644\u0631\u0651\u064E\u062D\u0652\u0645\u064E\u0670\u0646\u0650 \u0627\u0644\u0631\u0651\u064E\u062D\u0650\u064A\u0645\u0650',
  // Without diacritics
  '\u0628\u0633\u0645 \u0627\u0644\u0644\u0647 \u0627\u0644\u0631\u062D\u0645\u0646 \u0627\u0644\u0631\u062D\u064A\u0645',
  '\u0628\u0633\u0645 \u0671\u0644\u0644\u0647 \u0671\u0644\u0631\u062D\u0645\u0646 \u0671\u0644\u0631\u062D\u064A\u0645',
]

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
 * Strip a leading Bismillah from Arabic text using exact prefix matching.
 * Only removes known exact Bismillah variants; never mutates ayah text.
 */
export function stripBismillahFromArabic(text: string): string {
  const trimmed = text.trimStart()

  for (const variant of BISMILLAH_VARIANTS) {
    if (trimmed.startsWith(variant)) {
      const after = trimmed.slice(variant.length)
      // Trim any trailing separator/spaces after the Bismillah
      return after.replace(/^[ \t\u00A0\u200B-\u200F\uFEFF]+/, '')
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
  const display = stripBismillahFromArabic(rawText)
  if (surah === 112 && ayah === 1) {
    console.log('[Bismillah Debug]')
    console.log('raw=', rawText)
    console.log('display=', display)
    console.log('header=', shouldShowBismillahHeader(surah, ayah))
  }
  return display
}

// Backward-compat aliases for components still using old names
export const stripLeadingBismillah = getDisplayArabicAyahText
export const stripLeadingBismillahTransliteration = getDisplayTransliterationText

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

// Global audio element to prevent overlapping playback
let _globalAudio: HTMLAudioElement | null = null

export function playAudio(url: string): Promise<AudioResult> {
  // Cancel any currently playing audio to prevent overlap
  if (_globalAudio) {
    _globalAudio.pause()
    _globalAudio.src = ''
    _globalAudio = null
  }

  return new Promise((resolve) => {
    const audio = new Audio(url)
    _globalAudio = audio
    let resolved = false
    const timeout = setTimeout(() => {
      if (!resolved) {
        audio.pause()
        resolved = true
        resolve({ played: false, reason: 'timeout' })
      }
    }, 30000) // Increased timeout for longer ayahs
    audio.onended = () => {
      if (!resolved) {
        clearTimeout(timeout)
        resolved = true
        _globalAudio = null
        resolve({ played: true, reason: 'ended' })
      }
    }
    audio.onerror = (e) => {
      if (!resolved) {
        clearTimeout(timeout)
        resolved = true
        _globalAudio = null
        console.log('[NoorHafiz Audio] error event:', e)
        resolve({ played: false, reason: 'error' })
      }
    }
    // play() is invoked exactly once below. The canplaythrough/loadeddata
    // listeners are observability-only — they do not call play() — so we don't
    // log misleading "calling play()" text that suggests a second invocation.
    audio.oncanplaythrough = () => {
      console.log('[NoorHafiz Audio] canplaythrough')
    }
    audio.onloadeddata = () => {
      console.log('[NoorHafiz Audio] loadeddata event fired')
    }
    audio.play().then(() => {
      console.log('[NoorHafiz Audio] play() resolved successfully')
      // play started successfully — now we wait for onended
    }).catch((err) => {
      if (!resolved) {
        clearTimeout(timeout)
        resolved = true
        _globalAudio = null
        console.log('[NoorHafiz Audio] play() rejected:', err)
        resolve({ played: false, reason: 'blocked' })
      }
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
