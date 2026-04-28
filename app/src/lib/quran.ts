// Quran audio from EveryAyah
// Format: https://everyayah.com/data/{RECITER}/{SSS}{AAA}.mp3

// Audio proxied through backend to avoid CORS
const TEXT_API = '/nh/api/quran/ayah'

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
  const timeout = setTimeout(() => controller.abort(), 30000) // 30s timeout

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

export type TutorSpeechOptions = {
  fetchTimeoutMs?: number
  fallback?: boolean
}

/**
 * Play tutor feedback using Gemini TTS via backend.
 * Falls back to browser speechSynthesis only when allowed.
 * ALWAYS resolves and returns whether speech actually played.
 */
export async function playTutorFeedback(
  text: string,
  voice?: TutorVoice,
  options: TutorSpeechOptions = {},
): Promise<boolean> {
  if (!text?.trim()) return false

  const tutorVoice = voice || getTutorVoice()
  const lang = tutorVoice.startsWith('arabic') ? 'ar' : 'en'
  const fetchTimeoutMs = options.fetchTimeoutMs ?? 10000
  const allowFallback = options.fallback !== false

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

    if (!res.ok) throw new Error(`TTS HTTP ${res.status}`)

    const blob = await res.blob()
    const url = URL.createObjectURL(blob)

    try {
      const result = await playAudio(url)
      return result.played
    } finally {
      URL.revokeObjectURL(url)
    }
  } catch (err) {
    console.warn('[NoorHafiz TTS] Backend TTS failed:', err)
    if (!allowFallback) return false

    try {
      if ('speechSynthesis' in window) {
        return await new Promise<boolean>((resolve) => {
          window.speechSynthesis.cancel()
          const utterance = new SpeechSynthesisUtterance(text)
          utterance.rate = 0.9
          utterance.pitch = 1.1
          utterance.lang = lang === 'ar' ? 'ar-SA' : 'en-US'
          const timeout = setTimeout(() => {
            window.speechSynthesis.cancel()
            resolve(false)
          }, 8000)
          utterance.onend = () => { clearTimeout(timeout); resolve(true) }
          utterance.onerror = () => { clearTimeout(timeout); resolve(false) }
          window.speechSynthesis.speak(utterance)
        })
      }
    } catch {
      // Give up — at least we resolved
    }
    return false
  }
}

export async function previewTutorVoice(voice: TutorVoice): Promise<boolean> {
  const lang = voice.startsWith('arabic') ? 'ar' : 'en'
  const text = lang === 'ar'
    ? 'مرحبا، أنا معلمك. هيا نتعلم معا!'
    : 'Hello! I am your Quran tutor. Let us learn together!'
  return playTutorFeedback(text, voice)
}
