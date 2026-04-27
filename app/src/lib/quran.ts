// Quran audio from EveryAyah (Mishary Alafasy)
// Format: https://everyayah.com/data/Alafasy_128kbps/{SSS}{AAA}.mp3
// SSS = 3-digit surah, AAA = 3-digit ayah

const AUDIO_BASE = 'https://everyayah.com/data/Alafasy_128kbps'
const TEXT_API = 'https://api.alquran.cloud/v1/ayah'

function pad3(n: number): string {
  return String(n).padStart(3, '0')
}

export function getAyahAudioUrl(surah: number, ayah: number): string {
  return `${AUDIO_BASE}/${pad3(surah)}${pad3(ayah)}.mp3`
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

export function playAudio(url: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const audio = new Audio(url)
    audio.onended = () => resolve()
    audio.onerror = () => reject(new Error('Audio failed'))
    audio.play().catch(reject)
  })
}
