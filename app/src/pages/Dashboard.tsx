import { useNavigate } from 'react-router-dom'
import { useState, useEffect, useRef } from 'react'
import {
  Moon, LogOut, Mic, BarChart3, Star, Flame,
  Trophy, ChevronRight, Clock, Target,
  CheckCircle2, XCircle, AlertCircle, Users,
  Volume2, Square, RefreshCw, ChevronDown, BookOpen
} from 'lucide-react'
import ThemeToggle from '../components/ThemeToggle'
import { logout, getProfile, getDashboard, updateChild, getAyahMastery, recordPracticePass, submitMemoryCheck, type User, type Child, type PracticeSession, type Mastery } from '../lib/api'
import { getAyahAudioUrl, getAyahText, playAudio, playTutorFeedback, previewTutorVoice, scoreRecitation, RECITERS, getSelectedReciter, setSelectedReciter, getTutorVoice, setTutorVoice, type TutorVoice, type ReciterId, type AudioResult, type TutorSpeechResult, BISMILLAH_ARABIC, shouldShowBismillahHeader, getDisplayArabicAyahText } from '../lib/quran'
import { getTutorPrepMessage, getTutorRecordPrompt, getTutorAudioUnclearMessage, getSurahOnboardingText, getLessonCompleteMessage, getTutorStatusMessage, getTutorTransitionReason, fetchTutorFeedback, pickBestMistake, type TutorContext, type TutorStatusPhase } from '../lib/tutor'
import { getRecordingMode, setRecordingMode, runNoiseCheck, createAudioAnalyser, computeRms, GUIDED_CONFIG, type RecordingMode } from '../lib/recording'
import Settings from '../components/Settings'
import QuranReader from '../components/QuranReader'

import { SURAHS } from '../lib/surahs'
import { getNextAyahForStudyPlan, getStudyPlanDescription, isAyahInStudyPlan, getNextSurahForStudyPlan, getPreviousSurahForStudyPlan, getStartAyahForStudyPlan } from '../lib/surahs'

