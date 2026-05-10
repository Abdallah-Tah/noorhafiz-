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
  source: 'elevenlabs' | 'edge' | 'gemini' | 'openai' | 'browser_fallback' | 'none'
  reason?: 'blocked' | 'timeout' | 'http_error' | 'empty_audio' | 'abort' | 'unknown'
  /** Exact text sent to the TTS engine (post-trim, pre-synthesis). */
  sentText?: string
  /** Voice name reported by the provider (e.g. "ar-SA-HamedNeural", "Algenib", "onyx"). */
  voice?: string
  /** Locale used by the provider (e.g. "ar-SA", "en-US"). */
  language?: string
  /** Pronunciation mode requested by the caller. Tajweed drills use full harakat. */
  readingMode?: 'default' | 'full_harakat'
  /** Provider/browser helper text, shown only when it differs from sentText. */
  spokenText?: string
  /** Backend delivery style; lesson English uses professor. */
  deliveryStyle?: 'default' | 'professor'
  /** True when playback came from a prepared audio URL. */
  preGenerated?: boolean
  /** When source='browser_fallback', whether the browser actually had an
   * Arabic voice. False means the kid heard a non-Arabic voice — the UI
   * should warn. Undefined when source isn't browser_fallback. */
  browserVoiceIsArabic?: boolean
}

export type TutorSpeechOptions = {
  fetchTimeoutMs?: number
  fallback?: boolean
  /** Slow per-letter Arabic articulation. Used for hard-word drill demos. */
  slow?: boolean
  /** Full-harakat drill mode: pronounce final short vowels instead of waqf. */
  readingMode?: 'default' | 'full_harakat'
  /** Professional lesson narration/coaching style. */
  deliveryStyle?: 'default' | 'professor'
}

export type TutorPreparedAudio = {
  ok: boolean
  key: string
  url: string
  content_type: string
  text: string
  voice: string
  provider: 'elevenlabs' | 'edge' | 'gemini' | 'openai' | 'browser_fallback' | 'none' | string
  language: string
  reading_mode: 'default' | 'full_harakat'
  delivery_style: 'default' | 'professor'
  spoken_text?: string | null
  slow: boolean
  cached: boolean
}

const ARABIC_TEXT_RE = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/

function inferTutorLanguage(text: string, voice: TutorVoice): 'ar' | 'en' {
  return voice.startsWith('arabic') || ARABIC_TEXT_RE.test(text) ? 'ar' : 'en'
}

function apiAudioUrl(url: string): string {
  if (url.startsWith('/nh/api/')) return url
  if (url.startsWith('/')) return `/nh/api${url}`
  return url
}

export async function prepareTutorAudio(
  text: string,
  voice?: TutorVoice,
  options: TutorSpeechOptions = {},
): Promise<TutorPreparedAudio | null> {
  const ttsText = text?.trim() || ''
  if (!ttsText) return null

  const tutorVoice = voice || getTutorVoice()
  const language = inferTutorLanguage(ttsText, tutorVoice)
  const slow = options.slow === true
  const readingMode = options.readingMode === 'full_harakat' ? 'full_harakat' : 'default'
  const deliveryStyle = options.deliveryStyle === 'professor' ? 'professor' : 'default'
  const token = localStorage.getItem('nh-token')

  const res = await fetch('/nh/api/tts/audio/prepare', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({
      text: ttsText,
      voice: tutorVoice,
      language,
      slow,
      reading_mode: readingMode,
      delivery_style: deliveryStyle,
    }),
  })

  if (!res.ok) {
    console.log('[NoorHafiz TTS] prepare failed status=%d', res.status)
    return null
  }

  const prepared = await res.json()
  return { ...prepared, url: apiAudioUrl(prepared.url) }
}

