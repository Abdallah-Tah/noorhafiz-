// ── Guided Recording Engine ──────────────────────────────
// Apple-style guided recording for kids: noise check → countdown → auto-record → silence stop

export type RecordingMode = 'guided' | 'manual'

const STORAGE_KEY = 'nh-recording-mode'

export function getRecordingMode(): RecordingMode {
  return (localStorage.getItem(STORAGE_KEY) as RecordingMode) || 'guided'
}

export function setRecordingMode(mode: RecordingMode) {
  localStorage.setItem(STORAGE_KEY, mode)
}

// ── Configuration ──

export const GUIDED_CONFIG = {
  noiseThresholdRms: 0.015,
  // Speech start: RMS must exceed this before silence detection begins.
  speechThresholdRms: 0.03,
  // Silence declaration: RMS must drop below this (hysteresis gap avoids ambient noise
  // continuously masking end-of-speech — set below typical room noise floor).
  silenceThresholdRms: 0.012,
  // How long continuous silence must persist before auto-stop.
  silenceStopMs: 1500,
  // Minimum recording length before silence can trigger auto-stop.
  minRecordingMs: 2000,
  // How long to wait for any speech before giving up.
  noSpeechTimeoutMs: 8000,
  // Hard ceiling — force stop even if speech is still detected.
  maxDurationMs: 20000,
  noiseCheckDurationMs: 1000,
  countdownSeconds: 3,
} as const

// Noise level thresholds for the quiet check
// avgRms ≤ 0.025: low (normal MacBook room)
// avgRms ≤ 0.045: medium (some background)
// avgRms > 0.045 or peak > 0.25: high (strong noise)
export const NOISE_LEVELS = {
  low: { avgThreshold: 0.025, label: 'low' as const },
  medium: { avgThreshold: 0.045, peakThreshold: 0.25, label: 'medium' as const },
  high: { avgThreshold: 0.045, peakThreshold: 0.25, label: 'high' as const },
} as const

export type NoiseLevel = 'low' | 'medium' | 'high'

// ── Audio Analyser ──

export interface AudioAnalyserSetup {
  context: AudioContext
  analyser: AnalyserNode
  cleanup: () => void
}

export function createAudioAnalyser(stream: MediaStream): AudioAnalyserSetup {
  const context = new AudioContext()
  const source = context.createMediaStreamSource(stream)
  const analyser = context.createAnalyser()
  analyser.fftSize = 2048
  analyser.smoothingTimeConstant = 0.3
  source.connect(analyser)

  return {
    context,
    analyser,
    cleanup: () => {
      try {
        source.disconnect()
        analyser.disconnect()
        if (context.state !== 'closed') context.close()
      } catch {
        // ignore cleanup errors
      }
    },
  }
}

/**
 * Compute RMS (root mean square) from the analyser's time-domain data.
 * Returns 0–1 where higher values indicate more audio energy.
 */
export function computeRms(analyser: AnalyserNode): number {
  const buffer = new Float32Array(analyser.fftSize)
  analyser.getFloatTimeDomainData(buffer)

  let sum = 0
  for (let i = 0; i < buffer.length; i++) {
    sum += buffer[i] * buffer[i]
  }
  return Math.sqrt(sum / buffer.length)
}

// ── Noise Check ──

export interface NoiseCheckResult {
  avgRms: number
  peakRms: number
  /** 'low' = quiet enough, 'medium' = some noise (warn but allow), 'high' = too noisy */
  level: NoiseLevel
}

function classifyNoise(avgRms: number, peakRms: number): NoiseLevel {
  if (avgRms > NOISE_LEVELS.high.avgThreshold || peakRms > NOISE_LEVELS.high.peakThreshold) {
    return 'high'
  }
  if (avgRms > NOISE_LEVELS.medium.avgThreshold || peakRms > NOISE_LEVELS.medium.peakThreshold) {
    return 'medium'
  }
  return 'low'
}

/**
 * Run a brief noise check by sampling RMS from the microphone stream.
 * Returns low/medium/high noise classification so the UI can decide
 * whether to proceed, warn, or block.
 */
export async function runNoiseCheck(
  stream: MediaStream,
  durationMs: number = GUIDED_CONFIG.noiseCheckDurationMs,
): Promise<NoiseCheckResult> {
  const { analyser, cleanup } = createAudioAnalyser(stream)

  const samples: number[] = []
  const sampleInterval = 50 // ms
  const totalSamples = Math.floor(durationMs / sampleInterval)

  return new Promise((resolve) => {
    let count = 0

    const interval = setInterval(() => {
      const rms = computeRms(analyser)
      samples.push(rms)
      count++

      if (count >= totalSamples) {
        clearInterval(interval)
        cleanup()

        const avgRms = samples.reduce((a, b) => a + b, 0) / samples.length
        const peakRms = Math.max(...samples)
        const level = classifyNoise(avgRms, peakRms)
        resolve({ avgRms, peakRms, level })
      }
    }, sampleInterval)
  })
}

// ── Silence Detection Loop ──

export interface SilenceDetectorCallbacks {
  onSpeechDetected: () => void
  onSilenceStop: () => void
  onNoSpeechTimeout: () => void
  onMaxDuration: () => void
  onRmsUpdate: (rms: number) => void
}

/**
 * Start a requestAnimationFrame loop that monitors audio levels and
 * triggers callbacks when speech is detected, silence persists, or
 * max duration is reached.
 *
 * Returns a cleanup function that stops the loop.
 */
export function startSilenceDetection(
  analyser: AnalyserNode,
  callbacks: SilenceDetectorCallbacks,
): () => void {
  const {
    speechThresholdRms,
    silenceStopMs,
    noSpeechTimeoutMs,
    maxDurationMs,
  } = GUIDED_CONFIG

  const startTime = Date.now()
  let speechDetected = false
  let silenceStartTime: number | null = null
  let stopped = false
  let rafId: number

  function tick() {
    if (stopped) return

    const now = Date.now()
    const elapsed = now - startTime
    const rms = computeRms(analyser)

    callbacks.onRmsUpdate(rms)

    // Max duration guard
    if (elapsed >= maxDurationMs) {
      stopped = true
      callbacks.onMaxDuration()
      return
    }

    if (rms > speechThresholdRms) {
      // Speech detected
      if (!speechDetected) {
        speechDetected = true
        callbacks.onSpeechDetected()
      }
      silenceStartTime = null
    } else {
      // Quiet
      if (speechDetected) {
        if (silenceStartTime === null) {
          silenceStartTime = now
        } else if (now - silenceStartTime >= silenceStopMs) {
          stopped = true
          callbacks.onSilenceStop()
          return
        }
      } else if (elapsed >= noSpeechTimeoutMs) {
        // No speech at all after timeout
        stopped = true
        callbacks.onNoSpeechTimeout()
        return
      }
    }

    rafId = requestAnimationFrame(tick)
  }

  rafId = requestAnimationFrame(tick)

  return () => {
    stopped = true
    cancelAnimationFrame(rafId)
  }
}
