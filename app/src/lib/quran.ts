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
  return new Promise((resolve, reject) => {
    const audio = new Audio(url)
    audio.onended = () => resolve()
    audio.onerror = () => reject(new Error('Audio failed'))
    audio.play().catch(reject)
  })
}
