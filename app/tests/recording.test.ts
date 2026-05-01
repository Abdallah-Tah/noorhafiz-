/**
 * Unit tests for guided recording engine (recording.ts).
 * Covers: getRecordingMode, setRecordingMode, computeRms, runNoiseCheck
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  getRecordingMode,
  setRecordingMode,
  computeRms,
  GUIDED_CONFIG,
} from '../src/lib/recording'

// Simple localStorage mock for test environment
let testStore: Record<string, string> = {}
Object.defineProperty(globalThis, 'localStorage', {
  value: {
    getItem: (key: string) => testStore[key] ?? null,
    setItem: (key: string, value: string) => { testStore[key] = value },
    removeItem: (key: string) => { delete testStore[key] },
  },
  writable: true,
})

describe('Recording Mode', () => {
  beforeEach(() => {
    testStore = {}
  })

  afterEach(() => {
    testStore = {}
  })

  it('defaults to guided when localStorage is empty', () => {
    expect(getRecordingMode()).toBe('guided')
  })

  it('returns manual when set', () => {
    setRecordingMode('manual')
    expect(getRecordingMode()).toBe('manual')
  })

  it('returns guided when set', () => {
    setRecordingMode('guided')
    expect(getRecordingMode()).toBe('guided')
  })

  it('persists across calls', () => {
    setRecordingMode('manual')
    expect(localStorage.getItem('nh-recording-mode')).toBe('manual')
    expect(getRecordingMode()).toBe('manual')
  })
})

describe('GUIDED_CONFIG', () => {
  it('has expected threshold values', () => {
    expect(GUIDED_CONFIG.noiseThresholdRms).toBe(0.015)
    expect(GUIDED_CONFIG.speechThresholdRms).toBe(0.02)
    expect(GUIDED_CONFIG.silenceStopMs).toBe(1500)
    expect(GUIDED_CONFIG.noSpeechTimeoutMs).toBe(5000)
    expect(GUIDED_CONFIG.maxDurationMs).toBe(20000)
    expect(GUIDED_CONFIG.countdownSeconds).toBe(3)
  })
})

describe('computeRms', () => {
  it('returns 0 for silent data (all zeros)', () => {
    const analyser = {
      fftSize: 8,
      getFloatTimeDomainData: vi.fn((arr: Float32Array) => {
        arr.fill(0)
      }),
    } as unknown as AnalyserNode

    expect(computeRms(analyser)).toBe(0)
  })

  it('returns 1 for full-scale square wave', () => {
    const analyser = {
      fftSize: 4,
      getFloatTimeDomainData: vi.fn((arr: Float32Array) => {
        for (let i = 0; i < arr.length; i++) {
          arr[i] = i % 2 === 0 ? 1 : -1
        }
      }),
    } as unknown as AnalyserNode

    // RMS of [1, -1, 1, -1] = sqrt((1+1+1+1)/4) = sqrt(1) = 1
    expect(computeRms(analyser)).toBeCloseTo(1, 5)
  })

  it('returns ~0.5 for half-amplitude constant', () => {
    const analyser = {
      fftSize: 4,
      getFloatTimeDomainData: vi.fn((arr: Float32Array) => {
        arr.fill(0.5)
      }),
    } as unknown as AnalyserNode

    // RMS of constant 0.5 = 0.5
    expect(computeRms(analyser)).toBeCloseTo(0.5, 5)
  })
})