export async function playPreparedTutorAudio(prepared: TutorPreparedAudio): Promise<TutorSpeechResult> {
  const audioResult = await playAudio(prepared.url)
  if (!audioResult.played) {
    return {
      played: false,
      source: 'none',
      reason: audioResult.reason === 'timeout' ? 'timeout' : audioResult.reason === 'blocked' ? 'blocked' : 'unknown',
      sentText: prepared.text,
      spokenText: prepared.spoken_text || undefined,
      voice: prepared.voice,
      language: prepared.language,
      readingMode: prepared.reading_mode,
      deliveryStyle: prepared.delivery_style,
      preGenerated: true,
    }
  }
  return {
    played: true,
    source: (prepared.provider as TutorSpeechResult['source']) || 'edge',
    sentText: prepared.text,
    spokenText: prepared.spoken_text || undefined,
    voice: prepared.voice,
    language: prepared.language,
    readingMode: prepared.reading_mode,
    deliveryStyle: prepared.delivery_style,
    preGenerated: true,
  }
}

/**
 * Play tutor feedback using the backend TTS chain.
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

  const ttsText = text?.trim() || ''

  if (!ttsText) {
    console.log('[NoorHafiz TTS] failed reason=empty_text')
    return { played: false, source: 'none', reason: 'unknown' }
  }

  const tutorVoice = voice || getTutorVoice()
  const lang = inferTutorLanguage(ttsText, tutorVoice)
  const fetchTimeoutMs = options.fetchTimeoutMs ?? 10000
  const allowFallback = options.fallback !== false
  const slow = options.slow === true
  const readingMode = options.readingMode === 'full_harakat' ? 'full_harakat' : 'default'
  const deliveryStyle = options.deliveryStyle === 'professor' ? 'professor' : 'default'

  console.log('[NoorHafiz TTS] provider=backend voice=%s lang=%s slow=%s readingMode=%s deliveryStyle=%s', tutorVoice, lang, slow, readingMode, deliveryStyle)

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
      body: JSON.stringify({ text: ttsText, voice: tutorVoice, language: lang, slow, reading_mode: readingMode, delivery_style: deliveryStyle }),
    })

    clearTimeout(timeout)

    const provider = (res.headers.get('X-NH-TTS-Provider') as 'elevenlabs' | 'edge' | 'gemini' | 'openai' | null) || 'elevenlabs'
    const backendVoice = res.headers.get('X-NH-TTS-Voice') || ''
    const backendLang = res.headers.get('X-NH-TTS-Language') || (lang === 'ar' ? 'ar-SA' : 'en-US')
    const backendReadingMode = (res.headers.get('X-NH-TTS-Reading-Mode') as 'default' | 'full_harakat' | null) || readingMode
    const backendSpokenText = res.headers.get('X-NH-TTS-Spoken-Text') || undefined
    const backendDeliveryStyle = (res.headers.get('X-NH-TTS-Delivery-Style') as 'default' | 'professor' | null) || deliveryStyle
    console.log('[NoorHafiz TTS] backend status=%d provider=%s voice=%s lang=%s', res.status, provider, backendVoice, backendLang)

    if (!res.ok) {
      console.log('[NoorHafiz TTS] failed reason=http_error (%d)', res.status)
      if (!allowFallback) return { played: false, source: 'none', reason: 'http_error', sentText: ttsText, readingMode, deliveryStyle }
      return playFallbackSpeech(ttsText, lang, slow, readingMode)
    }

    const blob = await res.blob()
    const audioBytes = blob.size
    console.log('[NoorHafiz TTS] audio bytes=%d', audioBytes)

    if (audioBytes === 0) {
      console.log('[NoorHafiz TTS] failed reason=empty_audio')
      if (!allowFallback) return { played: false, source: 'none', reason: 'empty_audio', sentText: ttsText, readingMode, deliveryStyle }
      return playFallbackSpeech(ttsText, lang, slow, readingMode)
    }

    const url = URL.createObjectURL(blob)

    try {
      console.log('[NoorHafiz TTS] audio play start')
      const audioResult = await playAudio(url)
      if (audioResult.played) {
        console.log('[NoorHafiz TTS] audio play ended')
        return { played: true, source: provider, sentText: ttsText, spokenText: backendSpokenText, voice: backendVoice, language: backendLang, readingMode: backendReadingMode, deliveryStyle: backendDeliveryStyle }
      }
      console.log('[NoorHafiz TTS] audio blocked reason=%s', audioResult.reason || 'blocked')
      if (!allowFallback) return { played: false, source: 'none', reason: 'blocked', sentText: ttsText, readingMode, deliveryStyle }
      return playFallbackSpeech(ttsText, lang, slow, readingMode)
    } finally {
      URL.revokeObjectURL(url)
    }
  } catch (err: any) {
    if (err?.name === 'AbortError') {
      console.log('[NoorHafiz TTS] failed reason=abort')
      return { played: false, source: 'none', reason: 'abort', sentText: ttsText, readingMode, deliveryStyle }
    }
    console.log('[NoorHafiz TTS] failed reason=%s', err?.message || 'unknown')
    if (!allowFallback) return { played: false, source: 'none', reason: 'unknown', sentText: ttsText, readingMode, deliveryStyle }
    return playFallbackSpeech(ttsText, lang, slow, readingMode)
  }
}

/** Pick the best Arabic voice the browser exposes. Tries ar-SA first
 * (Saudi MSA, closest to Quranic recitation), then ar-EG, ar-AE, ar-*.
 * Returns null if the browser has no Arabic voice — caller should warn
 * the user that pronunciation will be incorrect. */
