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
): Promise<{
  accuracy: number
  transcript: string
  reference: string
  feedback: string
  voice_text: string
  should_advance: boolean
  difficulty: string
  threshold: number
  attempt_number: number
  assisted_advance: boolean
  details: { correct: number; total: number; missing: any[]; extra: any[]; mistakes: any[] }
}> {
  const token = localStorage.getItem('nh-token')
  const formData = new FormData()
  formData.append('audio', audioBlob, 'recording.webm')
  formData.append('surah', String(surah))
  formData.append('ayah', String(ayah))
  formData.append('child_id', String(childId))

  const res = await fetch('/nh/api/recite/score', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}` },
    body: formData,
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.detail || 'Scoring failed')
  }

  return res.json()
}

export function playAudio(url: string): Promise<void> {
  return new Promise((resolve) => {
    const audio = new Audio(url)
    const timeout = setTimeout(() => {
      audio.pause()
      resolve() // resolve instead of reject — don't hang the flow
    }, 15000) // 15s max for any audio
    audio.onended = () => { clearTimeout(timeout); resolve() }
    audio.onerror = () => { clearTimeout(timeout); resolve() }
    audio.play().catch(() => { clearTimeout(timeout); resolve() }) // autoplay blocked → resolve
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

/**
 * Play tutor feedback using Gemini TTS via backend.
 * Falls back to browser speechSynthesis if backend fails.
 * ALWAYS resolves — never hangs.
 */
export async function playTutorFeedback(
  text: string,
  voice?: TutorVoice,
): Promise<void> {
  if (!text?.trim()) return

  const tutorVoice = voice || getTutorVoice()
  const lang = tutorVoice.startsWith('arabic') ? 'ar' : 'en'

  try {
    const token = localStorage.getItem('nh-token')
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 10000) // 10s timeout

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
      await playAudio(url)
    } finally {
      URL.revokeObjectURL(url)
    }
  } catch (err) {
    console.warn('[NoorHafiz TTS] Backend TTS failed, trying speechSynthesis fallback:', err)
    // Fallback to browser speechSynthesis
    try {
      if ('speechSynthesis' in window) {
        await new Promise<void>((resolve) => {
          window.speechSynthesis.cancel()
          const utterance = new SpeechSynthesisUtterance(text)
          utterance.rate = 0.9
          utterance.pitch = 1.1
          utterance.lang = lang === 'ar' ? 'ar-SA' : 'en-US'
          const timeout = setTimeout(() => {
            window.speechSynthesis.cancel()
            resolve()
          }, 8000) // max 8s for fallback
          utterance.onend = () => { clearTimeout(timeout); resolve() }
          utterance.onerror = () => { clearTimeout(timeout); resolve() }
          window.speechSynthesis.speak(utterance)
        })
      }
    } catch {
      // Give up — at least we resolved
    }
  }
}

export async function previewTutorVoice(voice: TutorVoice): Promise<void> {
  const lang = voice.startsWith('arabic') ? 'ar' : 'en'
  const text = lang === 'ar'
    ? 'مرحبا، أنا معلمك. هيا نتعلم معا!'
    : 'Hello! I am your Quran tutor. Let us learn together!'
  return playTutorFeedback(text, voice)
}