export default function Dashboard() {
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState<'practice' | 'progress' | 'quran' | 'settings'>('practice')
  const [user, setUser] = useState<User | null>(null)
  const [children, setChildren] = useState<Child[]>([])
  const [selectedChild, setSelectedChild] = useState<Child | null>(null)
  const [recentSessions, setRecentSessions] = useState<PracticeSession[]>([])
  const [loading, setLoading] = useState(true)
  const [practiceStep, setPracticeStep] = useState<'listen' | 'record' | 'result'>('listen')
  const [isPlaying, setIsPlaying] = useState(false)
  const [isRecording, setIsRecording] = useState(false)
  // Loaded ayah text is keyed to the surah:ayah it was fetched for, so a slow
  // response from a previous ayah cannot overwrite the text the child is
  // currently looking at. See loadAyahText() and the render gate below.
  const [loadedAyah, setLoadedAyah] = useState<{ surah: number; ayah: number; text: string } | null>(null)
  const [audioError, setAudioError] = useState('')
  const [reciter, setReciter] = useState<ReciterId>(getSelectedReciter())
  const [autoMode, setAutoMode] = useState(true)
  const [voiceTutor, setVoiceTutor] = useState(true)
  const [tutorVoice, setTutorVoiceState] = useState<TutorVoice>(getTutorVoice())
  const [ayahResults, setAyahResults] = useState<{
    surah: number
    ayah: number
    accuracy: number
    status: string
    feedback?: string
    voiceText?: string
    transcript?: string
    reference?: string
    normalizedTranscript?: string
    normalizedReference?: string
    durationSeconds?: number
    audioSizeBytes?: number
    audioSizeKb?: number
    mistakes?: {expected: string, got: string, position: number}[]
    missing?: {word: string, position: number}[]
    threshold?: number
    difficulty?: string
    attemptNumber?: number
    assistedAdvance?: boolean
    shouldAdvance?: boolean
    childId?: number
    audioUnclear?: boolean
    audioUnclearReason?: string
    whisperModel?: string
    contentType?: string
    selectedMicLabel?: string
    tutorMemoryEventId?: number | null
    _id?: string
  }[]>([])
  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null)
  const [scoring, setScoring] = useState(false)

  // Microphone device selection
  const [micDevices, setMicDevices] = useState<MediaDeviceInfo[]>([])
  const [selectedMicId, setSelectedMicId] = useState<string>(() => localStorage.getItem('nh-mic-device') || '')

  // Recording diagnostics
  const [lastRecordingDuration, setLastRecordingDuration] = useState<number>(0)
  const [lastBlobSize, setLastBlobSize] = useState<number>(0)
  const [lastBlobMime, setLastBlobMime] = useState<string>('')
  const [micPermission, setMicPermission] = useState<string>('unknown')
  const [showDebug, setShowDebug] = useState(false)
  const [mode, setMode] = useState<'practice' | 'memory-check'>('practice')
  const [currentMastery, setCurrentMastery] = useState<Mastery | null>(null)
  const [memoryCheckResult, setMemoryCheckResult] = useState<{ accuracy: number; feedback: string; memorized: boolean; transcript: string; reference: string; audio_unclear: boolean } | null>(null)
  const [memoryCheckScoring, setMemoryCheckScoring] = useState(false)

  // Toast notification
  const [, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)
  const toastTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  function showToast(message: string, type: 'success' | 'error' = 'success') {
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current)
    setToast({ message, type })
    toastTimeoutRef.current = setTimeout(() => setToast(null), 3000)
  }

  // Child learning settings (synced from selectedChild)
  const [childRepeatEach, setChildRepeatEach] = useState(3)
  const [childMemoryPassScore, setChildMemoryPassScore] = useState(70)
  const [childHideText, setChildHideText] = useState(true)

  // Learning path settings
  const [childLearningPreset, setChildLearningPreset] = useState('fatiha_forward')
  const [childStartSurah, setChildStartSurah] = useState(1)
  const [childStartAyah, setChildStartAyah] = useState(1)
  const [childEndSurah, setChildEndSurah] = useState(114)
  const [childEndAyah, setChildEndAyah] = useState(6)
  const [childCompletionBehavior, setChildCompletionBehavior] = useState('stop')
  const [debugMode, setDebugMode] = useState(() => localStorage.getItem('nh-debug') === 'true')
  const [micTestResult, setMicTestResult] = useState<string | null>(null)
  const [micTesting, setMicTesting] = useState(false)
  const [recordingMode, setRecordingModeState] = useState<RecordingMode>(getRecordingMode())
  const [guidedState, setGuidedState] = useState<'idle' | 'countdown' | 'recording' | 'stopping' | 'no_speech' | 'noise_warning'>('idle')
  const [countdownValue, setCountdownValue] = useState(3)
  const [showManualStartFallback, setShowManualStartFallback] = useState(false)
  const [recordingDiagnostics, setRecordingDiagnostics] = useState({
    avgVolume: 0,
    peakVolume: 0,
    speechDetected: false,
    silenceStopTriggered: false,
    noSpeechTriggered: false,
    maxDurationTriggered: false,
    quietCheckLevel: 0,
  })

  const [recordingPipelineStatus, setRecordingPipelineStatus] = useState<string>('idle')

  // Guided recording refs
  const guidedStreamRef = useRef<MediaStream | null>(null)
  const guidedAudioContextRef = useRef<AudioContext | null>(null)
  const guidedAnalyserRef = useRef<AnalyserNode | null>(null)
  const guidedStopFnRef = useRef<(() => void) | null>(null)
  const guidedRafIdRef = useRef<number | null>(null)
  // Prevents double-triggered guided recordings (e.g. user clicks twice).
  const guidedRecordStartingRef = useRef(false)
  // Timeout handle for the 3s auto-start fallback.
  const guidedTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Auto-enable debug in development
  useEffect(() => {
    if (import.meta.env.DEV && !debugMode) {
      setDebugMode(true)
      localStorage.setItem('nh-debug', 'true')
    }
  }, [])

  // Single source of truth for current ayah - always up to date
  const currentAyahRef = useRef({ surah: 1, ayah: 1 })

  // Target ayah for the current auto-flow — used by repair logic to know which
  // direction to fix sync mismatches (forward to flow, not backward to stale header).
  const flowAyahRef = useRef<{ surah: number; ayah: number } | null>(null)

  // Snapshot of the ayah at the moment recording started. Async onstop / scoring
  // handlers MUST use this, not selectedChild or currentAyahRef, because the
  // child may have advanced by the time those callbacks run.
  const recordingAyahRef = useRef<{ surah: number; ayah: number; text: string } | null>(null)

  // One-line invariant log so we can diff every "current ayah" source at any stage.
  // Header reads selectedChild; ref tracks live navigation; loaded is what's painted;
  // recording is what was sent to scoring; result is what came back.
  function ayahSyncSnapshot() {
    const k = (s: number | undefined, a: number | undefined) =>
      s == null || a == null ? null : `${s}:${a}`
    const last = ayahResults[ayahResults.length - 1]
    return {
      header: k(selectedChild?.current_surah, selectedChild?.current_ayah),
      ref: k(currentAyahRef.current.surah, currentAyahRef.current.ayah),
      loaded: loadedAyah ? k(loadedAyah.surah, loadedAyah.ayah) : null,
      recording: recordingAyahRef.current ? k(recordingAyahRef.current.surah, recordingAyahRef.current.ayah) : null,
      result: last ? k(last.surah, last.ayah) : null,
    }
  }

  function assertAyahSync(stage: string, extra?: Record<string, unknown>) {
    // JSON.stringify so the console renders the full snapshot, not "Object".
    // eslint-disable-next-line no-console
    console.log('[AyahSync]', stage, JSON.stringify({ ...ayahSyncSnapshot(), ...(extra || {}) }))
  }

  /**
   * The recording-readiness gate. Returns true only if header / ref / loaded all
   * point to the same surah:ayah. Otherwise it logs BLOCK_RECORDING, kicks off a
   * reload to repair sync, and returns false. Callers must abort recording on false.
   *
   * Repair direction: if flowAyah exists (auto-advance in progress), repair forward
   * to flowAyah. Otherwise repair to currentAyahRef. Never repair backward to stale header.
   */
  function isAyahReadyToRecord(stage: string): boolean {
    const child = selectedChild
    if (!child) return false
    const ref = currentAyahRef.current
    const loaded = loadedAyah
    const headerKey = `${child.current_surah}:${child.current_ayah}`
    const refKey = `${ref.surah}:${ref.ayah}`
    const loadedKey = loaded ? `${loaded.surah}:${loaded.ayah}` : null

    // Check if all three sources agree
    if (loadedKey === headerKey && refKey === headerKey) return true

    // eslint-disable-next-line no-console
    console.log('[AyahSync] BLOCK_RECORDING', stage, JSON.stringify({
      header: headerKey,
      ref: refKey,
      loaded: loadedKey,
    }))

    // Repair direction: flow > ref > header
    // If a flow is active, repair forward to the flow target.
    // Otherwise use currentAyahRef as the source of truth.
    const repairTarget = flowAyahRef.current || ref
    console.log('[AyahSync] repairing to target=%s:%s (flow=%s)', repairTarget.surah, repairTarget.ayah, flowAyahRef.current ? 'yes' : 'no')
    currentAyahRef.current = repairTarget
    void loadAyahText(repairTarget.surah, repairTarget.ayah)
    return false
  }

  // Keep ref in sync with selectedChild
  useEffect(() => {
    if (selectedChild) {
      currentAyahRef.current = { surah: selectedChild.current_surah, ayah: selectedChild.current_ayah }
    }
  }, [selectedChild?.current_surah, selectedChild?.current_ayah])

  useEffect(() => {
    loadData()
  }, [])

  useEffect(() => {
    if (selectedChild) {
      loadAyahText(selectedChild.current_surah, selectedChild.current_ayah)
    }
  }, [selectedChild?.current_surah, selectedChild?.current_ayah])

  // Post-result flow: sequential, guarded by unique result id
  const [flowStatus, setFlowStatus] = useState('')
  const handledResultIds = useRef<Set<string>>(new Set())
  const currentListenCycleRef = useRef(0)  // incremented each time we start a listen→record cycle
  const listenFlowRunningRef = useRef(false)
  const tutorUnavailableUntilRef = useRef(0)

  // Tutor speaking lock - prevents recording while tutor talks
  const [tutorSpeaking, setTutorSpeaking] = useState(false)
  const tutorSpeakingRef = useRef(false)
  useEffect(() => { tutorSpeakingRef.current = tutorSpeaking }, [tutorSpeaking])

  // Tutor context - tracks what just happened so messages sound human
  const tutorActionRef = useRef<'first' | 'move_next' | 'retry' | 'new_surah' | null>(null)
  const lastPassedAyahRef = useRef<{ surah: number; ayah: number } | null>(null)
  const currentRepeatRef = useRef(0) // retries on the same ayah cycle
  // Most recent focus word the tutor named — used to vary feedback across consecutive retries.
  const lastHardWordRef = useRef<string | undefined>(undefined)
  // Tracks the ayah lastHardWordRef belongs to, so we reset when the ayah changes.
  const lastHardWordAyahRef = useRef<{ surah: number; ayah: number } | null>(null)

  // Tutor visible status line (parent-friendly)
  const [tutorStatusText, setTutorStatusText] = useState('')
  const tutorStatusPhaseRef = useRef<TutorStatusPhase>('idle')
  function setTutorPhase(phase: TutorStatusPhase, ctx?: TutorContext) {
    tutorStatusPhaseRef.current = phase
    setTutorStatusText(getTutorStatusMessage(phase, ctx || buildTutorContext()))
  }
  function clearTutorStatus(delayMs = 0) {
    if (delayMs > 0) {
      setTimeout(() => setTutorStatusText(''), delayMs)
    } else {
      setTutorStatusText('')
    }
    tutorStatusPhaseRef.current = 'idle'
  }

  // Transition reason (shown briefly when moving to next ayah)
  const [transitionReason, setTransitionReason] = useState('')

  // Tutor audio status for UI display
  const [tutorAudioStatus, setTutorAudioStatus] = useState<{ source: string; played: boolean; reason?: string } | null>(null)
  const [tutorFeedbackBlocked, setTutorFeedbackBlocked] = useState(false)
  const lastFeedbackTextRef = useRef('')

  function buildTutorContext(overrides?: Partial<TutorContext>): TutorContext {
    const currentAyah = currentAyahRef.current
    const lastPassed = lastPassedAyahRef.current
    const lastResult = ayahResults[ayahResults.length - 1]
    const isMoving = tutorActionRef.current === 'move_next'
    const isRetry = tutorActionRef.current === 'retry'
    const isNew = tutorActionRef.current === 'new_surah'

    // Reset hard-word memory when the active ayah changes
    const tracked = lastHardWordAyahRef.current
    if (!tracked || tracked.surah !== currentAyah.surah || tracked.ayah !== currentAyah.ayah) {
      lastHardWordRef.current = undefined
      lastHardWordAyahRef.current = { surah: currentAyah.surah, ayah: currentAyah.ayah }
    }

    return {
      childName: selectedChild?.name,
      surah: currentAyah.surah,
      ayah: currentAyah.ayah,
      surahName: getSurahName(currentAyah.surah),
      previousAyah: isMoving ? lastPassed?.ayah : undefined,
      previousSurahName: isNew && lastPassed ? getSurahName(lastPassed.surah) : undefined,
      repeatCount: (currentMastery?.practice_pass_count ?? 0) + 1,
      repeatGoal: selectedChild?.repeat_each_ayah ?? 3,
      accuracy: lastResult?.accuracy,
      passed: lastResult && lastResult.accuracy >= (lastResult.threshold || 75),
      audioUnclear: lastResult?.audioUnclear,
      missingWords: lastResult?.missing?.map(m => m.word),
      isRetry,
      isMovingNext: isMoving,
      isNewSurah: isNew,
      isMemoryCheck: mode === 'memory-check',
      memoryCheckPassed: memoryCheckResult?.memorized,
      lastHardWord: lastHardWordRef.current,
      consecutiveFailCount: currentRepeatRef.current,
      ...overrides,
    }
  }

  // Guards: prevent tutor speech when recording/scoring is active
  const practiceStepRef = useRef(practiceStep)
  const isRecordingRef = useRef(isRecording)
  const scoringRef = useRef(scoring)
  useEffect(() => { practiceStepRef.current = practiceStep }, [practiceStep])
  useEffect(() => { isRecordingRef.current = isRecording }, [isRecording])
  useEffect(() => { scoringRef.current = scoring }, [scoring])

  // ── Study plan boundary guard ──────────────────────────
  // Detects stale DB state from old broken Quran-order logic
  // (e.g. Al-Baqarah saved while child is on Al-Fatiha → Short Surahs)
  const isOutsidePlan = selectedChild
    ? !isAyahInStudyPlan(
        selectedChild.current_surah,
        selectedChild.current_ayah,
        selectedChild.learning_path_preset ?? 'fatiha_forward',
        selectedChild.learning_start_surah ?? 1,
        selectedChild.learning_start_ayah ?? 1,
        selectedChild.learning_end_surah ?? 114,
        selectedChild.learning_end_ayah ?? 6,
      )
    : false

  // When current ayah is outside plan, disable auto-mode
  useEffect(() => {
    if (isOutsidePlan && autoMode) {
      setAutoMode(false)
    }
  }, [isOutsidePlan, selectedChild?.id])

  /** Repair: reset current position to the assigned lesson start */
  async function startAssignedLesson() {
    if (!selectedChild) return
    const startSurah = selectedChild.learning_start_surah ?? 1
    const startAyah = selectedChild.learning_start_ayah ?? 1
    await setCurrentPracticeAyah(startSurah, startAyah, selectedChild.id)
    setPracticeStep('listen')
    setAyahResults([])
    setFlowStatus('')
    setAutoMode(false)
  }

  async function handleStartOver() {
    if (!selectedChild) return
    const start = getStartAyahForStudyPlan(
      selectedChild.learning_start_surah ?? 1,
      selectedChild.learning_start_ayah ?? 1,
    )
    console.log('[StudyPlanNav] action=start_over target=%d:%d', start.surah, start.ayah)
    await setCurrentPracticeAyah(start.surah, start.ayah, selectedChild.id)
    setPracticeStep('listen')
    setFlowStatus('')
    setAutoMode(false)
  }

  async function handleNextSurah() {
    if (!selectedChild) return
    const current = selectedChild.current_surah
    const next = getNextSurah(current)
    if (!next) return
    console.log('[StudyPlanNav] action=next_surah current=%d next=%d:%d', current, next.surah, next.ayah)
    await setCurrentPracticeAyah(next.surah, next.ayah, selectedChild.id)
    setPracticeStep('listen')
    setAyahResults([])
    setFlowStatus('')
    setAutoMode(false)
  }

  async function handlePreviousSurah() {
    if (!selectedChild) return
    const current = selectedChild.current_surah
    const prev = getPreviousSurah(current)
    if (!prev) return
    console.log('[StudyPlanNav] action=previous_surah current=%d prev=%d:%d', current, prev.surah, prev.ayah)
    await setCurrentPracticeAyah(prev.surah, prev.ayah, selectedChild.id)
    setPracticeStep('listen')
    setAyahResults([])
    setFlowStatus('')
    setAutoMode(false)
  }

  function sleep(ms: number): Promise<void> {
    return new Promise(r => setTimeout(r, ms))
  }

  // Learning-path-aware next ayah
  function getNextAyah(surah: number, ayah: number): { surah: number; ayah: number } | null {
    return getNextAyahForStudyPlan(
      surah, ayah,
      selectedChild?.learning_path_preset ?? 'fatiha_forward',
      selectedChild?.learning_start_surah ?? 1,
      selectedChild?.learning_start_ayah ?? 1,
      selectedChild?.learning_end_surah ?? 114,
      selectedChild?.learning_end_ayah ?? 6,
      selectedChild?.learning_completion_behavior ?? 'stop',
    )
  }

  // Surah-level navigation within study plan (goes to first ayah of target surah)
  function getNextSurah(surah: number): { surah: number; ayah: number } | null {
    return getNextSurahForStudyPlan(
      surah,
      selectedChild?.learning_path_preset ?? 'fatiha_forward',
      selectedChild?.learning_start_surah ?? 1,
      selectedChild?.learning_start_ayah ?? 1,
      selectedChild?.learning_end_surah ?? 114,
      selectedChild?.learning_end_ayah ?? 6,
    )
  }

  function getPreviousSurah(surah: number): { surah: number; ayah: number } | null {
    return getPreviousSurahForStudyPlan(
      surah,
      selectedChild?.learning_path_preset ?? 'fatiha_forward',
      selectedChild?.learning_start_surah ?? 1,
      selectedChild?.learning_start_ayah ?? 1,
      selectedChild?.learning_end_surah ?? 114,
      selectedChild?.learning_end_ayah ?? 6,
    )
  }

  function getSurahName(surah: number): string {
    return SURAHS.find(s => s.number === surah)?.name || `Surah ${surah}`
  }

  // Short prep for manual-mode text display
  function getPrepText(): string { return getTutorPrepMessage(buildTutorContext()) }

  // The surah onboarding function on the Dashboard side just delegates to tutor.ts
  // (kept for backward compat - used by playSurahOnboarding)

  function onboardingKey(childId: number | undefined, surah: number): string {
    return `nh-onboarding-child-${childId || 'unknown'}-surah-${surah}`
  }

  function shouldShowOnboarding(childId: number | undefined, surah: number): boolean {
    if (!childId) return false
    return localStorage.getItem(onboardingKey(childId, surah)) !== 'done'
  }

  function markOnboardingDone(childId: number | undefined, surah: number) {
    if (!childId) return
    localStorage.setItem(onboardingKey(childId, surah), 'done')
  }

  // Tutor audio lock — prevents overlapping speech
  const tutorAudioPlayingRef = useRef(false)
  const tutorFailureCountRef = useRef(0)

  // No-cooldown reasons: abort, blocked, user action — not provider fault
  const NO_COOLDOWN_REASONS = new Set(['abort', 'blocked'])

  async function playTutorSpeech(text: string, status: string, fetchTimeoutMs = 12000, allowFallback = false): Promise<TutorSpeechResult> {
    const emptyResult: TutorSpeechResult = { played: false, source: 'none', reason: 'unknown' }

    if (!voiceTutor || !text.trim()) {
      console.log('[NoorHafiz Tutor] playTutorSpeech skipped (voiceTutor=%s, textLen=%d)', voiceTutor, text.trim().length)
      return emptyResult
    }

    // Guard: on record step, only allow the record prompt to pass through
    if (practiceStepRef.current === 'record' && status !== 'record prompt') {
      console.log('[NoorHafiz Tutor] skipped because step=record (status=%s)', status)
      return emptyResult
    }

    // Guard: never speak during active recording or scoring
    if (isRecordingRef.current || scoringRef.current) {
      console.log('[NoorHafiz Tutor] skipped because recording/scoring active')
      return emptyResult
    }

    if (Date.now() < tutorUnavailableUntilRef.current) {
      setFlowStatus('Tutor voice unavailable - continuing')
      console.log('[NoorHafiz Tutor] skipped: tutor unavailable until %s', new Date(tutorUnavailableUntilRef.current).toISOString())
      return emptyResult
    }

    // Lock: prevent overlapping tutor speech
    if (tutorAudioPlayingRef.current) {
      console.log('[NoorHafiz Tutor] skipped: another tutor audio still playing')
      return { played: false, source: 'none', reason: 'unknown' }
    }

    tutorAudioPlayingRef.current = true
    setTutorSpeaking(true)
    console.log('[NoorHafiz Tutor] speaking: %s', status)
    setFlowStatus(status)

    try {
      const result = await playTutorFeedback(text, tutorVoice, { fetchTimeoutMs, fallback: allowFallback })

      console.log('[NoorHafiz Tutor] result: played=%s source=%s reason=%s', result.played, result.source, result.reason || 'none')
      setTutorAudioStatus({ source: result.source, played: result.played, reason: result.reason })

      if (!result.played) {
        const reason = result.reason || 'unknown'
        if (NO_COOLDOWN_REASONS.has(reason)) {
          console.log('[NoorHafiz Tutor] %s ignored, no cooldown', reason)
        } else {
          tutorFailureCountRef.current += 1
          const cooldownMs = tutorFailureCountRef.current >= 2 ? 60_000 : 10_000
          console.log('[NoorHafiz Tutor] provider failure (count=%d), cooldown %ds', tutorFailureCountRef.current, cooldownMs / 1000)
          tutorUnavailableUntilRef.current = Date.now() + cooldownMs
          setFlowStatus('Tutor voice unavailable - continuing')
        }
        return result
      }

      // Success resets failure counter
      tutorFailureCountRef.current = 0
      tutorUnavailableUntilRef.current = 0
      return result
    } catch (err: any) {
      if (err?.name === 'AbortError') {
        console.log('[NoorHafiz Tutor] aborted, continuing silently')
      }
      console.log('[NoorHafiz Tutor] result: played=false source=none reason=%s', err?.name || 'error')
      return { played: false, source: 'none', reason: 'unknown' }
    } finally {
      tutorAudioPlayingRef.current = false
      setTutorSpeaking(false)
    }
  }

  async function playSurahOnboarding(child: Child | null, surah: number) {
    if (!voiceTutor || !child?.id) return
    if (!shouldShowOnboarding(child.id, surah)) return
    const ctx = buildTutorContext({ surah, surahName: getSurahName(surah) })
    await playTutorSpeech(getSurahOnboardingText(ctx), 'playing surah welcome', 15000, false)
    markOnboardingDone(child.id, surah)
  }

  async function runAutoListenFlow(surah: number, ayah: number, _child: Child | null, options: { skipTutor?: boolean } = {}) {
    if (listenFlowRunningRef.current) return false
    listenFlowRunningRef.current = true
    currentListenCycleRef.current += 1
    setTutorFeedbackBlocked(false)
    setTutorAudioStatus(null)

    // Set flow target BEFORE any sync checks — repair logic uses this to know direction
    flowAyahRef.current = { surah, ayah }

    // Guard: do not start while loadedAyah is stale
    const flowKey = `${surah}:${ayah}`
    const loadedKey = loadedAyah ? `${loadedAyah.surah}:${loadedAyah.ayah}` : null
    if (loadedKey !== flowKey) {
      console.log('[AyahSync] WAIT_FOR_LOAD flowAyah=%s loaded=%s', flowKey, loadedKey || 'null')
      listenFlowRunningRef.current = false
      return false
    }

    const ctx = buildTutorContext({ surah, ayah, surahName: getSurahName(surah) })
    assertAyahSync('runAutoListenFlow start', { flowAyah: flowKey })

    try {
      // Step 1: optional short prep (context-aware)
      // Real-teacher pacing: skip the prep TTS on plain ayah-to-ayah moves and retries —
      // feedback already announced the transition, and the reference recitation is the cue.
      // Only narrate when there's something genuinely new (first ayah of session / new surah).
      const action = tutorActionRef.current
      const skipPrepTTS = action === 'move_next' || action === 'retry'
      if (!options.skipTutor && voiceTutor && !skipPrepTTS) {
        setFlowStatus('prep')
        setTutorPhase('preparing', ctx)
        await playTutorSpeech(getTutorPrepMessage(ctx), 'prep', 5000, false)
      } else {
        setTutorPhase('preparing', ctx)
      }

      // Step 2: play reference ayah audio
      setFlowStatus(`playing ayah ${ayah}`)
      setTutorPhase('playing_ayah', ctx)
      const audioResult = await playCurrentAyah(surah, ayah)

      if (!audioResult.played) {
        setPracticeStep('listen')
        setFlowStatus(`audio ${audioResult.reason || 'blocked'} - tap Play Recitation to continue`)
        clearTutorStatus()
        return false
      }

      // Step 3: switch to Record step - child sees Record screen immediately
      setPracticeStep('record')
      setTutorPhase('listening', ctx)

      // Step 4: context-aware record prompt
      if (voiceTutor) {
        await playTutorSpeech(getTutorRecordPrompt(ctx), 'record prompt', 5000, false)
      }

      // Step 5: Branch to guided or manual recording
      console.log('[NoorHafiz Flow] recordingMode=%s step=record after prompt', recordingMode)
      if (recordingMode === 'guided') {
        setFlowStatus('guided recording')
        await runGuidedRecording()
        return true
      }

      setFlowStatus('ready to record')
      return true
    } finally {
      listenFlowRunningRef.current = false
    }
  }

  // ── Guided Recording ─────────────────────────────────────

  function cleanupGuidedRecording() {
    if (guidedRafIdRef.current) {
      cancelAnimationFrame(guidedRafIdRef.current)
      guidedRafIdRef.current = null
    }
    if (guidedStopFnRef.current) {
      guidedStopFnRef.current()
      guidedStopFnRef.current = null
    }
    if (guidedAnalyserRef.current) {
      try { guidedAnalyserRef.current.disconnect() } catch {}
      guidedAnalyserRef.current = null
    }
    if (guidedAudioContextRef.current) {
      try { if (guidedAudioContextRef.current.state !== 'closed') guidedAudioContextRef.current.close() } catch {}
      guidedAudioContextRef.current = null
    }
    if (guidedStreamRef.current) {
      guidedStreamRef.current.getTracks().forEach(t => t.stop())
      guidedStreamRef.current = null
    }
    if (guidedTimeoutRef.current) {
      clearTimeout(guidedTimeoutRef.current)
      guidedTimeoutRef.current = null
    }
    setIsRecording(false)
    setMediaRecorder(null)
    setShowManualStartFallback(false)
    guidedRecordStartingRef.current = false
  }

  // ── Shared: start actual MediaRecorder + silence detection ──────────────
  async function startGuidedRecordingFromStream(stream: MediaStream) {
    console.log('[GuidedFlow] state=auto_record_start')
    setGuidedState('recording')
    setRecordingPipelineStatus('recording')

    // Clear fallback timeout — recording actually started.
    if (guidedTimeoutRef.current) {
      clearTimeout(guidedTimeoutRef.current)
      guidedTimeoutRef.current = null
    }
    setShowManualStartFallback(false)

    const recorder = new MediaRecorder(stream)
    const chunks: BlobPart[] = []
    const startTimeMs = Date.now()

    const { analyser, cleanup: analyserCleanup } = createAudioAnalyser(stream)
    guidedAnalyserRef.current = analyser

    recorder.ondataavailable = e => {
      if (e.data.size > 0) chunks.push(e.data)
    }

    recorder.onstop = async () => {
      analyserCleanup()
      cleanupGuidedRecording()

      const durationSec = (Date.now() - startTimeMs) / 1000
      if (chunks.length === 0) {
        setAudioError('I could not hear enough audio. Please try again.')
        setRecordingPipelineStatus('audio too short')
        return
      }

      const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' })
      setLastRecordingDuration(durationSec)
      setLastBlobSize(blob.size)
      setLastBlobMime(blob.type)

      let micLabel = 'default'
      try {
        const devices = await navigator.mediaDevices.enumerateDevices()
        const mics = devices.filter(d => d.kind === 'audioinput')
        if (selectedMicId) {
          const selected = mics.find(d => d.deviceId === selectedMicId)
          micLabel = selected?.label || selectedMicId.slice(0, 8)
        } else {
          const def = mics.find(d => d.deviceId === 'default' || d.deviceId === '') || mics[0]
          micLabel = def?.label || 'default'
        }
      } catch { /* fine */ }

      console.log(
        `[GuidedFlow] duration=${durationSec.toFixed(1)}s ` +
        `size=${blob.size} bytes (${(blob.size / 1024).toFixed(1)} KB) ` +
        `mime=${blob.type} mic="${micLabel}" ` +
        `surah=${selectedChild?.current_surah} ayah=${selectedChild?.current_ayah} ` +
        `child_id=${selectedChild?.id}`,
      )

      if (blob.size < 3000) {
        setAudioError('The recording was too short or empty. Please try again.')
        setRecordingPipelineStatus('audio too short')
        return
      }
      if (durationSec < 1.0) {
        setAudioError('I did not hear enough audio. Please try again.')
        setRecordingPipelineStatus('audio too short')
        return
      }

      console.log('[GuidedFlow] state=sending_to_scoring')
      setScoring(true)
      setRecordingPipelineStatus('sending to scoring')
      setTutorPhase('scoring')

      // The ayah we are scoring is the one captured at recording start, NOT the
      // current selectedChild — that may have changed underneath us.
      const recAyah = recordingAyahRef.current
      if (!recAyah || !selectedChild) {
        console.error('[GuidedFlow] missing recordingAyahRef snapshot — aborting scoring')
        setAudioError('Recording lost track of the ayah. Please try again.')
        setScoring(false)
        setMediaRecorder(null)
        setRecordingPipelineStatus('snapshot missing')
        return
      }
      assertAyahSync('guided before scoring', { sending: `${recAyah.surah}:${recAyah.ayah}` })

      try {
        const result = await scoreRecitation(blob, recAyah.surah, recAyah.ayah, selectedChild.id, durationSec)
        setRecordingPipelineStatus('scoring complete')
        assertAyahSync('guided after scoring', { scored: `${recAyah.surah}:${recAyah.ayah}` })

        const micName = micLabel

        if (result.audio_unclear) {
          const newResult = {
            _id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
            childId: selectedChild.id,
            surah: recAyah.surah,
            ayah: recAyah.ayah,
            accuracy: 0,
            status: 'unclear',
            feedback: result.feedback,
            voiceText: result.voice_text,
            transcript: result.transcript,
            reference: result.reference,
            normalizedTranscript: result.normalized_transcript || '',
            normalizedReference: result.normalized_reference || '',
            durationSeconds: result.duration_seconds || 0,
            audioSizeBytes: result.audio_size_bytes,
            audioSizeKb: result.audio_size_kb,
            mistakes: [] as { expected: string; got: string; position: number }[],
            missing: [] as { word: string; position: number }[],
            threshold: result.threshold || 75,
            difficulty: result.difficulty,
            attemptNumber: 0,
            assistedAdvance: false,
            audioUnclear: true,
            audioUnclearReason: result.audio_unclear_reason ?? undefined,
            whisperModel: result.whisper_model || '',
            contentType: result.content_type || '',
            selectedMicLabel: micName,
            tutorMemoryEventId: result.tutor_memory_event_id ?? null,
          }
          setAyahResults(prev => [...prev, newResult])
          setAudioError('')
          setPracticeStep('result')
          setRecordingPipelineStatus('result shown')
          return
        }

        const threshold = result.threshold || 75
        const scoreStatus = result.accuracy >= 90 ? 'mastered' : result.accuracy >= threshold ? 'practicing' : 'needs-work'
        const newResult = {
          _id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
          childId: selectedChild.id,
          surah: recAyah.surah,
          ayah: recAyah.ayah,
          accuracy: result.accuracy,
          status: scoreStatus,
          feedback: result.feedback,
          voiceText: result.voice_text,
          transcript: result.transcript,
          reference: result.reference,
          normalizedTranscript: result.normalized_transcript || '',
          normalizedReference: result.normalized_reference || '',
          durationSeconds: result.duration_seconds || 0,
          audioSizeBytes: result.audio_size_bytes,
          audioSizeKb: result.audio_size_kb,
          mistakes: result.details?.mistakes || [],
          missing: result.details?.missing || [],
          threshold,
          difficulty: result.difficulty,
          attemptNumber: result.attempt_number,
          assistedAdvance: result.assisted_advance,
          shouldAdvance: result.should_advance,
          audioUnclear: false,
          whisperModel: result.whisper_model || '',
          contentType: result.content_type || '',
          selectedMicLabel: micName,
          tutorMemoryEventId: result.tutor_memory_event_id ?? null,
        }
        setAyahResults(prev => [...prev, newResult])
        setAudioError('')
        setPracticeStep('result')
        setRecordingPipelineStatus('result shown')
      } catch (err: any) {
        console.error('[GuidedFlow] scoring failed:', err)
        setAudioError(err.message || 'Scoring failed. Please check your connection and try again.')
        setRecordingPipelineStatus('scoring failed')
      } finally {
        setScoring(false)
        setMediaRecorder(null)
      }
    }

    // Snapshot from loadedAyah (the painted text) — that is what the child is
    // actually reciting. currentAyahRef can race ahead of selectedChild/loadedAyah
    // due to React state batching, so we don't trust it here. If the three
    // sources disagree, abort: scoring against an ayah the child can't see is
    // worse than asking them to retry.
    if (!isAyahReadyToRecord('guided start')) {
      analyserCleanup()
      cleanupGuidedRecording()
      setAudioError('Loading ayah… please try again in a moment.')
      setRecordingPipelineStatus('blocked: ayah not ready')
      return
    }
    const ready = loadedAyah!
    recordingAyahRef.current = {
      surah: ready.surah,
      ayah: ready.ayah,
      text: ready.text,
    }
    assertAyahSync('guided recording start')

    recorder.start()
    setMediaRecorder(recorder)
    setIsRecording(true)
    console.log('[GuidedFlow] state=media_recorder_started')

    // Silence detection rAF loop
    let speechDetected = false
    let silenceStartTime: number | null = null
    let stopped = false

    const checkLoop = () => {
      if (stopped || !analyser) return
      const now = Date.now()
      const elapsed = now - startTimeMs
      const rms = computeRms(analyser)

      setRecordingDiagnostics(prev => ({ ...prev, avgVolume: rms }))

      if (elapsed >= GUIDED_CONFIG.maxDurationMs) {
        stopped = true
        setRecordingDiagnostics(prev => ({ ...prev, maxDurationTriggered: true }))
        console.log('[GuidedFlow] max_duration_reached')
        recorder.stop()
        return
      }

      if (rms > GUIDED_CONFIG.speechThresholdRms) {
        if (!speechDetected) {
          speechDetected = true
          setRecordingDiagnostics(prev => ({ ...prev, speechDetected: true }))
          console.log('[GuidedFlow] speech_detected')
        }
        silenceStartTime = null
      } else {
        if (speechDetected) {
          if (silenceStartTime === null) {
            silenceStartTime = now
          } else if (now - silenceStartTime >= GUIDED_CONFIG.silenceStopMs) {
            stopped = true
            setRecordingDiagnostics(prev => ({ ...prev, silenceStopTriggered: true }))
            console.log('[GuidedFlow] silence_stop_triggered')
            recorder.stop()
            return
          }
        } else if (elapsed >= GUIDED_CONFIG.noSpeechTimeoutMs) {
          stopped = true
          setRecordingDiagnostics(prev => ({ ...prev, noSpeechTriggered: true }))
          console.log('[GuidedFlow] no_speech_timeout')
          setGuidedState('no_speech')
          recorder.stop()
          return
        }
      }

      if (!stopped) {
        guidedRafIdRef.current = requestAnimationFrame(checkLoop)
      }
    }

    guidedRafIdRef.current = requestAnimationFrame(checkLoop)

    guidedStopFnRef.current = () => {
      stopped = true
      if (recorder.state === 'recording') recorder.stop()
    }
  }

  // ── Orchestrator: full guided flow (noise check → countdown → auto record) ─
  async function runGuidedRecording() {
    console.log('[GuidedFlow] state=record_prompt_start')

    if (guidedRecordStartingRef.current) {
      console.warn('[GuidedFlow] already starting — skipping duplicate call')
      return
    }
    guidedRecordStartingRef.current = true
    setShowManualStartFallback(false)

    if (!selectedChild) {
      console.warn('[GuidedFlow] aborted — selectedChild is null')
      guidedRecordStartingRef.current = false
      return
    }

    setGuidedState('idle')
    setRecordingDiagnostics({
      avgVolume: 0, peakVolume: 0, speechDetected: false,
      silenceStopTriggered: false, noSpeechTriggered: false,
      maxDurationTriggered: false, quietCheckLevel: 0,
    })

    // 3-second timeout fallback: if we reach idle but recording never starts,
    // show a manual-start button so the kid is never stuck.
    if (guidedTimeoutRef.current) clearTimeout(guidedTimeoutRef.current)
    guidedTimeoutRef.current = setTimeout(() => {
      if (guidedRecordStartingRef.current && guidedState !== 'recording' && guidedState !== 'countdown') {
        console.log('[GuidedFlow] auto start timeout — showing manual fallback')
        setShowManualStartFallback(true)
      }
    }, 3000)

    // Step 1: Request microphone
    try {
      const constraints = selectedMicId
        ? { audio: { deviceId: { exact: selectedMicId }, echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 } }
        : { audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 } }
      console.log('[GuidedFlow] requesting_microphone')
      const stream = await navigator.mediaDevices.getUserMedia(constraints)
      guidedStreamRef.current = stream
      console.log('[GuidedFlow] microphone_granted')
      setMicPermission('granted')
    } catch {
      console.error('[GuidedFlow] microphone_denied')
      setMicPermission('denied')
      setAudioError('Microphone access denied. Please allow microphone permission.')
      setRecordingModeState('manual')
      setGuidedState('idle')
      guidedRecordStartingRef.current = false
      return
    }

    const stream = guidedStreamRef.current!

    // Step 2: Noise check
    try {
      const noise = await runNoiseCheck(stream, GUIDED_CONFIG.noiseCheckDurationMs)
      setRecordingDiagnostics(prev => ({ ...prev, quietCheckLevel: noise.avgRms }))
      console.log('[GuidedFlow] noise_check level=%s avgRms=%.4f peakRms=%.4f', noise.level, noise.avgRms, noise.peakRms)

      if (noise.level === 'high') {
        console.log('[GuidedFlow] noise_warning_high')
        setGuidedState('noise_warning')
        if (voiceTutor) {
          const msg = getTutorAudioUnclearMessage('noisy_audio')
          await playTutorSpeech(msg, 'unclear audio guidance', 10000, false)
        }
        return
      }

      if (noise.level === 'medium') {
        console.log('[GuidedFlow] noise_warning_medium')
        setGuidedState('noise_warning')
        if (voiceTutor) {
          const msg = getTutorAudioUnclearMessage('noisy_audio')
          await playTutorSpeech(msg, 'unclear audio guidance', 10000, false)
        }
        return
      }
    } catch (err) {
      console.warn('[GuidedFlow] noise_check_failed, continuing anyway:', err)
    }

    // Step 3: Countdown
    console.log('[GuidedFlow] state=countdown_start')
    for (let i = GUIDED_CONFIG.countdownSeconds; i >= 1; i--) {
      console.log('[GuidedFlow] countdown=%d', i)
      setCountdownValue(i)
      setGuidedState('countdown')
      await sleep(1000)
    }
    console.log('[GuidedFlow] state=beep')

    // Step 4: Auto-start recording
    await startGuidedRecordingFromStream(stream)
  }

  // ── Entry from countdown skip (Record Anyway) ────────────────────────────
  async function runGuidedRecordingFromCountdown() {
    console.log('[GuidedFlow] state=countdown_bypass')
    if (!guidedStreamRef.current) {
      console.warn('[GuidedFlow] no stream for countdown bypass')
      setGuidedState('idle')
      guidedRecordStartingRef.current = false
      return
    }
    await startGuidedRecordingFromStream(guidedStreamRef.current)
  }

  // ── Manual fallback button ────────────────────────────────────────────────
  async function handleManualGuidedStart() {
    console.log('[GuidedFlow] manual_start_clicked')
    setShowManualStartFallback(false)
    if (guidedTimeoutRef.current) {
      clearTimeout(guidedTimeoutRef.current)
      guidedTimeoutRef.current = null
    }
    await runGuidedRecording()
  }

  async function handleGuidedManualStop() {
    console.log('[GuidedFlow] manual_stop_clicked')
    if (guidedStopFnRef.current) {
      guidedStopFnRef.current()
      guidedStopFnRef.current = null
    }
  }

  // handleNoiseCancel removed - unused

  async function handleNoiseRetryQuietCheck() {
    console.log('[GuidedFlow] noise_retry_quiet_check')
    cleanupGuidedRecording()
    setGuidedState('idle')
    await sleep(300)
    await runGuidedRecording()
  }

  async function handleNoiseRecordAnyway() {
    console.log('[GuidedFlow] noise_record_anyway')
    // Countdown then start recording immediately — no idle stuck state.
    for (let i = GUIDED_CONFIG.countdownSeconds; i >= 1; i--) {
      setCountdownValue(i)
      setGuidedState('countdown')
      await sleep(1000)
    }
    await runGuidedRecordingFromCountdown()
  }

  function handleRetryRecording() {
    console.log('[GuidedFlow] retry_from_no_speech')
    cleanupGuidedRecording()
    setGuidedState('idle')
    setAudioError('')
    runGuidedRecording()
  }

  useEffect(() => {
    if (practiceStep !== 'result' || ayahResults.length === 0) return

    const last = ayahResults[ayahResults.length - 1]
    if (!last) return

    const rid = last._id
    if (!rid || handledResultIds.current.has(rid)) return

    // If current ayah is outside the assigned study plan, skip result processing.
    // The ayah was practiced before the plan was assigned/changed — show the
    // repair card instead of auto-advancing.
    if (isOutsidePlan) {
      setAutoMode(false)
      setPracticeStep('listen')
      setFlowStatus('')
      return
    }

    handledResultIds.current.add(rid)

    // If audio was unclear, do NOT auto-advance or trigger any flow
    // Also do NOT increment repeat count or mark pass
    if (last.audioUnclear) {
      setFlowStatus('audio unclear — retry needed')
      tutorActionRef.current = 'retry'
      // Override backend should_advance for unclear audio
      if (voiceTutor) {
        const msg = getTutorAudioUnclearMessage(last.audioUnclearReason || 'default')
        console.log('[NoorHafiz Tutor] speaking: unclear audio guidance reason=%s', last.audioUnclearReason || 'default')
        setTutorPhase('giving_feedback')
        playTutorSpeech(msg, 'unclear audio guidance', 10000, false).catch(() => {})
        // Replace generic backend feedback with the more specific spoken message
        setAyahResults(prev => prev.map(r => r._id === rid ? { ...r, feedback: msg } : r))
      }
      return
    }

    const threshold = last.threshold || 75
    const accuracyPassed = last.accuracy >= threshold
    const assisted = !!last.assistedAdvance
    const passed = accuracyPassed && !last.audioUnclear
    const backendWantsAdvance = !!last.shouldAdvance
    const repeatGoal = selectedChild?.repeat_each_ayah ?? 3
    const rawRepeats = (currentMastery?.practice_pass_count ?? 0) + (accuracyPassed ? 1 : 0)
    // Backend caps practice_pass_count at the goal; frontend mirrors that cap
    // so we never show "4 of 3" or use an over-count in advance logic.
    const goodRepeats = Math.min(rawRepeats, repeatGoal)

    // ── Advance Guard Log ──
    // Frontend owns the decision — backend may send should_advance for beginners
    // but we gate on accuracy >= threshold AND repeat goal met
    let advanceAction: 'retry' | 'repeat_same' | 'move_next' = 'retry'
    if (last.audioUnclear) {
      advanceAction = 'retry'
    } else if (!accuracyPassed) {
      advanceAction = 'retry'
    } else if (accuracyPassed && goodRepeats < repeatGoal) {
      advanceAction = 'repeat_same'
    } else if (accuracyPassed && goodRepeats >= repeatGoal) {
      advanceAction = 'move_next'
    }
    console.log(
      '[AdvanceGuard] accuracy=%d threshold=%d passed=%s assisted=%s backendShouldAdvance=%s repeat=%d/%d action=%s',
      last.accuracy, threshold, passed, assisted, backendWantsAdvance, goodRepeats, repeatGoal, advanceAction,
    )

    // Record backend pass only on genuine accuracy pass
    if (accuracyPassed && selectedChild) {
      recordPracticePass(selectedChild.id, last.surah, last.ayah, last.accuracy).catch(() => {})
      loadCurrentMastery(selectedChild.id, last.surah, last.ayah)
      lastPassedAyahRef.current = { surah: last.surah, ayah: last.ayah }
      // currentRepeatRef tracks consecutive passes on the same ayah, reset on pass
      currentRepeatRef.current = 0
      lastHardWordRef.current = undefined
    } else if (!accuracyPassed) {
      currentRepeatRef.current += 1
      // Track which word the tutor will name in feedback so the next retry can pick a fresh one.
      const missingWords = last.missing?.map(m => m.word) ?? []
      const focus = pickBestMistake(missingWords, {
        surah: last.surah,
        ayah: last.ayah,
        surahName: getSurahName(last.surah),
        lastHardWord: lastHardWordRef.current,
      })
      if (focus) lastHardWordRef.current = focus
    }

    setFlowStatus('waiting')

    const runFlow = async () => {
      try {
        // Pre-compute next ayah so feedback message can name it (e.g. "Moving to Ayah 2")
        const nextAyah = advanceAction === 'move_next'
          ? getNextAyah(last.surah, last.ayah)
          : null

        // Step 1: Play context-aware tutor feedback (NOT raw backend voice_text)
        if (voiceTutor) {
          const feedbackCtx = buildTutorContext({
            accuracy: last.accuracy,
            passed: accuracyPassed,
            audioUnclear: last.audioUnclear,
            missingWords: last.missing?.map(m => m.word),
            repeatCount: goodRepeats,
            nextAyah: nextAyah ?? undefined,
          })
          setTutorPhase('giving_feedback', feedbackCtx)
          const { message: feedbackMsg, source } = await fetchTutorFeedback(last.tutorMemoryEventId ?? null, feedbackCtx)
          lastFeedbackTextRef.current = feedbackMsg
          if (advanceAction === 'move_next') {
            console.log(
              '[MoveNextContext] result=%d:%d next=%s:%s message="%s"',
              last.surah, last.ayah,
              nextAyah?.surah ?? '?', nextAyah?.ayah ?? '?',
              feedbackMsg,
            )
          }
          const speechResult = await playTutorSpeech(feedbackMsg, `playing tutor feedback (${source})`, 12000, false)
          if (!speechResult.played) {
            setTutorFeedbackBlocked(true)
          }
          // Replace the raw scoring feedback with what was actually spoken
          setAyahResults(prev => prev.map(r => r._id === rid ? { ...r, feedback: feedbackMsg } : r))
          setFlowStatus('tutor finished')
          await sleep(600)
        }

        // Step 2: Auto mode behavior
        if (autoMode) {
          if (advanceAction === 'move_next') {
            // PASS + repeat goal met: advance to next ayah (reuse pre-computed next)
            const next = nextAyah
            if (!next) {
              setTutorPhase('lesson_complete')
              const ctx = buildTutorContext()
              await playTutorSpeech(getLessonCompleteMessage(ctx), 'lesson complete', 12000, false)
              setFlowStatus('🎉 Great job! You finished your assigned lesson!')
              setAutoMode(false)
              clearTutorStatus(3000)
              return
            }

            setFlowStatus('advancing')
            const isNewSurah = next.surah !== last.surah
            tutorActionRef.current = isNewSurah ? 'new_surah' : 'move_next'

            // Show transition reason to parent before advancing
            const transitionCtx = buildTutorContext({
              surah: next.surah,
              ayah: next.ayah,
              surahName: getSurahName(next.surah),
              previousAyah: last.ayah,
              previousSurahName: isNewSurah ? getSurahName(last.surah) : undefined,
              repeatCount: goodRepeats,
              isNewSurah,
              isMovingNext: true,
            })
            setTransitionReason(getTutorTransitionReason(transitionCtx))
            setTutorPhase('moving_next', transitionCtx)

            await sleep(600)

            setTransitionReason('')
            setFlowStatus('loading next ayah')
            await setCurrentPracticeAyah(next.surah, next.ayah, last.childId ?? selectedChild?.id)
            setPracticeStep('listen')

            if (isNewSurah) {
              await playSurahOnboarding(selectedChild, next.surah)
            }

            // Wait for React state to flush after loadAyahText — setLoadedAyah is async
            await sleep(100)
            await runAutoListenFlow(next.surah, next.ayah, selectedChild)
          } else if (advanceAction === 'repeat_same' || advanceAction === 'retry') {
            // FAIL or PASS but repeat goal not met: stay on same ayah
            tutorActionRef.current = 'retry'
            setTutorPhase('retrying')
            await sleep(600)
            await runAutoListenFlow(last.surah, last.ayah, selectedChild, { skipTutor: true })
          }
        } else {
          clearTutorStatus()
          setFlowStatus('manual mode')
        }
      } catch (err) {
        setFlowStatus(`flow error: ${err}`)
        clearTutorStatus()
      }
    }

    runFlow()
  }, [practiceStep, ayahResults.length])

  async function loadAyahText(surah: number, ayah: number) {
    // Clear any stale text immediately so the render gate falls back to "Loading…"
    // until the new fetch finishes for the requested key.
    console.log('[ActiveAyah] loading target=%s:%s', surah, ayah)
    setLoadedAyah(null)
    const requestKey = `${surah}:${ayah}`
    const text = await getAyahText(surah, ayah)
    const cur = currentAyahRef.current
    if (`${cur.surah}:${cur.ayah}` !== requestKey) {
      console.log('[AyahSync] stale load discarded requested=%s current=%s:%s', requestKey, cur.surah, cur.ayah)
      return
    }
    const display = getDisplayArabicAyahText(text || 'Arabic text unavailable', surah, ayah)
    setLoadedAyah({ surah, ayah, text: display })
    assertAyahSync('after loadAyahText', { requested: requestKey })
  }

  async function persistCurrentAyah(childId: number | undefined, surah: number, ayah: number) {
    if (!childId) return
    try {
      const updated = await updateChild(childId, { current_surah: surah, current_ayah: ayah })
      // Drop the server's view of current_surah/current_ayah from the merge.
      // Local state already advanced; if a slow response from a previous persist
      // arrives after a newer one, merging those fields would revert the live
      // ayah and re-trigger loadAyahText for the wrong key.
      const { current_surah: _cs, current_ayah: _ca, ...serverFields } = updated
      void _cs; void _ca
      setChildren(prev => prev.map(child => child.id === childId
        ? { ...child, ...serverFields, current_surah: child.current_surah, current_ayah: child.current_ayah }
        : child))
      setSelectedChild(prev => prev?.id === childId
        ? { ...prev, ...serverFields }
        : prev)
    } catch (err) {
      console.warn('[NoorHafiz Progress] Failed to save progress:', err)
      setFlowStatus('progress not saved - check connection')
    }
  }

  async function setCurrentPracticeAyah(surah: number, ayah: number, childId?: number) {
    // Atomic update: clear any prior recording snapshot and painted text so the
    // render gate / record gate fall back to "Loading…" until the new key is
    // both committed in selectedChild and resolved into loadedAyah.
    recordingAyahRef.current = null
    setLoadedAyah(null)
    currentAyahRef.current = { surah, ayah }
    setSelectedChild(prev => prev ? { ...prev, current_surah: surah, current_ayah: ayah } : prev)
    setChildren(prev => prev.map(child => child.id === childId ? { ...child, current_surah: surah, current_ayah: ayah } : child))
    console.log('[ActiveAyah] setting target=%s:%s reason=%s', surah, ayah, tutorActionRef.current || 'unknown')
    assertAyahSync('setCurrentPracticeAyah', { target: `${surah}:${ayah}` })
    await loadAyahText(surah, ayah)
    console.log('[ActiveAyah] ready target=%s:%s loaded=%s:%s', surah, ayah, loadedAyah?.surah, loadedAyah?.ayah)
    assertAyahSync('after setCurrentPracticeAyah', { target: `${surah}:${ayah}` })
    await persistCurrentAyah(childId, surah, ayah)
    if (childId) loadCurrentMastery(childId, surah, ayah)
  }

  async function advanceToNextAyah() {
    if (!selectedChild) return
    // If current ayah is outside the assigned study plan, redirect to lesson start
    if (isOutsidePlan) {
      await startAssignedLesson()
      return
    }
    const next = getNextAyah(currentAyahRef.current.surah, currentAyahRef.current.ayah)
    if (!next) { setFlowStatus('🎉 Great job! You finished your assigned lesson!'); setAutoMode(false); return }
    assertAyahSync('advanceToNextAyah', { from: `${currentAyahRef.current.surah}:${currentAyahRef.current.ayah}`, to: `${next.surah}:${next.ayah}` })
    // Clear the recording snapshot so a stale onstop from the previous ayah cannot
    // be misattributed to the new one if it ever fires late.
    recordingAyahRef.current = null
    await setCurrentPracticeAyah(next.surah, next.ayah, selectedChild.id)
    setPracticeStep('listen')
    setFlowStatus('')
  }

  function changeTutorVoice(v: TutorVoice) {
    setTutorVoiceState(v)
    setTutorVoice(v)
  }

  async function speakFeedback(text: string) {
    // Use Gemini TTS (with browser speechSynthesis fallback)
    const result = await playTutorFeedback(text, tutorVoice)
    console.log('[NoorHafiz Tutor] speakFeedback result: played=%s source=%s reason=%s', result.played, result.source, result.reason || 'none')
  }

  async function handlePlayRecitationClick() {
    const { surah, ayah } = currentAyahRef.current
    assertAyahSync('handlePlayRecitationClick', { willPlay: `${surah}:${ayah}` })
    if (autoMode) {
      const skipTutor = flowStatus.includes('blocked') || flowStatus.includes('tap Play Recitation')
      await runAutoListenFlow(surah, ayah, selectedChild, { skipTutor })
      return
    }

    // Manual mode: play ayah, switch to record, await prompt
    setTutorPhase('playing_ayah')
    const result = await playCurrentAyah(surah, ayah)
    if (!result.played) {
      clearTutorStatus()
      return
    }
    setPracticeStep('record')
    setTutorPhase('listening')
    if (voiceTutor) {
      await playTutorSpeech(getTutorRecordPrompt(buildTutorContext()), 'record prompt', 5000, false)
    }
    // Even in manual autoMode-off, honour the recordingMode setting so guided
    // users get auto-start after the tutor prompt.
    if (recordingMode === 'guided') {
      setFlowStatus('guided recording')
      await runGuidedRecording()
      return
    }
  }

  // Internal: plays audio for given ayah, returns result
  async function playCurrentAyah(explicitSurah?: number, explicitAyah?: number): Promise<AudioResult> {
    const surah = explicitSurah ?? currentAyahRef.current.surah
    const ayah = explicitAyah ?? currentAyahRef.current.ayah
    try {
      setIsPlaying(true)
      setAudioError('')
      const url = getAyahAudioUrl(surah, ayah)
      const result = await playAudio(url)
      return result
    } catch {
      setAudioError('Could not play audio.')
      return { played: false, reason: 'error' }
    } finally {
      setIsPlaying(false)
    }
  }

  async function loadData() {
    try {
      const profile = await getProfile()
      setUser(profile)
      setChildren(profile.children || [])

      // Auto-select first child
      if (profile.children && profile.children.length > 0) {
        const child = profile.children[0]
        setSelectedChild(child)
        currentAyahRef.current = { surah: child.current_surah, ayah: child.current_ayah }
        setVoiceTutor(child.voice_tutor ?? true)
        await loadChildData(child.id)
      }
    } catch {
      navigate('/login')
    } finally {
      setLoading(false)
    }
  }

  async function loadChildData(childId: number) {
    try {
      const dash = await getDashboard(childId)
      setRecentSessions(dash.recent_sessions || [])
    } catch {
      // Dashboard fetch failed, show empty
    }
  }

  async function loadCurrentMastery(childId: number, surah: number, ayah: number) {
    try {
      const m = await getAyahMastery(childId, surah, ayah)
      setCurrentMastery(m)
    } catch { setCurrentMastery(null) }
  }

  async function runMemoryCheck() {
    if (!selectedChild) return
    const childId = selectedChild.id
    const surah = selectedChild.current_surah
    const ayah = selectedChild.current_ayah
    setMemoryCheckScoring(true)
    setMemoryCheckResult(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: selectedMicId ? { deviceId: { exact: selectedMicId } } : true })
      if (!stream.active) throw new Error('Could not access microphone')
      const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm' })
      const chunks: BlobPart[] = []
      const recordingPromise = new Promise<Blob>((resolve, reject) => {
        recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data) }
        recorder.onstop = () => resolve(new Blob(chunks, { type: 'audio/webm' }))
        recorder.onerror = () => reject(new Error('Recording failed'))
      })
      recorder.start()
      await new Promise<void>((resolve) => setTimeout(() => { try { if (recorder.state === 'recording') recorder.stop() } catch {}; resolve() }, 8000))
      stream.getTracks().forEach(t => t.stop())
      const audioBlob = await recordingPromise
      const result = await submitMemoryCheck(childId, surah, ayah, audioBlob)
      setMemoryCheckResult(result)
      loadCurrentMastery(childId, surah, ayah)
    } catch (err: any) {
      setMemoryCheckResult({ accuracy: 0, feedback: err?.message || 'Could not check', memorized: false, transcript: '', reference: '', audio_unclear: true })
    } finally { setMemoryCheckScoring(false) }
  }

  function handleChildSwitch(child: Child) {
    setSelectedChild(child)
    currentAyahRef.current = { surah: child.current_surah, ayah: child.current_ayah }
    setVoiceTutor(child.voice_tutor ?? true)
    setPracticeStep('listen')
    loadChildData(child.id)
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center">
        <div className="text-text-muted">Loading...</div>
      </div>
    )
  }

  if (!user) {
    navigate('/login')
    return null
  }

  const mastered = selectedChild?.total_mastered || 0
  const practiced = selectedChild?.total_practiced || 0
  const streak = selectedChild?.streak_days || 0
  const progressPct = mastered > 0 ? Math.min(mastered / 10 * 100, 100) : 0

  function getStatus(accuracy: number): string {
    if (accuracy >= 90) return 'mastered'
    if (accuracy >= 60) return 'practicing'
    return 'needs-work'
  }

  return (
    <div className="min-h-screen bg-surface">
      {/* Top nav */}
      <nav className="bg-surface-card border-b border-surface-dark px-3 sm:px-6 py-3 sm:py-4 flex justify-between items-center sticky top-0 z-50">
        <div className="flex items-center gap-2 sm:gap-3">
          <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl gradient-gold flex items-center justify-center">
            <Moon className="w-4 h-4 text-primary-dark" />
          </div>
          <span className="font-semibold text-base sm:text-lg text-text-primary">NoorHafiz</span>
        </div>
        <div className="flex items-center gap-2 sm:gap-3">
          <ThemeToggle />
          <div className="hidden sm:flex items-center gap-2 bg-surface rounded-xl px-3 py-2">
            <Flame className="w-4 h-4 text-orange-500" />
            <span className="text-sm font-bold text-orange-600">{streak} day streak</span>
          </div>
          <div className="flex items-center gap-1.5 sm:gap-2">
            <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs sm:text-sm font-bold">
              {user.name[0]}
            </div>
            <span className="hidden sm:inline text-sm font-medium">{user.name}</span>
          </div>
          <button onClick={() => { logout(); navigate('/') }} className="text-text-muted hover:text-danger transition-smooth">
            <LogOut className="w-4 h-4 sm:w-5 sm:h-5" />
          </button>
        </div>
      </nav>

      <div className="max-w-6xl mx-auto px-3 sm:px-6 py-4 sm:py-6">
        {/* Welcome */}
        <div className="mb-6 sm:mb-8">
          <h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-text-primary mb-1">
            Assalamu Alaikum, {user.name} 👋
          </h1>
          <p className="text-text-muted text-sm sm:text-base">
            {selectedChild ? `${selectedChild.name}'s hifz dashboard` : 'Add a child profile to get started'}
          </p>
        </div>

        {/* Child selector (if multiple) */}
        {children.length > 1 && (
          <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
            {children.map(child => (
              <button
                key={child.id}
                onClick={() => handleChildSwitch(child)}
                className={`px-4 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-smooth ${
                  selectedChild?.id === child.id
                    ? 'bg-primary text-white'
                    : 'bg-surface-card border border-surface-dark text-text-primary hover:border-primary/30'
                }`}
              >
                {child.name}
              </button>
            ))}
          </div>
        )}

        {/* No child yet */}
        {!selectedChild && (
          <div className="text-center py-16">
            <Users className="w-12 h-12 text-text-muted mx-auto mb-4" />
            <h3 className="text-lg font-bold text-text-primary mb-2">No children yet</h3>
            <p className="text-text-muted text-sm mb-6">Add a child profile to start tracking their hifz progress.</p>
            <button
              onClick={() => navigate('/children')}
              className="bg-primary-dark text-white font-semibold px-6 py-3 rounded-xl hover:bg-primary transition-smooth"
            >
              Add Child Profile
            </button>
          </div>
        )}

        {selectedChild && (
          <>
            {/* Stats cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 mb-6 sm:mb-8">
              {[
                { label: 'Ayahs Mastered', value: mastered, icon: CheckCircle2, color: 'text-primary', bg: 'bg-primary/10' },
                { label: 'Sessions', value: practiced, icon: Clock, color: 'text-gold-dark', bg: 'bg-gold/10' },
                { label: 'Day Streak', value: streak, icon: Flame, color: 'text-orange-600', bg: 'bg-orange-100' },
                { label: 'Current', value: `${SURAHS.find(s => s.number === selectedChild.current_surah)?.name || 'S.' + selectedChild.current_surah}`, icon: Target, color: 'text-primary', bg: 'bg-primary/10' },
              ].map((stat, i) => (
                <div key={i} className="bg-surface-card rounded-xl sm:rounded-2xl p-4 sm:p-5 border border-surface-dark">
                  <div className={`w-8 h-8 sm:w-10 sm:h-10 rounded-lg sm:rounded-xl ${stat.bg} ${stat.color} flex items-center justify-center mb-2 sm:mb-3`}>
                    <stat.icon className="w-4 h-4 sm:w-5 sm:h-5" />
                  </div>
                  <div className="text-lg sm:text-2xl font-bold text-text-primary">
                    {stat.value}
                  </div>
                  <div className="text-sm text-text-muted mt-1">{stat.label}</div>
                </div>
              ))}
            </div>

            {/* Progress bar */}
            <div className="bg-surface-card rounded-2xl p-4 sm:p-6 border border-surface-dark mb-6 sm:mb-8">
              <div className="flex justify-between items-center mb-3">
                <span className="font-semibold text-text-primary">Hifz Progress</span>
                <span className="text-primary font-bold">{mastered} ayahs</span>
              </div>
              <div className="w-full h-3 bg-surface-dark rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-primary to-primary-light rounded-full transition-all duration-500"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
            </div>

            {/* Tabs */}
            <div className="flex gap-1 bg-surface-dark rounded-xl p-1 mb-6 sm:mb-8">
              {[
                { key: 'practice' as const, label: 'Practice', icon: Mic },
                { key: 'progress' as const, label: 'Progress', icon: BarChart3 },
                { key: 'quran' as const, label: 'Quran', icon: BookOpen },
                { key: 'settings' as const, label: 'Settings', icon: Star },
              ].map(tab => (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-lg font-medium text-sm transition-smooth ${
                    activeTab === tab.key
                      ? 'bg-surface-card text-primary shadow-sm'
                      : 'text-text-muted hover:text-text-secondary'
                  }`}
                >
                  <tab.icon className="w-4 h-4" />
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Practice tab */}
            {activeTab === 'practice' && (
              <div className="grid md:grid-cols-3 gap-4 sm:gap-6">
                <div className="md:col-span-2 space-y-4 sm:space-y-6">
                  {/* Current ayah card with Listen → Record → Compare */}
                  <div className="bg-surface-card rounded-2xl border border-surface-dark overflow-hidden">
                    <div style={{ backgroundColor: '#0F4A32' }} className="p-4 sm:p-6 pattern-overlay relative">
                      <div className="relative z-10">
                        <span className="text-gold-light text-sm font-semibold">Continue where you left off</span>
                        <h3 className="text-white text-lg sm:text-xl font-bold mt-1">
                          {SURAHS.find(s => s.number === selectedChild.current_surah)?.name || `Surah ${selectedChild.current_surah}`}, Ayah {selectedChild.current_ayah}
                        </h3>
                      </div>
                    </div>

                  {/* Mode selector pills */}
                  <div className="flex items-center gap-2 px-4 sm:px-6 pt-4 sm:pt-6 pb-2">
                    <button
                      onClick={() => setMode('practice')}
                      className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-smooth ${mode === 'practice' ? 'bg-primary text-white' : 'bg-surface-dark text-text-muted hover:text-text-primary'}`}
                    >Practice</button>
                    <button
                      onClick={() => setMode('memory-check')}
                      className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-smooth ${mode === 'memory-check' ? 'bg-primary text-white' : 'bg-surface-dark text-text-muted hover:text-text-primary'}`}
                    >Memory Check</button>
                  </div>

                  {/* Mastery status badges */}
                  {currentMastery && mode === 'practice' && (
                    <div className="flex flex-wrap items-center gap-2 px-4 sm:px-6 pb-2">
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-surface-dark text-text-muted">
                        {(() => {
                          const goal = selectedChild?.repeat_each_ayah ?? 3
                          const count = Math.min(currentMastery.practice_pass_count ?? 0, goal)
                          return count >= goal
                            ? `${count} of ${goal} done`
                            : `Good repeats: ${count} of ${goal}`
                        })()}
                      </span>
                      {currentMastery.ready_for_memory_check && !currentMastery.memorized && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-primary/10 text-primary">✅ Ready for Memory Check</span>
                      )}
                      {currentMastery.memorized && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-success-light text-primary">🌟 Memorized!</span>
                      )}
                    </div>
                  )}

{mode === 'practice' ? (<>
                    <div className="p-4 sm:p-6">
                      {/* Bismillah header (non-Fatiha, non-Tawbah, Ayah 1 only) */}
                      {selectedChild && shouldShowBismillahHeader(selectedChild.current_surah, selectedChild.current_ayah) && (
                        <div className="mb-5">
                          <p className="arabic text-xl sm:text-2xl text-text-primary text-center leading-[2.2] font-medium">
                            {BISMILLAH_ARABIC}
                          </p>
                          <div className="w-12 h-px bg-surface-dark mx-auto mt-3" />
                        </div>
                      )}

                      {/* Arabic ayah — only render when the loaded text key matches the
                          live current ayah; otherwise fall back to a Loading state so the
                          child never sees text from a different ayah than the header / scoring. */}
                      <p className="arabic text-lg sm:text-2xl text-text-primary mb-6 text-center leading-[2.5]" style={{ minHeight: '3rem' }}>
                        {(() => {
                          if (!selectedChild) return 'Loading ayah…'
                          const matches = loadedAyah
                            && loadedAyah.surah === selectedChild.current_surah
                            && loadedAyah.ayah === selectedChild.current_ayah
                          return matches ? loadedAyah!.text : 'Loading ayah…'
                        })()}
                      </p>

                      {/* Tutor status line — parent-visible, contextual */}
                      {tutorStatusText && (
                        <div className="flex items-center justify-center gap-2 mb-2 animate-in fade-in duration-200">
                          <span className={`w-1.5 h-1.5 rounded-full inline-block ${
                            tutorStatusPhaseRef.current === 'listening' ? 'bg-primary animate-pulse' :
                            tutorStatusPhaseRef.current === 'giving_feedback' ? 'bg-gold-dark animate-pulse' :
                            tutorStatusPhaseRef.current === 'moving_next' || tutorStatusPhaseRef.current === 'retrying' ? 'bg-primary/60 animate-pulse' :
                            tutorStatusPhaseRef.current === 'scoring' ? 'bg-gold-dark animate-pulse' :
                            tutorStatusPhaseRef.current === 'lesson_complete' ? 'bg-primary' :
                            'bg-primary/40 animate-pulse'
                          }`} />
                          <span className="text-xs text-text-muted font-medium">{tutorStatusText}</span>
                        </div>
                      )}

                      {/* Transition reason banner (shown briefly when moving to next ayah) */}
                      {transitionReason && (
                        <div className="bg-primary/5 border border-primary/10 rounded-xl px-3 py-2 mb-2 text-center animate-in fade-in slide-in-from-bottom-2 duration-300">
                          <p className="text-xs text-primary font-medium">{transitionReason}</p>
                        </div>
                      )}

                      {/* Step indicator */}
                      <div className="flex items-center justify-center gap-2 mb-6">
                        {[
                          { step: 'listen', label: '1. Listen', icon: Volume2 },
                          { step: 'record', label: '2. Record', icon: Mic },
                          { step: 'result', label: '3. Result', icon: CheckCircle2 },
                        ].map((s, i) => (
                          <div key={s.step} className="flex items-center gap-2">
                            <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-smooth ${
                              practiceStep === s.step
                                ? 'bg-primary/10 text-primary'
                                : i < ['listen', 'record', 'result'].indexOf(practiceStep)
                                  ? 'bg-primary/10 text-primary'
                                  : 'bg-surface-dark text-text-muted'
                            }`}>
                              <s.icon className="w-3.5 h-3.5" />
                              <span className="hidden sm:inline">{s.label}</span>
                            </div>
                            {i < 2 && <ChevronRight className="w-3 h-3 text-text-muted" />}
                          </div>
                        ))}
                      </div>

                      {/* Step 1: Listen */}
                      {practiceStep === 'listen' && isOutsidePlan && (
                        <div className="space-y-5 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-2xl p-6 text-center">
                          <div className="inline-flex items-center justify-center w-12 h-12 bg-amber-100 dark:bg-amber-900/40 rounded-full mb-3">
                            <AlertCircle className="w-6 h-6 text-amber-600 dark:text-amber-400" />
                          </div>
                          <h3 className="text-lg font-bold text-text-primary">
                            Current ayah is outside this lesson
                          </h3>
                          <p className="text-sm text-text-muted">
                            Your assigned lesson is{' '}
                            <span className="font-semibold text-text-primary">
                              {getStudyPlanDescription(
                                selectedChild?.learning_path_preset ?? 'fatiha_forward',
                                selectedChild?.learning_start_surah ?? 1,
                                selectedChild?.learning_end_surah ?? 114,
                              )}
                            </span>.
                          </p>
                          <p className="text-xs text-text-muted">
                            Current:{' '}
                            <span className="font-mono text-amber-600 dark:text-amber-400">
                              {getSurahName(selectedChild?.current_surah ?? 1)}, Ayah {selectedChild?.current_ayah}
                            </span>
                          </p>
                          <button
                            onClick={startAssignedLesson}
                            className="w-full bg-primary text-white font-semibold py-3.5 rounded-xl hover:bg-primary-dark transition-smooth shadow-md shadow-primary/20"
                          >
                            Start Assigned Lesson
                          </button>
                          <p className="text-xs text-text-muted">
                            This will reset your position to the start of your assigned lesson.
                          </p>
                        </div>
                      )}
                      {practiceStep === 'listen' && !isOutsidePlan && (
                        <div className="space-y-4">
                          {/* Reciter selector + Auto mode + Voice Tutor toggle */}
                          <div className="flex items-center justify-center gap-3 flex-wrap">
                            <div className="flex items-center gap-2">
                              <Volume2 className="w-4 h-4 text-text-muted" />
                              <select
                                value={reciter}
                                onChange={e => { const v = e.target.value as ReciterId; setReciter(v); setSelectedReciter(v) }}
                                className="text-sm bg-surface border border-surface-dark rounded-lg px-3 py-1.5 text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
                              >
                                {RECITERS.map(r => (
                                  <option key={r.id} value={r.id}>{r.name}</option>
                                ))}
                              </select>
                            </div>
                            <button
                              onClick={() => setAutoMode(!autoMode)}
                              className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full transition-smooth ${
                                autoMode
                                  ? 'bg-primary text-white'
                                  : 'bg-surface-dark text-text-muted hover:text-text-primary'
                              }`}
                            >
                              <RefreshCw className="w-3.5 h-3.5" />
                              Auto {autoMode ? 'ON' : 'OFF'}
                            </button>
                            <button
                              onClick={() => setVoiceTutor(!voiceTutor)}
                              className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full transition-smooth ${
                                voiceTutor
                                  ? 'bg-primary text-white'
                                  : 'bg-surface-dark text-text-muted hover:text-text-primary'
                              }`}
                            >
                              <Mic className="w-3.5 h-3.5" />
                              Voice {voiceTutor ? 'ON' : 'OFF'}
                            </button>
                          </div>
                          {/* Tutor voice selector */}
                          {voiceTutor && (
                            <div className="flex items-center justify-center gap-2">
                              <span className="text-xs text-text-muted">Tutor voice:</span>
                              <select
                                value={tutorVoice}
                                onChange={e => changeTutorVoice(e.target.value as TutorVoice)}
                                className="text-xs bg-surface border border-surface-dark rounded-lg px-2 py-1 text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
                              >
                                <option value="english_male">English Male</option>
                                <option value="english_female">English Female</option>
                                <option value="arabic_male">Arabic Male</option>
                                <option value="arabic_female">Arabic Female</option>
                              </select>
                              <button
                                onClick={() => previewTutorVoice(tutorVoice)}
                                className="text-xs text-primary hover:text-primary-dark transition-smooth"
                                title="Preview tutor voice"
                              >
                                Preview
                              </button>
                            </div>
                          )}
                          {/* Difficulty badge */}
                          {selectedChild && (
                            <div className="text-center">
                              <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
                                selectedChild.difficulty === 'beginner' ? 'bg-success-light text-primary' :
                                selectedChild.difficulty === 'hard' ? 'bg-danger-light text-danger' :
                                selectedChild.difficulty === 'advanced' ? 'bg-gold/10 text-gold-dark' :
                                'bg-surface-dark text-text-muted'
                              }`}>
                                {selectedChild.difficulty?.charAt(0).toUpperCase() + selectedChild.difficulty?.slice(1)} mode - pass at {selectedChild.difficulty === 'beginner' ? '50' : selectedChild.difficulty === 'medium' ? '75' : selectedChild.difficulty === 'advanced' ? '85' : '90'}%
                              </span>
                            </div>
                          )}
                          <p className="text-center text-text-muted text-sm">
                            {autoMode
                              ? 'Auto mode: listen → record → next ayah automatically'
                              : getPrepText()
                            }
                          </p>
                          {!autoMode && voiceTutor && (
                            <button
                              onClick={() => playTutorSpeech(getPrepText(), 'prep message', 12000, false)}
                              className="w-full bg-surface-dark text-text-primary font-semibold py-2.5 rounded-xl hover:bg-surface-dark/80 transition-smooth flex items-center justify-center gap-2 text-sm"
                            >
                              <Mic className="w-4 h-4" /> Play Instructions
                            </button>
                          )}
                          {autoMode && flowStatus && practiceStep === 'listen' && (
                            <div className={`text-center text-xs font-medium rounded-xl px-3 py-2 ${
                              flowStatus.includes('blocked') || flowStatus.includes('tap')
                                ? 'bg-gold/10 text-gold-dark border border-gold/20'
                                : 'bg-surface-dark text-text-muted'
                            }`}>
                              {flowStatus.includes('blocked') || flowStatus.includes('tap')
                                ? 'Browser blocked auto audio - tap Play Recitation to continue'
                                : `flow: ${flowStatus}`
                              }
                            </div>
                          )}
                          <button
                            onClick={handlePlayRecitationClick}
                            disabled={isPlaying}
                            className="w-full bg-primary-dark text-white font-semibold py-4 rounded-xl hover:bg-primary transition-smooth flex items-center justify-center gap-3 shadow-md shadow-primary/20 disabled:opacity-60"
                          >
                            {isPlaying ? (
                              <><Square className="w-5 h-5" /> Playing...</>
                            ) : (
                              <><Volume2 className="w-5 h-5" /> Play Recitation</>
                            )}
                          </button>
                          {audioError && <p className="text-danger text-xs text-center mt-2">{audioError}</p>}
                          <button
                            onClick={() => setPracticeStep('record')}
                            className="w-full text-text-muted font-medium py-2 text-sm hover:text-text-primary transition-smooth"
                          >
                            Skip - I already know this ayah
                          </button>
                        </div>
                      )}

                      {/* Step 2: Record */}
                      {practiceStep === 'record' && (
                        <div className="space-y-4">
                          {/* ── Manual Mode: existing Start/Stop button ── */}
                          {recordingMode === 'manual' && (
                            <>
                              <p className="text-center text-text-muted text-sm">
                                Now recite the ayah from memory. Press record when ready.
                              </p>

                              {/* Visible recording/scoring status */}
                              <p className="text-center text-xs font-mono text-text-muted">
                                {(() => {
                                  if (recordingPipelineStatus === 'requesting microphone') return '🎤 Requesting microphone...'
                                  if (recordingPipelineStatus === 'recording') return '🔴 Recording... tap to stop'
                                  if (recordingPipelineStatus === 'stopping recording') return '⏹ Stopping recording...'
                                  if (recordingPipelineStatus === 'preparing audio') return '🔊 Preparing audio...'
                                  if (recordingPipelineStatus === 'audio too short') return '⚠️ Recording too short'
                                  if (recordingPipelineStatus === 'sending to scoring') return '⏳ Sending to scoring...'
                                  if (recordingPipelineStatus === 'scoring complete') return '✅ Scoring complete'
                                  if (recordingPipelineStatus === 'scoring failed') return '❌ Scoring failed'
                                  if (recordingPipelineStatus === 'result shown') return '📊 Result shown'
                                  if (scoring) return '⏳ Sending to scoring...'
                                  if (isRecording) return '🔴 Recording... tap to stop'
                                  if (audioError) return `⚠️ ${audioError}`
                                  return '🎙 Ready to record'
                                })()}
                              </p>

                              <button
                                onClick={async () => {
                                  // ── STOP RECORDING ──
                                  if (isRecording && mediaRecorder && mediaRecorder.state === 'recording') {
                                    console.log('[NoorHafiz Recording] Stop clicked - stopping recorder')
                                    setRecordingPipelineStatus('stopping recording')
                                    try {
                                      mediaRecorder.stop()
                                    } catch (e) {
                                      console.warn('[NoorHafiz Recording] recorder.stop() error:', e)
                                      setIsRecording(false)
                                      setMediaRecorder(null)
                                      setRecordingPipelineStatus('idle')
                                    }
                                    return
                                  }

                                  // ── START RECORDING ──
                                  if (tutorSpeakingRef.current) {
                                    console.log('[NoorHafiz Recording] Blocked - tutor still speaking')
                                    setAudioError('Please wait until the tutor finishes speaking.')
                                    return
                                  }

                                  console.log('[NoorHafiz Recording] Start clicked')
                                  setAudioError('')
                                  setRecordingPipelineStatus('requesting microphone')

                                  let micLabel = 'default'
                                  try {
                                    const devices = await navigator.mediaDevices.enumerateDevices()
                                    const mics = devices.filter(d => d.kind === 'audioinput')
                                    if (selectedMicId) {
                                      const selected = mics.find(d => d.deviceId === selectedMicId)
                                      micLabel = selected?.label || selectedMicId.slice(0, 8)
                                    } else {
                                      const def = mics.find(d => d.deviceId === 'default' || d.deviceId === '') || mics[0]
                                      micLabel = def?.label || 'default'
                                    }
                                    setMicDevices(mics)
                                  } catch { /* fine */ }

                                  try {
                                    const permStatus = await navigator.permissions.query({ name: 'microphone' as PermissionName }).catch(() => null)
                                    const permState = permStatus?.state || 'unknown'
                                    setMicPermission(permState)

                                    const micConstraints = selectedMicId
                                      ? { audio: { deviceId: { exact: selectedMicId }, echoCancellation: true, noiseSuppression: true, autoGainControl: true } }
                                      : { audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } }
                                    const stream = await navigator.mediaDevices.getUserMedia(micConstraints)
                                    setMicPermission('granted')
                                    setRecordingPipelineStatus('recording')
                                    const recorder = new MediaRecorder(stream)
                                    const chunks: BlobPart[] = []

                                    recorder.ondataavailable = e => {
                                      chunks.push(e.data)
                                    }

                                    const startTimeMs = Date.now()

                                    recorder.onstop = async () => {
                                      const durationSec = (Date.now() - startTimeMs) / 1000
                                      stream.getTracks().forEach(t => t.stop())
                                      setIsRecording(false)
                                      setRecordingPipelineStatus('preparing audio')

                                      if (chunks.length === 0) {
                                        setAudioError('I could not hear enough audio. Please try again.')
                                        setScoring(false)
                                        setMediaRecorder(null)
                                        setRecordingPipelineStatus('audio too short')
                                        return
                                      }

                                      const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' })
                                      setLastRecordingDuration(durationSec)
                                      setLastBlobSize(blob.size)
                                      setLastBlobMime(blob.type)

                                      if (blob.size < 3000) {
                                        setAudioError('The recording was too short or empty. Please try again.')
                                        setScoring(false)
                                        setMediaRecorder(null)
                                        setRecordingPipelineStatus('audio too short')
                                        return
                                      }
                                      if (durationSec < 1.0) {
                                        setAudioError('I did not hear enough audio. Please try again.')
                                        setScoring(false)
                                        setMediaRecorder(null)
                                        setRecordingPipelineStatus('audio too short')
                                        return
                                      }

                                      setScoring(true)
                                      setMediaRecorder(null)
                                      setRecordingPipelineStatus('sending to scoring')
                                      setTutorPhase('scoring')

                                      const recAyah = recordingAyahRef.current
                                      if (!recAyah) {
                                        console.error('[NoorHafiz Scoring] missing recordingAyahRef snapshot — aborting')
                                        setAudioError('Recording lost track of the ayah. Please try again.')
                                        setScoring(false)
                                        setRecordingPipelineStatus('snapshot missing')
                                        return
                                      }
                                      assertAyahSync('manual before scoring', { sending: `${recAyah.surah}:${recAyah.ayah}` })

                                      try {
                                        const result = await scoreRecitation(blob, recAyah.surah, recAyah.ayah, selectedChild.id, durationSec)
                                        setRecordingPipelineStatus('scoring complete')
                                        assertAyahSync('manual after scoring', { scored: `${recAyah.surah}:${recAyah.ayah}` })
                                        const micName = micLabel

                                        if (result.audio_unclear) {
                                          const newResult = {
                                            _id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
                                            childId: selectedChild.id,
                                            surah: recAyah.surah,
                                            ayah: recAyah.ayah,
                                            accuracy: 0,
                                            status: 'unclear',
                                            feedback: result.feedback,
                                            voiceText: result.voice_text,
                                            transcript: result.transcript,
                                            reference: result.reference,
                                            normalizedTranscript: result.normalized_transcript || '',
                                            normalizedReference: result.normalized_reference || '',
                                            durationSeconds: result.duration_seconds || 0,
                                            audioSizeBytes: result.audio_size_bytes,
                                            audioSizeKb: result.audio_size_kb,
                                            mistakes: [] as {expected: string, got: string, position: number}[],
                                            missing: [] as {word: string, position: number}[],
                                            threshold: result.threshold || 75,
                                            difficulty: result.difficulty,
                                            attemptNumber: 0,
                                            assistedAdvance: false,
                                            audioUnclear: true,
                                            audioUnclearReason: result.audio_unclear_reason ?? undefined,
                                            whisperModel: result.whisper_model || '',
                                            contentType: result.content_type || '',
                                            selectedMicLabel: micName,
                                            tutorMemoryEventId: result.tutor_memory_event_id ?? null,
                                          }
                                          setAyahResults(prev => [...prev, newResult])
                                          setAudioError('')
                                          setPracticeStep('result')
                                          setRecordingPipelineStatus('result shown')
                                          return
                                        }

                                        const threshold = result.threshold || 75
                                        const scoreStatus = result.accuracy >= 90 ? 'mastered' : result.accuracy >= threshold ? 'practicing' : 'needs-work'
                                        const newResult = {
                                          _id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
                                          childId: selectedChild.id,
                                          surah: recAyah.surah,
                                          ayah: recAyah.ayah,
                                          accuracy: result.accuracy,
                                          status: scoreStatus,
                                          feedback: result.feedback,
                                          voiceText: result.voice_text,
                                          transcript: result.transcript,
                                          reference: result.reference,
                                          normalizedTranscript: result.normalized_transcript || '',
                                          normalizedReference: result.normalized_reference || '',
                                          durationSeconds: result.duration_seconds || 0,
                                          audioSizeBytes: result.audio_size_bytes,
                                          audioSizeKb: result.audio_size_kb,
                                          mistakes: result.details?.mistakes || [],
                                          missing: result.details?.missing || [],
                                          threshold,
                                          difficulty: result.difficulty,
                                          attemptNumber: result.attempt_number,
                                          assistedAdvance: result.assisted_advance,
                                          audioUnclear: false,
                                          whisperModel: result.whisper_model || '',
                                          contentType: result.content_type || '',
                                          selectedMicLabel: micName,
                                          tutorMemoryEventId: result.tutor_memory_event_id ?? null,
                                        }
                                        setAyahResults(prev => [...prev, newResult])
                                        setAudioError('')
                                        setPracticeStep('result')
                                        setRecordingPipelineStatus('result shown')
                                      } catch (err: any) {
                                        console.error('[NoorHafiz Scoring] failed:', err)
                                        setAudioError(err.message || 'Scoring failed. Please check your connection and try again.')
                                        setRecordingPipelineStatus('scoring failed')
                                      } finally {
                                        setScoring(false)
                                        setMediaRecorder(null)
                                      }
                                    }

                                    // Snapshot from loadedAyah (what's painted), not from
                                    // currentAyahRef which can race ahead. Block if header /
                                    // ref / loaded disagree — recording the wrong ayah is a
                                    // worse outcome than a brief wait.
                                    if (!isAyahReadyToRecord('manual start')) {
                                      stream.getTracks().forEach(t => t.stop())
                                      setIsRecording(false)
                                      setRecordingPipelineStatus('blocked: ayah not ready')
                                      setAudioError('Loading ayah… please try again in a moment.')
                                      return
                                    }
                                    const ready = loadedAyah!
                                    recordingAyahRef.current = {
                                      surah: ready.surah,
                                      ayah: ready.ayah,
                                      text: ready.text,
                                    }
                                    assertAyahSync('manual recording start')

                                    recorder.start()
                                    setMediaRecorder(recorder)
                                    setIsRecording(true)
                                  } catch {
                                    console.error('[NoorHafiz Recording] Microphone access denied')
                                    setMicPermission('denied')
                                    setAudioError('Microphone access denied. Please allow microphone permission.')
                                    setIsRecording(false)
                                    setScoring(false)
                                    setRecordingPipelineStatus('idle')
                                  }
                                }}
                                disabled={scoring || tutorSpeaking || (() => {
                                  if (!selectedChild) return true
                                  return !loadedAyah
                                    || loadedAyah.surah !== selectedChild.current_surah
                                    || loadedAyah.ayah !== selectedChild.current_ayah
                                })()}
                                className={`w-full font-semibold py-4 rounded-xl flex items-center justify-center gap-3 transition-smooth ${
                                  scoring
                                    ? 'bg-text-muted text-white opacity-60 cursor-not-allowed'
                                    : isRecording
                                      ? 'bg-danger text-white animate-pulse shadow-md shadow-danger/20'
                                      : tutorSpeaking
                                        ? 'bg-surface-dark text-text-muted opacity-50 cursor-not-allowed'
                                        : 'bg-primary-dark text-white hover:bg-primary shadow-md shadow-primary/20'
                                }`}
                              >
                                {(() => {
                                  const ayahNotReady = !!selectedChild && (
                                    !loadedAyah
                                    || loadedAyah.surah !== selectedChild.current_surah
                                    || loadedAyah.ayah !== selectedChild.current_ayah
                                  )
                                  if (scoring) return <><RefreshCw className="w-5 h-5 animate-spin" /> Checking...</>
                                  if (isRecording) return <><Square className="w-5 h-5" /> Tap to stop recording</>
                                  if (tutorSpeaking) return <><Mic className="w-5 h-5 opacity-40" /> Wait for tutor...</>
                                  if (ayahNotReady) return <><Mic className="w-5 h-5 opacity-40" /> Loading ayah…</>
                                  return <><Mic className="w-5 h-5" /> Start Recording</>
                                })()}
                              </button>

                              {/* Teacher speaking — disabled record hint */}
                              {tutorSpeaking && (
                                <p className="text-center text-xs text-text-muted flex items-center justify-center gap-1.5">
                                  <span className="w-1.5 h-1.5 rounded-full bg-gold-dark inline-block animate-pulse" />
                                  Please wait — teacher is still speaking
                                </p>
                              )}

                              {/* Recording Debug Info */}
                              {(debugMode || showDebug) && (lastBlobSize > 0 || audioError) && (
                                <div className="bg-surface-dark/30 rounded-xl p-3 text-xs font-mono text-text-muted">
                                  <p>📊 Recording Debug:</p>
                                  <p>Pipeline: {recordingPipelineStatus}</p>
                                  {lastBlobSize > 0 && <>
                                    <p>Duration: {lastRecordingDuration.toFixed(1)}s</p>
                                    <p>Blob size: {(lastBlobSize / 1024).toFixed(1)} KB</p>
                                    <p>MIME: {lastBlobMime}</p>
                                  </>}
                                  <p>Mic permission: {micPermission}</p>
                                </div>
                              )}
                            </>
                          )}

                          {/* ── Guided Mode: Apple-style flow ── */}
                          {recordingMode === 'guided' && (
                            <>
                              {/* Idle: waiting after tutor prompt */}
                              {guidedState === 'idle' && (
                                <div className="text-center py-4">
                                  <p className="text-lg font-semibold text-text-primary">Your turn after the beep.</p>
                                  <p className="text-sm text-text-muted">Get ready...</p>
                                  <div className="mt-4 inline-flex items-center justify-center w-14 h-14 bg-surface-dark rounded-full">
                                    <Mic className="w-7 h-7 text-text-muted" />
                                  </div>
                                  {showManualStartFallback && (
                                    <div className="mt-4">
                                      <p className="text-sm text-amber-600 dark:text-amber-400 mb-2">Recording didn't start automatically.</p>
                                      <button
                                        onClick={handleManualGuidedStart}
                                        className="px-4 py-2 rounded-xl bg-primary text-white font-medium hover:bg-primary-dark transition-smooth"
                                      >
                                        Start Recording Manually
                                      </button>
                                    </div>
                                  )}
                                </div>
                              )}

                              {/* Countdown */}
                              {guidedState === 'countdown' && (
                                <div className="text-center py-8">
                                  <span className="text-6xl font-bold text-primary animate-pulse">{countdownValue}</span>
                                </div>
                              )}

                              {/* Recording: animated mic */}
                              {guidedState === 'recording' && (
                                <div className="text-center py-4 space-y-3">
                                  <div className="inline-flex items-center justify-center w-16 h-16 bg-danger/10 rounded-full animate-pulse">
                                    <Mic className="w-8 h-8 text-danger" />
                                  </div>
                                  <p className="text-lg font-semibold text-text-primary">I'm listening...</p>
                                  <p className="text-sm text-text-muted">Recite the ayah now. I'll stop when you're done.</p>
                                  <button
                                    onClick={handleGuidedManualStop}
                                    className="text-sm text-text-muted hover:text-text-primary transition-smooth"
                                  >
                                    Stop Recording
                                  </button>
                                </div>
                              )}

                              {/* Noise warning */}
                              {guidedState === 'noise_warning' && (
                                <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-2xl p-6 text-center space-y-3">
                                  <AlertCircle className="w-8 h-8 text-amber-600 dark:text-amber-400 mx-auto" />
                                  <p className="font-semibold text-text-primary">It sounds noisy.</p>
                                  <p className="text-sm text-text-muted">Try a quieter place or move closer to the microphone.</p>
                                  <div className="flex gap-2">
                                    <button
                                      onClick={handleNoiseRetryQuietCheck}
                                      className="flex-1 py-2.5 rounded-xl bg-primary text-white font-medium hover:bg-primary-dark transition-smooth"
                                    >
                                      Try Again
                                    </button>
                                    <button
                                      onClick={handleNoiseRecordAnyway}
                                      className="flex-1 py-2.5 rounded-xl bg-surface-dark text-text-primary font-medium hover:bg-surface-dark/80 transition-smooth"
                                    >
                                      Record Anyway
                                    </button>
                                  </div>
                                </div>
                              )}

                              {/* No speech detected */}
                              {guidedState === 'no_speech' && (
                                <div className="text-center py-4 space-y-3">
                                  <AlertCircle className="w-8 h-8 text-gold-dark mx-auto" />
                                  <p className="text-lg font-semibold text-text-primary">I didn't hear you.</p>
                                  <p className="text-sm text-text-muted">Try again closer to the microphone.</p>
                                  <button
                                    onClick={handleRetryRecording}
                                    className="mt-3 px-6 py-2.5 bg-primary text-white font-medium rounded-xl hover:bg-primary-dark transition-smooth"
                                  >
                                    Try Again
                                  </button>
                                </div>
                              )}

                              {/* Stopping: cleanup in progress */}
                              {guidedState === 'stopping' && (
                                <div className="text-center py-4 space-y-3">
                                  <RefreshCw className="w-8 h-8 text-text-muted animate-spin mx-auto" />
                                  <p className="text-lg font-semibold text-text-primary">Stopping...</p>
                                </div>
                              )}

                              {/* Guided debug info */}
                              {(debugMode || showDebug) && (
                                <div className="bg-surface-dark/30 rounded-xl p-3 text-xs font-mono text-text-muted space-y-0.5">
                                  <p>📊 Guided Debug:</p>
                                  <p>State: {guidedState}</p>
                                  <p>RMS: {recordingDiagnostics.avgVolume.toFixed(5)}</p>
                                  <p>Quiet check: {recordingDiagnostics.quietCheckLevel.toFixed(5)}</p>
                                  <p>Speech detected: {recordingDiagnostics.speechDetected ? 'YES' : 'No'}</p>
                                  <p>Silence stop: {recordingDiagnostics.silenceStopTriggered ? 'YES' : 'No'}</p>
                                  <p>No-speech timeout: {recordingDiagnostics.noSpeechTriggered ? 'YES' : 'No'}</p>
                                  <p>Max duration: {recordingDiagnostics.maxDurationTriggered ? 'YES' : 'No'}</p>
                                  <p>Mic permission: {micPermission}</p>
                                </div>
                              )}
                            </>
                          )}

                          <button
                            onClick={() => {
                              cleanupGuidedRecording()
                              setGuidedState('idle')
                              setPracticeStep('listen')
                            }}
                            disabled={isRecording || scoring}
                            className="w-full text-text-muted font-medium py-2 text-sm hover:text-text-primary transition-smooth disabled:opacity-40 disabled:cursor-not-allowed"
                          >
                            ← Listen again
                          </button>
                        </div>
                      )}

                      {/* Step 3: Result */}
                      {practiceStep === 'result' && (
                        <div className="space-y-4">
                          {(() => {
                            const last = ayahResults[ayahResults.length - 1]
                            if (!last) {
                              return (
                                <div className="bg-danger-light rounded-xl p-4 text-center">
                                  <AlertCircle className="w-8 h-8 text-danger mx-auto mb-2" />
                                  <p className="font-bold text-danger">Scoring failed</p>
                                  <p className="text-sm text-text-muted mt-1">{audioError || 'Could not analyze your recitation. Please try again.'}</p>
                                </div>
                              )
                            }

                            // ── Audio unclear path ──
                            if (last.audioUnclear) {
                              const unclearMsg = getTutorAudioUnclearMessage(last.audioUnclearReason || 'default')
                              return (
                                <div className="bg-gold/10 rounded-xl p-6 text-center space-y-4">
                                  <AlertCircle className="w-8 h-8 text-gold-dark mx-auto" />
                                  <div>
                                    <p className="font-bold text-text-primary text-lg">Let's try again</p>
                                    <p className="text-sm text-text-muted mt-1">{unclearMsg}</p>
                                  </div>
                                  <p className="text-xs text-text-muted">Tip: Stay close to the microphone.</p>
                                  <button
                                    onClick={() => {
                                      setAyahResults(prev => prev.slice(0, -1))
                                      if (recordingMode === 'guided') {
                                        setGuidedState('idle')
                                        runGuidedRecording()
                                      } else {
                                        setPracticeStep('record')
                                      }
                                    }}
                                    className="w-full bg-primary-dark text-white font-semibold py-3 rounded-xl hover:bg-primary transition-smooth flex items-center justify-center gap-2"
                                  >
                                    <Mic className="w-4 h-4" />
                                    Record Again
                                  </button>
                                </div>
                              )
                            }

                            const threshold = last.threshold || 75
                            const accuracyPassed = last.accuracy >= threshold
                            const mastered = last.accuracy >= 90
                            const isBeginner = last.difficulty === 'beginner'
                            const failedColor = isBeginner ? 'bg-gold/10' : 'bg-danger-light'
                            const failedText = isBeginner ? 'text-gold-dark' : 'text-danger'
                            const failedLabel = isBeginner ? 'Keep practicing!' : 'Try again!'
                            const failedIcon = isBeginner ? <Target className="w-8 h-8 text-gold-dark mx-auto mb-2" /> : <XCircle className="w-8 h-8 text-danger mx-auto mb-2" />
                            return (
                              <div className={`rounded-xl p-4 text-center ${
                                mastered ? 'bg-success-light' :
                                accuracyPassed ? 'bg-gold/10' :
                                failedColor
                              }`}>
                                {mastered ? (
                                  <CheckCircle2 className="w-8 h-8 text-primary mx-auto mb-2" />
                                ) : accuracyPassed ? (
                                  <Target className="w-8 h-8 text-gold-dark mx-auto mb-2" />
                                ) : (
                                  failedIcon
                                )}
                                <p className={`font-bold ${
                                  mastered ? 'text-primary' :
                                  accuracyPassed ? 'text-gold-dark' :
                                  failedText
                                }`}>
                                  {mastered ? 'Excellent!' :
                                   accuracyPassed ? 'Good effort!' :
                                   failedLabel}
                                </p>
                                <p className="text-sm text-text-muted mt-1">
                                  Accuracy: {last.accuracy}% (need {threshold}%)
                                  {!isBeginner && ` - ${SURAHS.find(s => s.number === last.surah)?.name} :${last.ayah}`}
                                </p>
                                {last.feedback && (
                                  <p className="text-sm text-text-primary mt-2">{last.feedback}</p>
                                )}
                                {autoMode && flowStatus && (
                                  <p className="text-xs text-text-muted mt-2 font-mono bg-surface-dark/30 rounded px-2 py-1">
                                    flow: {flowStatus}
                                  </p>
                                )}
                                {/* Tutor audio status in result */}
                                {tutorAudioStatus && !tutorAudioStatus.played && (
                                  <div className="mt-2 space-y-2">
                                    <p className="text-xs text-amber-600 dark:text-amber-400">
                                      ⚠️ Teacher audio {tutorAudioStatus.reason === 'blocked' ? 'blocked' : 'unavailable'} — continuing
                                    </p>
                                    {tutorFeedbackBlocked && lastFeedbackTextRef.current && (
                                      <button
                                        onClick={async () => {
                                          setTutorFeedbackBlocked(false)
                                          const result = await playTutorFeedback(lastFeedbackTextRef.current, tutorVoice)
                                          setTutorAudioStatus(result)
                                          if (!result.played) setTutorFeedbackBlocked(true)
                                        }}
                                        className="px-3 py-1.5 rounded-lg text-xs font-medium bg-primary/10 text-primary hover:bg-primary/20 transition-smooth active:scale-[0.98]"
                                      >
                                        🔈 Play Tutor Feedback
                                      </button>
                                    )}
                                  </div>
                                )}
                                {autoMode && accuracyPassed && (
                                  <p className="text-sm text-primary mt-2 font-medium">
                                    ✨ Auto-advancing to next ayah...
                                  </p>
                                )}
                                {autoMode && !accuracyPassed && (
                                  <p className={`text-sm mt-2 font-medium ${isBeginner ? 'text-gold-dark' : 'text-danger'}`}>
                                    Listen again and repeat this ayah.
                                  </p>
                                )}
                              </div>
                            )
                          })()}
                          {/* Recording Debug panel - expandable */}
                          {(() => {
                            const last = ayahResults[ayahResults.length - 1]
                            if (!last) return null
                            return (
                              <div className="bg-surface-dark/30 rounded-xl border border-surface-dark overflow-hidden">
                                <button
                                  onClick={(e) => {
                                    const panel = (e.currentTarget.nextElementSibling as HTMLElement)
                                    if (panel) panel.classList.toggle('hidden')
                                    const arrow = e.currentTarget.querySelector('.debug-arrow')
                                    if (arrow) arrow.classList.toggle('rotate-180')
                                  }}
                                  className="w-full flex items-center justify-between px-3 py-2 text-xs font-semibold text-text-muted hover:text-text-primary hover:bg-surface-dark/50 transition-smooth"
                                >
                                  <span>🛠 Recording Debug</span>
                                  <ChevronDown className="debug-arrow w-3 h-3 transition-transform" />
                                </button>
                                <div className="hidden px-3 pb-3 pt-1 text-xs font-mono text-text-muted space-y-0.5">
                                  <p>Duration: {last.durationSeconds?.toFixed(1)}s</p>
                                  <p>Audio size: {last.audioSizeBytes} bytes ({last.audioSizeKb} KB)</p>
                                  <p>MIME type: {last.contentType || lastBlobMime || 'N/A'}</p>
                                  <p>Mic: {last.selectedMicLabel || 'N/A'}</p>
                                  <p>Backend model: {last.whisperModel || 'N/A'}</p>
                                  <p>Transcript: {last.transcript || '(empty)'}</p>
                                  <p>Normalized transcript: {last.normalizedTranscript || '(empty)'}</p>
                                  <p>Reference: {last.reference || '(empty)'}</p>
                                  <p>Normalized reference: {last.normalizedReference || '(empty)'}</p>
                                  <p>Audio unclear: {last.audioUnclear ? 'YES' : 'No'}</p>
                                  {last.audioUnclearReason && <p>Unclear reason: {last.audioUnclearReason}</p>}
                                  <p>Score: {last.accuracy}% (threshold: {last.threshold}%)</p>
                                </div>
                              </div>
                            )
                          })()}

                          {/* Show transcript + mistakes if available */}
                          {(() => {
                            const last = ayahResults[ayahResults.length - 1]
                            if (!last || last.audioUnclear) return null
                            const hasMistakes = (last.mistakes?.length || 0) > 0 || (last.missing?.length || 0) > 0
                            // Apply same Bismillah stripping to reference as the main display text
                            const displayReference = selectedChild && last.reference
                              ? getDisplayArabicAyahText(last.reference, last.surah, last.ayah)
                              : (last.reference || '')
                            return (
                              <div className="bg-surface-dark/50 rounded-xl p-3 space-y-2">
                                {last.reference && (
                                  <div>
                                    <p className="text-xs font-semibold text-text-muted mb-1">Correct recitation:</p>
                                    <p className="text-sm text-text-primary" dir="rtl">{displayReference}</p>
                                  </div>
                                )}
                                {last.transcript && (
                                  <div>
                                    <p className="text-xs font-semibold text-text-muted mb-1">Your recitation:</p>
                                    <p className="text-sm text-text-primary" dir="rtl">{last.transcript}</p>
                                  </div>
                                )}
                                {hasMistakes && (
                                  <div>
                                    <p className="text-xs font-semibold text-text-muted mb-1">Mistakes:</p>
                                    <div className="flex flex-wrap gap-1">
                                      {last.mistakes?.map((m, i) => (
                                        <button key={i} onClick={() => speakFeedback(`Let's practice this word: ${m.expected}`)} className="text-xs bg-danger/10 text-danger px-2 py-0.5 rounded hover:bg-danger/20 transition-smooth">
                                          {m.expected} → {m.got}
                                        </button>
                                      ))}
                                      {last.missing?.map((m, i) => (
                                        <button key={`m${i}`} onClick={() => speakFeedback(`The missing word is: ${m.word}`)} className="text-xs bg-gold/10 text-gold-dark px-2 py-0.5 rounded hover:bg-gold/20 transition-smooth">
                                          Missing: {m.word}
                                        </button>
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </div>
                            )
                          })()}
                          {/* Action buttons */}
                          <div className="flex gap-2 flex-wrap">
                            {/* Play Tutor Feedback */}
                            {(() => {
                              const last = ayahResults[ayahResults.length - 1]
                              if (!last?.voiceText) return null
                              return (
                                <button
                                  onClick={() => speakFeedback(last.voiceText!)}
                                  className="flex-1 min-w-[140px] bg-surface-dark text-text-primary font-semibold py-2.5 rounded-xl hover:bg-surface-dark/80 transition-smooth flex items-center justify-center gap-2 text-sm"
                                >
                                  <Volume2 className="w-4 h-4" />
                                  Play Tutor Feedback
                                </button>
                              )
                            })()}
                            {/* Play Correct Ayah Again */}
                            <button
                              onClick={() => playCurrentAyah()}
                              className="flex-1 min-w-[140px] bg-surface-dark text-text-primary font-semibold py-2.5 rounded-xl hover:bg-surface-dark/80 transition-smooth flex items-center justify-center gap-2 text-sm"
                            >
                              <Volume2 className="w-4 h-4" />
                              Play Correct Ayah
                            </button>
                          </div>
                          {/* Post-result flow is handled by useEffect above */}
                          {/* Manual mode: show Next Ayah button only when accuracy passed */}
                          {!autoMode && (() => {
                            const last = ayahResults[ayahResults.length - 1]
                            const threshold = last?.threshold || 75
                            return last && !last.audioUnclear && last.accuracy >= threshold
                          })() && (
                            <button
                              onClick={() => advanceToNextAyah()}
                              className="w-full bg-primary-dark text-white font-semibold py-3 rounded-xl hover:bg-primary transition-smooth flex items-center justify-center gap-2"
                            >
                              <ChevronRight className="w-4 h-4" />
                              Next Ayah
                            </button>
                          )}
                          {/* Auto mode failed: show repeat button */}
                          {(() => {
                            const last = ayahResults[ayahResults.length - 1]
                            const threshold = last?.threshold || 75
                            return autoMode && last && !last.audioUnclear && last.accuracy < threshold
                          })() && (
                            <button
                              onClick={() => setPracticeStep('listen')}
                              className="w-full bg-primary-dark text-white font-semibold py-3 rounded-xl hover:bg-primary transition-smooth flex items-center justify-center gap-2"
                            >
                              <RefreshCw className="w-4 h-4" />
                              Try Again
                            </button>
                          )}
                          {!autoMode && (() => {
                            const last = ayahResults[ayahResults.length - 1]
                            return !last?.audioUnclear
                          })() && (
                            <button
                              onClick={() => setPracticeStep('listen')}
                              className="w-full text-text-muted font-medium py-2 text-sm hover:text-text-primary transition-smooth"
                            >
                              ← Practice this ayah again
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                    </>) : (
                      <div className="p-4 sm:p-6">
                    <div className="space-y-4">
                      <div className="text-center">
                        <p className="text-3xl mb-2">🧠</p>
                        <p className="font-bold text-lg text-text-primary">Memory Check</p>
                        <p className="text-sm text-text-muted mt-1">Let's see what you remember!</p>
                      </div>
                      <div className="bg-surface-dark/30 rounded-xl p-4 text-center">
                        <p className="arabic text-lg sm:text-2xl text-text-primary leading-[2.5]" style={{"minHeight":"3rem"}}>
                          {(() => {
                            if (selectedChild?.hide_text_in_memory_check ?? true) return '📖 ???'
                            const matches = selectedChild && loadedAyah
                              && loadedAyah.surah === selectedChild.current_surah
                              && loadedAyah.ayah === selectedChild.current_ayah
                            return matches ? loadedAyah!.text : 'Loading ayah…'
                          })()}
                        </p>
                        <p className="text-xs text-text-muted mt-1">
                          {selectedChild?.current_surah != null && selectedChild?.current_ayah != null
                            ? `${SURAHS.find(s => s.number === selectedChild.current_surah)?.name} :${selectedChild.current_ayah}`
                            : 'Select an ayah'}
                        </p>
                      </div>
                      {memoryCheckResult && (
                        <div className={`rounded-xl p-4 text-center ${memoryCheckResult.memorized ? 'bg-success-light' : memoryCheckResult.audio_unclear ? 'bg-gold/10' : 'bg-danger-light'}`}>
                          {memoryCheckResult.memorized ? (
                            <>
                              <CheckCircle2 className="w-8 h-8 text-primary mx-auto mb-2" />
                              <p className="font-bold text-primary">🌟 MashaAllah, you remembered it!</p>
                              <p className="text-sm text-text-muted mt-1">{memoryCheckResult.feedback}</p>
                            </>
                          ) : memoryCheckResult.audio_unclear ? (
                            <>
                              <AlertCircle className="w-8 h-8 text-gold-dark mx-auto mb-2" />
                              <p className="font-bold text-gold-dark">Check your microphone</p>
                              <p className="text-sm text-text-muted mt-1">Could not hear your voice clearly. Check the microphone and try again.</p>
                            </>
                          ) : (
                            <>
                              <Target className="w-8 h-8 text-danger mx-auto mb-2" />
                              <p className="font-bold text-danger">💪 Good try. Let's practice this one again.</p>
                              <p className="text-sm text-text-muted mt-1">{memoryCheckResult.feedback}</p>
                            </>
                          )}
                        </div>
                      )}
                      {!memoryCheckResult && (
                        <button
                          onClick={runMemoryCheck}
                          disabled={memoryCheckScoring}
                          className="w-full bg-primary-dark text-white font-semibold py-3 rounded-xl hover:bg-primary transition-smooth flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
                        >
                          {memoryCheckScoring ? (<><RefreshCw className="w-4 h-4 animate-spin" /> Listening...</>) : (<><Mic className="w-4 h-4" /> Start Recording</>)}
                        </button>
                      )}
                      <button
                        onClick={() => { setMode('practice'); setMemoryCheckResult(null) }}
                        className="w-full text-text-muted font-medium py-2 text-sm hover:text-text-primary transition-smooth"
                      >← Back to Practice</button>
                    </div>
                      </div>
                    )}
                  </div>

                  {/* Assigned Lesson card */}
                  <div className="bg-surface-card rounded-2xl p-4 sm:p-6 border border-surface-dark">
                    <h3 className="font-bold text-sm text-text-primary mb-3">Assigned Lesson</h3>
                    <div className="space-y-3 text-sm">
                      <div className="flex items-center justify-between">
                        <span className="text-text-muted">Study plan</span>
                        <span className="text-text-primary font-medium text-right">
                          {getStudyPlanDescription(
                            childLearningPreset,
                            selectedChild?.learning_start_surah ?? 1,
                            selectedChild?.learning_end_surah ?? 114,
                          )}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-text-muted">Start</span>
                        <span className="text-text-primary font-medium text-right">
                          {getSurahName(selectedChild?.learning_start_surah ?? 1)}, Ayah {selectedChild?.learning_start_ayah ?? 1}
                        </span>
                      </div>
                      {(() => {
                        // Show first surah after Al-Fatiha if preset is fatiha_forward
                        const preset = selectedChild?.learning_path_preset ?? 'fatiha_forward'
                        if (preset === 'fatiha_forward' || preset === 'al_fatiha_then_juz_amma') {
                          return (
                            <div className="flex items-center justify-between">
                              <span className="text-text-muted">Next after Al-Fatiha</span>
                              <span className="text-primary font-medium text-right">
                                {getSurahName(112)} (Al-Ikhlas)
                              </span>
                            </div>
                          )
                        }
                        return null
                      })()}
                      <div className="flex items-center justify-between">
                        <span className="text-text-muted">Current</span>
                        <span className={`font-medium text-right ${isOutsidePlan ? 'text-amber-600 dark:text-amber-400' : 'text-text-primary'}`}>
                          {isOutsidePlan && '⚠ '}
                          {getSurahName(selectedChild.current_surah)}, Ayah {selectedChild.current_ayah}
                          {isOutsidePlan && ' — outside lesson'}
                        </span>
                      </div>
                      {isOutsidePlan && (
                        <button
                          onClick={startAssignedLesson}
                          className="w-full bg-primary text-white font-semibold py-2.5 rounded-xl hover:bg-primary-dark transition-smooth text-sm"
                        >
                          Start Assigned Lesson
                        </button>
                      )}

                      {/* Navigation buttons */}
                      {(() => {
                        const prev = getPreviousSurah(selectedChild.current_surah)
                        const next = getNextSurah(selectedChild.current_surah)
                        return (
                          <div className="space-y-2 pt-1">
                            <button
                              onClick={handleStartOver}
                              className="w-full bg-surface-dark text-text-primary font-medium py-2.5 rounded-xl hover:bg-surface-dark/80 transition-smooth text-sm flex items-center justify-center gap-2"
                            >
                              <RefreshCw className="w-4 h-4" />
                              Start Over
                            </button>
                            <div className="flex gap-2">
                              <button
                                onClick={handlePreviousSurah}
                                disabled={!prev}
                                className="flex-1 bg-surface-dark text-text-primary font-medium py-2.5 rounded-xl hover:bg-surface-dark/80 transition-smooth text-sm flex items-center justify-center gap-1 disabled:opacity-40 disabled:cursor-not-allowed"
                              >
                                <ChevronRight className="w-4 h-4 rotate-180" />
                                Previous Surah
                              </button>
                              <button
                                onClick={handleNextSurah}
                                disabled={!next}
                                className="flex-1 bg-surface-dark text-text-primary font-medium py-2.5 rounded-xl hover:bg-surface-dark/80 transition-smooth text-sm flex items-center justify-center gap-1 disabled:opacity-40 disabled:cursor-not-allowed"
                              >
                                Next Surah
                                <ChevronRight className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        )
                      })()}

                      <div className="flex items-center justify-between">
                        <span className="text-text-muted">Repeat goal</span>
                        <span className="text-text-primary font-medium">{childRepeatEach} good recitations</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-text-muted">Memory Check</span>
                        <span className="text-text-primary font-medium">{childMemoryPassScore}%</span>
                      </div>
                    </div>
                  </div>

                  {/* Session results */}
                  {ayahResults.length > 0 && (
                    <div className="bg-surface-card rounded-2xl p-4 sm:p-6 border border-surface-dark">
                      <h3 className="font-bold text-sm mb-3 text-text-primary">This Session ({ayahResults.length} ayahs)</h3>
                      <div className="flex flex-wrap gap-1.5">
                        {ayahResults.map((r, i) => (
                          <div
                            key={i}
                            className={`w-9 h-9 rounded-lg text-xs font-bold flex items-center justify-center ${
                              r.accuracy >= 90 ? 'bg-primary/10 text-primary' :
                              r.accuracy >= 60 ? 'bg-gold/10 text-gold-dark' : 'bg-danger/10 text-danger'
                            }`
                            }
                            title={`${SURAHS.find(s => s.number === r.surah)?.name} :${r.ayah} - ${r.accuracy}%`}
                          >
                            {r.ayah}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Sidebar */}
                <div className="space-y-6">
                  {/* Children link */}
                  <button
                    onClick={() => navigate('/children')}
                    className="w-full bg-surface-card rounded-2xl p-5 border border-surface-dark hover:border-primary/30 hover:bg-primary/5 transition-smooth flex items-center gap-3 text-left"
                  >
                    <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
                      <Users className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="font-semibold text-text-primary text-sm">Child Profiles</div>
                      <div className="text-xs text-text-muted">{children.length} {children.length === 1 ? 'child' : 'children'}</div>
                    </div>
                  </button>

                  {/* Streak card */}
                  <div className="bg-surface-card rounded-2xl p-6 border border-surface-dark text-center">
                    <Trophy className="w-10 h-10 text-gold-dark mx-auto mb-3" />
                    <div className="text-3xl font-bold text-text-primary">{streak}</div>
                    <div className="text-text-muted text-sm">Day Streak 🔥</div>
                    <div className="mt-4 flex gap-1 justify-center">
                      {Array.from({ length: 7 }).map((_, i) => (
                        <div
                          key={i}
                          className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold ${
                            i < streak
                              ? 'bg-gold/20 text-gold-dark'
                              : 'bg-surface-dark text-text-muted/30'
                          }`}
                        >
                          {i < streak ? '✓' : '·'}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Recent sessions */}
                  <div className="bg-surface-card rounded-2xl p-6 border border-surface-dark">
                    <h3 className="font-bold mb-4 text-text-primary">Recent Sessions</h3>
                    {recentSessions.length === 0 ? (
                      <p className="text-text-muted text-sm text-center py-4">No sessions yet. Start practicing!</p>
                    ) : (
                      <div className="space-y-3">
                        {recentSessions.slice(0, 5).map(session => {
                          const status = getStatus(session.accuracy)
                          return (
                            <div key={session.id} className="flex items-center justify-between py-2">
                              <div className="flex items-center gap-3">
                                {status === 'mastered' && <CheckCircle2 className="w-4 h-4 text-primary" />}
                                {status === 'practicing' && <AlertCircle className="w-4 h-4 text-gold-dark" />}
                                {status === 'needs-work' && <XCircle className="w-4 h-4 text-danger" />}
                                <div>
                                  <div className="text-sm font-medium text-text-primary">
                                    {SURAHS.find(s => s.number === session.surah)?.name || `S.${session.surah}`} :{session.ayah_start}{session.ayah_end !== session.ayah_start ? `-${session.ayah_end}` : ''}
                                  </div>
                                  <div className="text-xs text-text-muted">
                                    {new Date(session.created_at).toLocaleDateString()}
                                  </div>
                                </div>
                              </div>
                              <span className={`text-sm font-bold ${
                                session.accuracy >= 90 ? 'text-primary' :
                                session.accuracy >= 60 ? 'text-gold-dark' : 'text-danger'
                              }`}>
                                {Math.round(session.accuracy)}%
                              </span>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Progress tab */}
            {activeTab === 'progress' && (
              <div className="bg-surface-card rounded-2xl p-8 border border-surface-dark text-center">
                <BarChart3 className="w-12 h-12 text-primary mx-auto mb-4" />
                <h3 className="text-xl font-bold mb-2 text-text-primary">Progress Tracking</h3>
                <p className="text-text-muted mb-6">Detailed analytics coming soon - mastery heatmaps, Tajweed breakdown, and weekly reports.</p>
                <div className="inline-flex items-center gap-2 bg-primary/10 text-primary px-4 py-2 rounded-xl text-sm font-medium">
                  <Flame className="w-4 h-4" />
                  {mastered} ayahs mastered so far
                </div>
              </div>
            )}

            {/* Quran tab */}
            {activeTab === 'quran' && (
              <QuranReader
                selectedChild={selectedChild ? { id: selectedChild.id, current_surah: selectedChild.current_surah, current_ayah: selectedChild.current_ayah } : undefined}
                setCurrentPracticeAyah={async (surah, ayah) => {
                  if (selectedChild) {
                    await setCurrentPracticeAyah(surah, ayah, selectedChild.id)
                    setPracticeStep('listen')
                    setAyahResults([])
                    setFlowStatus('')
                  }
                }}
                setActiveTab={setActiveTab}
              />
            )}

            {/* Settings tab */}
            {activeTab === 'settings' && (
              <Settings
                user={user}
                setUser={setUser}
                selectedChild={selectedChild}
                setSelectedChild={setSelectedChild}
                setChildren={setChildren}
                reciter={reciter}
                setReciter={setReciter}
                childRepeatEach={childRepeatEach}
                setChildRepeatEach={setChildRepeatEach}
                childMemoryPassScore={childMemoryPassScore}
                setChildMemoryPassScore={setChildMemoryPassScore}
                childHideText={childHideText}
                setChildHideText={setChildHideText}
                childLearningPreset={childLearningPreset}
                setChildLearningPreset={setChildLearningPreset}
                childStartSurah={childStartSurah}
                setChildStartSurah={setChildStartSurah}
                childStartAyah={childStartAyah}
                setChildStartAyah={setChildStartAyah}
                childEndSurah={childEndSurah}
                setChildEndSurah={setChildEndSurah}
                childEndAyah={childEndAyah}
                setChildEndAyah={setChildEndAyah}
                childCompletionBehavior={childCompletionBehavior}
                setChildCompletionBehavior={setChildCompletionBehavior}
                onStartLesson={() => {
                  if (!selectedChild) return
                  setCurrentPracticeAyah(childStartSurah, childStartAyah, selectedChild.id)
                  setPracticeStep('listen')
                  setAyahResults([])
                  setFlowStatus('')
                  setActiveTab('practice')
                }}
                showToast={showToast}
                showDebug={showDebug}
                setShowDebug={setShowDebug}
                debugMode={debugMode}
                setDebugMode={setDebugMode}
                micTestResult={micTestResult}
                setMicTestResult={setMicTestResult}
                micTesting={micTesting}
                setMicTesting={setMicTesting}
                selectedMicId={selectedMicId}
                setSelectedMicId={setSelectedMicId}
                micDevices={micDevices}
                setMicDevices={setMicDevices}
                lastBlobSize={lastBlobSize}
                lastRecordingDuration={lastRecordingDuration}
                lastBlobMime={lastBlobMime}
                micPermission={micPermission}
                recordingMode={recordingMode}
                setRecordingMode={(mode) => {
                  setRecordingModeState(mode)
                  setRecordingMode(mode)
                }}
              />
            )}
          </>
        )}
      </div>
    </div>
  )
}