export function selectArabicBrowserVoice(): SpeechSynthesisVoice | null {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return null
  const voices = window.speechSynthesis.getVoices()
  if (!voices.length) return null
  const localePriority = ['ar-SA', 'ar-EG', 'ar-AE', 'ar-JO', 'ar-LB', 'ar-IQ']
  for (const locale of localePriority) {
    const exact = voices.find(v => v.lang === locale)
    if (exact) return exact
  }
  const anyArabic = voices.find(v => v.lang.toLowerCase().startsWith('ar'))
  return anyArabic || null
}

/** All Arabic voices the browser can use — exposed so the debug UI can
 * list them and the user knows what their device supports. */
export function listArabicBrowserVoices(): SpeechSynthesisVoice[] {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return []
  return window.speechSynthesis.getVoices().filter(v => v.lang.toLowerCase().startsWith('ar'))
}

/** Browser speechSynthesis fallback. For Arabic text, explicitly selects
 * an Arabic-locale voice (ar-SA preferred). If the browser has no Arabic
 * voice installed, the result includes browserVoiceIsArabic=false so the
 * UI can warn the user — kid pronunciation would be wrong otherwise. */
async function playFallbackSpeech(
  text: string,
  lang: string,
  slow = false,
  readingMode: 'default' | 'full_harakat' = 'default',
): Promise<TutorSpeechResult> {
  console.log('[NoorHafiz TTS] fallback speechSynthesis start slow=%s lang=%s readingMode=%s', slow, lang, readingMode)
  try {
    if (!('speechSynthesis' in window)) {
      console.log('[NoorHafiz TTS] fallback unavailable (no speechSynthesis)')
      return { played: false, source: 'none', reason: 'unknown', sentText: text, readingMode }
    }

    // Voices may not be loaded yet on first call (Chrome). Wait briefly.
    let voices = window.speechSynthesis.getVoices()
    if (!voices.length) {
      await new Promise<void>(resolve => {
        const ready = () => { voices = window.speechSynthesis.getVoices(); resolve() }
        window.speechSynthesis.addEventListener('voiceschanged', ready, { once: true })
        setTimeout(() => resolve(), 500)
      })
    }

    const isArabic = lang === 'ar'
    let chosenVoice: SpeechSynthesisVoice | null = null
    if (isArabic) {
      chosenVoice = selectArabicBrowserVoice()
      if (!chosenVoice) {
        console.warn('[NoorHafiz TTS] no Arabic voice installed in browser — pronunciation will be incorrect')
      }
    }

    const spokenText = text
    const utteranceLang = isArabic
      ? (chosenVoice?.lang || 'ar-SA')
      : 'en-US'
    const voiceName = chosenVoice?.name || (isArabic ? '(no Arabic voice)' : 'system default')

    return await new Promise<TutorSpeechResult>((resolve) => {
      window.speechSynthesis.cancel()
      const utterance = new SpeechSynthesisUtterance(spokenText)
      utterance.rate = slow ? 0.55 : 0.9
      utterance.pitch = 1.1
      utterance.lang = utteranceLang
      if (chosenVoice) utterance.voice = chosenVoice

      const timeout = setTimeout(() => {
        window.speechSynthesis.cancel()
        console.log('[NoorHafiz TTS] fallback speechSynthesis timeout')
        resolve({ played: false, source: 'none', reason: 'timeout', sentText: text, readingMode, spokenText })
      }, 8000)
      utterance.onend = () => {
        clearTimeout(timeout)
        console.log('[NoorHafiz TTS] fallback speechSynthesis ended voice=%s lang=%s', voiceName, utteranceLang)
        resolve({
          played: true,
          source: 'browser_fallback',
          sentText: text,
          spokenText,
          voice: voiceName,
          language: utteranceLang,
          readingMode,
          browserVoiceIsArabic: isArabic ? !!chosenVoice : undefined,
        })
      }
      utterance.onerror = () => {
        clearTimeout(timeout)
        console.log('[NoorHafiz TTS] fallback speechSynthesis blocked')
        resolve({
          played: false, source: 'none', reason: 'blocked',
          sentText: text, spokenText, voice: voiceName, language: utteranceLang, readingMode,
          browserVoiceIsArabic: isArabic ? !!chosenVoice : undefined,
        })
      }
      window.speechSynthesis.speak(utterance)
    })
  } catch {
    console.log('[NoorHafiz TTS] fallback speechSynthesis error')
    return { played: false, source: 'none', reason: 'unknown', sentText: text, readingMode }
  }
}

