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
import { getAyahAudioUrl, getAyahText, playAudio, playTutorFeedback, previewTutorVoice, scoreRecitation, RECITERS, getSelectedReciter, setSelectedReciter, getTutorVoice, setTutorVoice, type TutorVoice, type ReciterId, type AudioResult, BISMILLAH_ARABIC, shouldShowBismillahHeader, stripLeadingBismillah } from '../lib/quran'
import { getTutorPrepMessage, getTutorRecordPrompt, getSurahOnboardingText, getLessonCompleteMessage, getTutorStatusMessage, getTutorTransitionReason, fetchTutorFeedback, type TutorContext, type TutorStatusPhase } from '../lib/tutor'
import Settings from '../components/Settings'
import QuranReader from '../components/QuranReader'

import { SURAHS } from '../lib/surahs'
import { getNextAyahForStudyPlan, getStudyPlanDescription, isAyahInStudyPlan } from '../lib/surahs'

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
  const [ayahText, setAyahText] = useState('Loading ayah...')
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
  const [recordingPipelineStatus, setRecordingPipelineStatus] = useState<string>('idle')

  // Auto-enable debug in development
  useEffect(() => {
    if (import.meta.env.DEV && !debugMode) {
      setDebugMode(true)
      localStorage.setItem('nh-debug', 'true')
    }
  }, [])

  // Single source of truth for current ayah - always up to date
  const currentAyahRef = useRef({ surah: 1, ayah: 1 })

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

  function buildTutorContext(overrides?: Partial<TutorContext>): TutorContext {
    const currentAyah = currentAyahRef.current
    const lastPassed = lastPassedAyahRef.current
    const lastResult = ayahResults[ayahResults.length - 1]
    const isMoving = tutorActionRef.current === 'move_next'
    const isRetry = tutorActionRef.current === 'retry'
    const isNew = tutorActionRef.current === 'new_surah'

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

  // Reserved for future reverse-navigation feature
  // function getPreviousAyah(surah: number, ayah: number): { surah: number; ayah: number } | null {
  //   return getPreviousAyahForStudyPlan(
  //     surah, ayah,
  //     selectedChild?.learning_path_preset ?? 'fatiha_forward',
  //     selectedChild?.learning_start_surah ?? 1,
  //     selectedChild?.learning_start_ayah ?? 1,
  //     selectedChild?.learning_end_surah ?? 114,
  //     selectedChild?.learning_end_ayah ?? 6,
  //     selectedChild?.learning_completion_behavior ?? 'stop',
  //   )
  // }

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

  async function playTutorSpeech(text: string, status: string, fetchTimeoutMs = 12000, allowFallback = false): Promise<boolean> {
    if (!voiceTutor || !text.trim()) return false

    // Guard: on record step, only allow the record prompt to pass through
    if (practiceStepRef.current === 'record' && status !== 'record prompt') {
      console.log('[NoorHafiz Tutor] skipped because step=record (status=%s)', status)
      return false
    }

    // Guard: never speak during active recording or scoring
    if (isRecordingRef.current || scoringRef.current) {
      console.log('[NoorHafiz Tutor] skipped because recording/scoring active')
      return false
    }

    if (Date.now() < tutorUnavailableUntilRef.current) {
      setFlowStatus('Tutor voice unavailable - continuing')
      return false
    }

    setTutorSpeaking(true)
    console.log('[NoorHafiz Tutor] speaking:', status)
    setFlowStatus(status)

    try {
      const played = await playTutorFeedback(text, tutorVoice, { fetchTimeoutMs, fallback: allowFallback }).catch((err) => {
        if (err?.name === 'AbortError') {
          console.log('[NoorHafiz Tutor] aborted, continuing silently')
        }
        return false
      })

      if (!played) {
        tutorUnavailableUntilRef.current = Date.now() + 60_000
        setFlowStatus('Tutor voice unavailable - continuing')
        return false
      }

      tutorUnavailableUntilRef.current = 0
      return true
    } finally {
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

    const ctx = buildTutorContext({ surah, ayah, surahName: getSurahName(surah) })

    try {
      // Step 1: optional short prep (context-aware)
      if (!options.skipTutor && voiceTutor) {
        setFlowStatus('prep')
        setTutorPhase('preparing', ctx)
        await playTutorSpeech(getTutorPrepMessage(ctx), 'prep', 5000, false)
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

      setFlowStatus('ready to record')
      return true
    } finally {
      listenFlowRunningRef.current = false
    }
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
    if (last.audioUnclear) {
      setFlowStatus('audio unclear — retry needed')
      tutorActionRef.current = 'retry'
      currentRepeatRef.current += 1
      return
    }

    const threshold = last.threshold || 75
    const passed = last.accuracy >= threshold || last.assistedAdvance

    if (passed && selectedChild) {
      recordPracticePass(selectedChild.id, last.surah, last.ayah, last.accuracy).catch(() => {})
      loadCurrentMastery(selectedChild.id, last.surah, last.ayah)
      lastPassedAyahRef.current = { surah: last.surah, ayah: last.ayah }
      currentRepeatRef.current = 0
    } else if (!passed) {
      currentRepeatRef.current += 1
    }

    setFlowStatus('waiting')

    const runFlow = async () => {
      try {
        // Step 1: Play context-aware tutor feedback (NOT raw backend voice_text)
        if (voiceTutor) {
          const feedbackCtx = buildTutorContext({
            accuracy: last.accuracy,
            passed,
            audioUnclear: last.audioUnclear,
            missingWords: last.missing?.map(m => m.word),
            repeatCount: currentRepeatRef.current,
          })
          setTutorPhase('giving_feedback', feedbackCtx)
          const { message: feedbackMsg, source } = await fetchTutorFeedback(last.tutorMemoryEventId ?? null, feedbackCtx)
          await playTutorSpeech(feedbackMsg, `playing tutor feedback (${source})`, 12000, false)
          setFlowStatus('tutor finished')
          await sleep(600)
        }

        // Step 2: Auto mode behavior
        if (autoMode) {
          if (passed) {
            // PASS: advance to next ayah using result's surah/ayah (not stale state)
            const next = getNextAyah(last.surah, last.ayah)
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
              repeatCount: currentRepeatRef.current,
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

            await sleep(300)
            await runAutoListenFlow(next.surah, next.ayah, selectedChild)
          } else {
            // FAIL: retry same ayah — supportive, not punishment
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
    setAyahText('Loading...')
    const text = await getAyahText(surah, ayah)
    setAyahText(stripLeadingBismillah(text || 'Arabic text unavailable', surah, ayah))
  }

  async function persistCurrentAyah(childId: number | undefined, surah: number, ayah: number) {
    if (!childId) return
    try {
      const updated = await updateChild(childId, { current_surah: surah, current_ayah: ayah })
      setChildren(prev => prev.map(child => child.id === childId ? updated : child))
      setSelectedChild(prev => prev?.id === childId ? { ...prev, ...updated } : prev)
    } catch (err) {
      console.warn('[NoorHafiz Progress] Failed to save progress:', err)
      setFlowStatus('progress not saved - check connection')
    }
  }

  async function setCurrentPracticeAyah(surah: number, ayah: number, childId?: number) {
    currentAyahRef.current = { surah, ayah }
    setSelectedChild(prev => prev ? { ...prev, current_surah: surah, current_ayah: ayah } : prev)
    setChildren(prev => prev.map(child => child.id === childId ? { ...child, current_surah: surah, current_ayah: ayah } : child))
    await loadAyahText(surah, ayah)
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
    try {
      await playTutorFeedback(text, tutorVoice)
    } catch {
      // Silently fail - fallback is handled inside playTutorFeedback
    }
  }

  async function handlePlayRecitationClick() {
    const { surah, ayah } = currentAyahRef.current
    if (autoMode) {
      const skipTutor = flowStatus.includes('blocked') || flowStatus.includes('tap Play Recitation')
      await runAutoListenFlow(surah, ayah, selectedChild, { skipTutor })
      return
    }

    // Manual mode: play ayah, switch to record, await prompt
    setTutorPhase('playing_ayah')
    const result = await playCurrentAyah(surah, ayah)
    if (result.played) {
      setPracticeStep('record')
      setTutorPhase('listening')
      if (voiceTutor) {
        await playTutorSpeech(getTutorRecordPrompt(buildTutorContext()), 'record prompt', 5000, false)
      }
    } else {
      clearTutorStatus()
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
                        Good repeats: {currentMastery.practice_pass_count ?? 0} of {selectedChild?.repeat_each_ayah ?? 3}
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

                      {/* Arabic ayah */}
                      <p className="arabic text-lg sm:text-2xl text-text-primary mb-6 text-center leading-[2.5]" style={{ minHeight: '3rem' }}>
                        {ayahText}
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

                              // Guard: prevent recording while tutor is still speaking
                              if (tutorSpeakingRef.current) {
                                console.log('[NoorHafiz Recording] Blocked - tutor still speaking')
                                setAudioError('Please wait until the tutor finishes speaking.')
                                return
                              }

                              console.log('[NoorHafiz Recording] Start clicked')
                              setAudioError('')
                              setRecordingPipelineStatus('requesting microphone')

                              // Resolve mic device label for debug logging
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
                                // Check mic permission
                                console.log('[NoorHafiz Recording] Requesting microphone...')
                                const permStatus = await navigator.permissions.query({ name: 'microphone' as PermissionName }).catch(() => null)
                                const permState = permStatus?.state || 'unknown'
                                setMicPermission(permState)
                                console.log('[NoorHafiz Recording] Mic permission:', permState)

                                const micConstraints = selectedMicId
                                  ? { audio: { deviceId: { exact: selectedMicId }, echoCancellation: true, noiseSuppression: true, autoGainControl: true } }
                                  : { audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } }
                                const stream = await navigator.mediaDevices.getUserMedia(micConstraints)
                                console.log('[NoorHafiz Recording] Microphone access granted', selectedMicId ? `(device: ${selectedMicId})` : '(default)')
                                setMicPermission('granted')
                                setRecordingPipelineStatus('recording')
                                const recorder = new MediaRecorder(stream)
                                const chunks: BlobPart[] = []
                                console.log('[NoorHafiz Recording] MediaRecorder created')

                                recorder.ondataavailable = e => {
                                  chunks.push(e.data)
                                  console.log('[NoorHafiz Recording] Chunk received, size:', e.data.size)
                                }

                                // Capture start time in local variable (NOT React state)
                                // because onstop closure captures values at creation time,
                                // and React state updates are batched/async
                                const startTimeMs = Date.now()

                                recorder.onstop = async () => {
                                  const durationSec = (Date.now() - startTimeMs) / 1000
                                  stream.getTracks().forEach(t => t.stop())
                                  setIsRecording(false)
                                  setRecordingPipelineStatus('preparing audio')

                                  // Guard: empty chunks
                                  if (chunks.length === 0) {
                                    console.warn('[NoorHafiz Recording] No audio chunks received')
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

                                  // ── [NoorHafiz Recording] detailed log ──
                                  console.log(
                                    `[NoorHafiz Recording] duration=${durationSec.toFixed(1)}s ` +
                                    `size=${blob.size} bytes (${(blob.size / 1024).toFixed(1)} KB) ` +
                                    `mime=${blob.type} mic="${micLabel}" ` +
                                    `surah=${selectedChild.current_surah} ayah=${selectedChild.current_ayah} ` +
                                    `child_id=${selectedChild.id}`,
                                  )

                                  // Guard: blob too small (under 3KB = likely silence/noise)
                                  if (blob.size < 3000) {
                                    console.warn('[NoorHafiz Recording] Audio blob too small:', blob.size)
                                    setAudioError('The recording was too short or empty. Please try again.')
                                    setScoring(false)
                                    setMediaRecorder(null)
                                    setRecordingPipelineStatus('audio too short')
                                    return
                                  }

                                  // Guard: recording too short
                                  if (durationSec < 1.0) {
                                    console.warn('[NoorHafiz Recording] Recording too short:', durationSec.toFixed(1) + 's')
                                    setAudioError('I did not hear enough audio. Please try again.')
                                    setScoring(false)
                                    setMediaRecorder(null)
                                    setRecordingPipelineStatus('audio too short')
                                    return
                                  }

                                  // ── SCORE THE RECORDING ──
                                  console.log('[NoorHafiz Scoring] sending audio to backend')
                                  setScoring(true)
                                  setMediaRecorder(null)
                                  setRecordingPipelineStatus('sending to scoring')
                                  setTutorPhase('scoring')

                                  try {
                                    const result = await scoreRecitation(blob, selectedChild.current_surah, selectedChild.current_ayah, selectedChild.id, durationSec)
                                    console.log('[NoorHafiz Scoring] response:', JSON.stringify(result, null, 2))
                                    setRecordingPipelineStatus('scoring complete')

                                    const micName = micLabel

                                    // If backend says audio is unclear
                                    if (result.audio_unclear) {
                                      const newResult = {
                                        _id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
                                        childId: selectedChild.id,
                                        surah: selectedChild.current_surah,
                                        ayah: selectedChild.current_ayah,
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

                                    // Normal scoring result
                                    const threshold = result.threshold || 75
                                    const scoreStatus = result.accuracy >= 90 ? 'mastered' : result.accuracy >= threshold ? 'practicing' : 'needs-work'
                                    const newResult = {
                                      _id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
                                      childId: selectedChild.id,
                                      surah: selectedChild.current_surah,
                                      ayah: selectedChild.current_ayah,
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
                                    // Stay on record step so user can retry - do NOT go to result
                                  } finally {
                                    setScoring(false)
                                    setMediaRecorder(null)
                                  }
                                }

                                recorder.start()
                                console.log('[NoorHafiz Recording] Recorder started')
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
                            disabled={scoring || tutorSpeaking}
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
                            {scoring ? (
                              <><RefreshCw className="w-5 h-5 animate-spin" /> Checking...</>
                            ) : isRecording ? (
                              <><Square className="w-5 h-5" /> Tap to stop recording</>
                            ) : tutorSpeaking ? (
                              <><Mic className="w-5 h-5 opacity-40" /> Wait for tutor...</>
                            ) : (
                              <><Mic className="w-5 h-5" /> Start Recording</>
                            )}
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

                          <button
                            onClick={() => setPracticeStep('listen')}
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
                              return (
                                <div className="bg-gold/10 rounded-xl p-4 text-center space-y-3">
                                  <AlertCircle className="w-8 h-8 text-gold-dark mx-auto mb-2" />
                                  <p className="font-bold text-gold-dark">Check your microphone</p>
                                  <p className="text-sm text-text-muted">
                                    {last.feedback || 'I could not hear your voice clearly. Check the microphone and try again.'}
                                  </p>
                                  {last.transcript && (
                                    <div className="text-left bg-surface-dark/30 rounded-lg p-3 space-y-1 text-xs font-mono text-text-muted">
                                      <p>📝 <b>Transcript:</b> {last.transcript}</p>
                                      {last.normalizedTranscript && <p>🔹 <b>Normalized:</b> {last.normalizedTranscript}</p>}
                                      {last.reference && <p>📖 <b>Reference:</b> {last.reference}</p>}
                                      {last.normalizedReference && <p>🔸 <b>Ref normalized:</b> {last.normalizedReference}</p>}
                                      {last.audioSizeKb != null && <p>📦 <b>Size:</b> {last.audioSizeKb} KB</p>}
                                      {last.durationSeconds != null && <p>⏱ <b>Duration:</b> {last.durationSeconds.toFixed(1)}s</p>}
                                      {last.audioUnclearReason && <p>🔴 <b>Reason:</b> {last.audioUnclearReason}</p>}
                                    </div>
                                  )}
                                  <p className="text-xs text-text-muted">Please check the microphone selected in Settings.</p>
                                </div>
                              )
                            }

                            const threshold = last.threshold || 75
                            const passed = last.accuracy >= threshold || last.assistedAdvance
                            const mastered = last.accuracy >= 90
                            const isBeginner = last.difficulty === 'beginner'
                            const failedColor = isBeginner ? 'bg-gold/10' : 'bg-danger-light'
                            const failedText = isBeginner ? 'text-gold-dark' : 'text-danger'
                            const failedLabel = isBeginner ? 'Keep practicing!' : 'Try again!'
                            const failedIcon = isBeginner ? <Target className="w-8 h-8 text-gold-dark mx-auto mb-2" /> : <XCircle className="w-8 h-8 text-danger mx-auto mb-2" />
                            return (
                              <div className={`rounded-xl p-4 text-center ${
                                last.assistedAdvance ? 'bg-gold/10' :
                                mastered ? 'bg-success-light' :
                                passed ? 'bg-gold/10' :
                                failedColor
                              }`}>
                                {last.assistedAdvance ? (
                                  <Target className="w-8 h-8 text-gold-dark mx-auto mb-2" />
                                ) : mastered ? (
                                  <CheckCircle2 className="w-8 h-8 text-primary mx-auto mb-2" />
                                ) : passed ? (
                                  <Target className="w-8 h-8 text-gold-dark mx-auto mb-2" />
                                ) : (
                                  failedIcon
                                )}
                                <p className={`font-bold ${
                                  last.assistedAdvance ? 'text-gold-dark' :
                                  mastered ? 'text-primary' :
                                  passed ? 'text-gold-dark' :
                                  failedText
                                }`}>
                                  {last.assistedAdvance ? 'Practice needed - moving on' :
                                   mastered ? 'Excellent!' :
                                   passed ? 'Good effort!' :
                                   failedLabel}
                                </p>
                                <p className="text-sm text-text-muted mt-1">
                                  Accuracy: {last.accuracy}% (need {threshold}%)
                                  {!isBeginner && ` - ${SURAHS.find(s => s.number === last.surah)?.name} :${last.ayah}`}
                                  {last.assistedAdvance && ` - attempt ${last.attemptNumber}`}
                                </p>
                                {last.feedback && (
                                  <p className="text-sm text-text-primary mt-2">{last.feedback}</p>
                                )}
                                {autoMode && flowStatus && (
                                  <p className="text-xs text-text-muted mt-2 font-mono bg-surface-dark/30 rounded px-2 py-1">
                                    flow: {flowStatus}
                                  </p>
                                )}
                                {autoMode && passed && !last.assistedAdvance && (
                                  <p className="text-sm text-primary mt-2 font-medium">
                                    ✨ Auto-advancing to next ayah...
                                  </p>
                                )}
                                {autoMode && last.assistedAdvance && (
                                  <p className="text-sm text-gold-dark mt-2 font-medium">
                                    📝 We'll practice this again later. Moving on...
                                  </p>
                                )}
                                {autoMode && !passed && (
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
                            return (
                              <div className="bg-surface-dark/50 rounded-xl p-3 space-y-2">
                                {last.reference && (
                                  <div>
                                    <p className="text-xs font-semibold text-text-muted mb-1">Correct recitation:</p>
                                    <p className="text-sm text-text-primary" dir="rtl">{last.reference}</p>
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
                          {/* Audio unclear: Record Again button */}
                          {(() => {
                            const last = ayahResults[ayahResults.length - 1]
                            if (last?.audioUnclear) {
                              return (
                                <button
                                  onClick={() => {
                                    setAyahResults(prev => prev.slice(0, -1))
                                    setPracticeStep('record')
                                  }}
                                  className="w-full bg-primary-dark text-white font-semibold py-3 rounded-xl hover:bg-primary transition-smooth flex items-center justify-center gap-2"
                                >
                                  <Mic className="w-4 h-4" />
                                  Record Again
                                </button>
                              )
                            }
                            return null
                          })()}
                          {/* Post-result flow is handled by useEffect above */}
                          {/* Manual: show Next Ayah button */}
                          {!autoMode && (() => {
                            const last = ayahResults[ayahResults.length - 1]
                            return !last?.audioUnclear
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
                          {(selectedChild?.hide_text_in_memory_check ?? true) ? '📖 ???' : ayahText}
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
              />
            )}
          </>
        )}
      </div>
    </div>
  )
}