export async function previewTutorVoice(voice: TutorVoice): Promise<TutorSpeechResult> {
  const lang = voice.startsWith('arabic') ? 'ar' : 'en'
  const text = lang === 'ar'
    ? 'مرحبا، أنا معلمك. هيا نتعلم معا!'
    : 'Hello! I am your Quran tutor. Let us learn together!'
  return playTutorFeedback(text, voice)
}

export interface TtsProviderHealth {
  configured: boolean
  ok: boolean
  model?: string
  error?: string | null
}

export interface TtsHealthResult {
  ok: boolean
  status: number
  /** Which provider will answer a typical English tutor request. */
  activeProvider: string
  activeProviderArabic: string
  activeProviderEnglish: string
  elevenlabs: TtsProviderHealth
  edge: TtsProviderHealth
  gemini: TtsProviderHealth
  openai: TtsProviderHealth
}

const EMPTY_PROVIDER: TtsProviderHealth = { configured: false, ok: false, error: 'no response' }

/** Check TTS backend health — reports both providers and which is active. */
export async function checkTtsHealth(): Promise<TtsHealthResult> {
  try {
    const token = localStorage.getItem('nh-token')
    const res = await fetch('/nh/api/tts/health', {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
    const data = await res.json().catch(() => ({}))
    return {
      ok: res.ok,
      status: res.status,
      activeProvider: data.active_provider_english || data.active_provider || (data.ok ? data.provider : 'none') || 'none',
      activeProviderArabic: data.active_provider_arabic || 'none',
      activeProviderEnglish: data.active_provider_english || data.active_provider || 'none',
      elevenlabs: data.elevenlabs || EMPTY_PROVIDER,
      edge: data.edge || EMPTY_PROVIDER,
      gemini: data.gemini || EMPTY_PROVIDER,
      openai: data.openai || EMPTY_PROVIDER,
    }
  } catch {
    return {
      ok: false,
      status: 0,
      activeProvider: 'none',
      activeProviderArabic: 'none',
      activeProviderEnglish: 'none',
      elevenlabs: EMPTY_PROVIDER,
      edge: EMPTY_PROVIDER,
      gemini: EMPTY_PROVIDER,
      openai: EMPTY_PROVIDER,
    }
  }
}
