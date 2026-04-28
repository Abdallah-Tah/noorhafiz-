import { useNavigate } from 'react-router-dom'
import { useState, useEffect, useRef } from 'react'
import {
  Moon, LogOut, Mic, BarChart3, Star, Flame,
  Trophy, ChevronRight, Clock, Target,
  CheckCircle2, XCircle, AlertCircle, Users,
  Volume2, Square, RefreshCw, Bug, ChevronDown, ChevronUp
} from 'lucide-react'
import ThemeToggle from '../components/ThemeToggle'
import { logout, getProfile, getDashboard, updateProfile, updateChild, type User, type Child, type PracticeSession } from '../lib/api'
import { getAyahAudioUrl, getAyahText, playAudio, playTutorFeedback, previewTutorVoice, scoreRecitation, testMic, RECITERS, getSelectedReciter, setSelectedReciter, getTutorVoice, setTutorVoice, type TutorVoice, type ReciterId, type AudioResult } from '../lib/quran'
import SurahPicker from '../components/SurahPicker'

import { SURAHS } from '../lib/surahs'

export default function Dashboard() {
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState<'practice' | 'progress' | 'settings'>('practice')
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
  const [autoMode, setAutoMode] = useState(false)
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
    _id?: string
  }[]>([])
  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null)
  const [scoring, setScoring] = useState(false)

  // Microphone device selection
  const [micDevices, setMicDevices] = useState<MediaDeviceInfo[]>([])
  const [selectedMicId, setSelectedMicId] = useState<string>(() => localStorage.getItem('nh-mic-device') || '')

  // Recording diagnostics
  const [recordingStartTime, setRecordingStartTime] = useState<number | null>(null)
  const [lastRecordingDuration, setLastRecordingDuration] = useState<number>(0)
  const [lastBlobSize, setLastBlobSize] = useState<number>(0)
  const [lastBlobMime, setLastBlobMime] = useState<string>('')
  const [micPermission, setMicPermission] = useState<string>('unknown')
  const [showDebug, setShowDebug] = useState(false)
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

  // Single source of truth for current ayah — always up to date
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
  const spokenAyahIntroKeys = useRef<Set<string>>(new Set())
  const listenFlowRunningRef = useRef(false)
  const tutorUnavailableUntilRef = useRef(0)

  function sleep(ms: number): Promise<void> {
    return new Promise(r => setTimeout(r, ms))
  }

  // Pure helper — no state dependency
  function getNextAyah(surah: number, ayah: number): { surah: number; ayah: number } | null {
    const surahData = SURAHS.find(s => s.number === surah)
    if (!surahData) return null
    let nextSurah = surah
    let nextAyah = ayah + 1
    if (nextAyah > surahData.ayahs) {
      const next = SURAHS.find(s => s.number === nextSurah + 1)
      if (next) { nextSurah = next.number; nextAyah = 1 }
      else return null // end of Quran
    }
    return { surah: nextSurah, ayah: nextAyah }
  }

  function getSurahName(surah: number): string {
    return SURAHS.find(s => s.number === surah)?.name || `Surah ${surah}`
  }

  function getAyahIntroText(surah: number, ayah: number): string {
    return `Now we will practice ${getSurahName(surah)}, Ayah ${ayah}. Listen carefully, then repeat.`
  }

  function getSurahOnboardingText(child: Child | null, surah: number): string {
    const childName = child?.name || 'my student'
    return `Assalamu alaikum ${childName}! Today we will practice ${getSurahName(surah)}. First, listen carefully. Then press record and recite. I will help you with mistakes. Let’s begin.`
  }

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
    if (Date.now() < tutorUnavailableUntilRef.current) {
      setFlowStatus('Tutor voice unavailable — continuing')
      return false
    }

    setFlowStatus(status)
    const played = await playTutorFeedback(text, tutorVoice, { fetchTimeoutMs, fallback: allowFallback }).catch(() => false)

    if (!played) {
      tutorUnavailableUntilRef.current = Date.now() + 60_000
      setFlowStatus('Tutor voice unavailable — continuing')
      return false
    }

    tutorUnavailableUntilRef.current = 0
    return true
  }

  async function playOnboardingAndAyahIntro(child: Child | null, surah: number, ayah: number, forceIntro = false) {
    if (!voiceTutor) return

    const childId = child?.id
    if (shouldShowOnboarding(childId, surah)) {
      await playTutorSpeech(getSurahOnboardingText(child, surah), 'playing surah welcome', 15000, false)
      markOnboardingDone(childId, surah)
    }

    const introKey = `${childId || 'unknown'}:${surah}:${ayah}`
    if (forceIntro || !spokenAyahIntroKeys.current.has(introKey)) {
      spokenAyahIntroKeys.current.add(introKey)
      await playTutorSpeech(getAyahIntroText(surah, ayah), `playing tutor intro for ayah ${ayah}`, 12000, false)
    }
  }

  async function runAutoListenFlow(surah: number, ayah: number, child: Child | null, options: { skipTutor?: boolean } = {}) {
    if (listenFlowRunningRef.current) return false
    listenFlowRunningRef.current = true
    try {
      if (!options.skipTutor) {
        await playOnboardingAndAyahIntro(child, surah, ayah)
      }

      setFlowStatus(`playing ayah ${ayah}`)
      const audioResult = await playCurrentAyah(surah, ayah)
      if (!audioResult.played) {
        setPracticeStep('listen')
        setFlowStatus(`audio ${audioResult.reason || 'blocked'} — tap Play Recitation to continue`)
        return false
      }

      setFlowStatus('ready to record')
      setPracticeStep('record')
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
    handledResultIds.current.add(rid)

    // If audio was unclear, do NOT auto-advance or trigger any flow
    if (last.audioUnclear) {
      setFlowStatus('audio unclear — retry needed')
      return
    }

    const threshold = last.threshold || 75
    const passed = last.accuracy >= threshold || last.assistedAdvance

    setFlowStatus('waiting')

    const runFlow = async () => {
      try {
        // Step 1: Play tutor feedback if voice is ON
        if (voiceTutor && last.voiceText) {
          await playTutorSpeech(last.voiceText, 'playing tutor feedback', 12000, false)
          setFlowStatus('tutor finished')
        }

        // Step 2: Auto mode behavior
        if (autoMode) {
          if (passed) {
            // PASS: advance to next ayah using result's surah/ayah (not stale state)
            const next = getNextAyah(last.surah, last.ayah)
            if (!next) {
              setFlowStatus('completed all Quran!')
              setAutoMode(false)
              return
            }

            setFlowStatus('advancing')
            await sleep(500)

            // Update ref + UI + DB using the next ayah as source of truth
            setFlowStatus('loading next ayah')
            await setCurrentPracticeAyah(next.surah, next.ayah, last.childId ?? selectedChild?.id)
            setPracticeStep('listen')

            // Tutor intro + next ayah recitation + record
            await sleep(300)
            await runAutoListenFlow(next.surah, next.ayah, selectedChild)
          } else {
            // FAIL: play correct ayah again, then go to record
            await sleep(300)
            await runAutoListenFlow(last.surah, last.ayah, selectedChild, { skipTutor: true })
          }
        } else {
          setFlowStatus('manual mode')
        }
      } catch (err) {
        setFlowStatus(`flow error: ${err}`)
      }
    }

    runFlow()
  }, [practiceStep, ayahResults.length])

  async function loadAyahText(surah: number, ayah: number) {
    setAyahText('Loading...')
    const text = await getAyahText(surah, ayah)
    setAyahText(text || 'Arabic text unavailable')
  }

  async function persistCurrentAyah(childId: number | undefined, surah: number, ayah: number) {
    if (!childId) return
    try {
      const updated = await updateChild(childId, { current_surah: surah, current_ayah: ayah })
      setChildren(prev => prev.map(child => child.id === childId ? updated : child))
      setSelectedChild(prev => prev?.id === childId ? { ...prev, ...updated } : prev)
    } catch (err) {
      console.warn('[NoorHafiz Progress] Failed to save progress:', err)
      setFlowStatus('progress not saved — check connection')
    }
  }

  async function setCurrentPracticeAyah(surah: number, ayah: number, childId?: number) {
    currentAyahRef.current = { surah, ayah }
    setSelectedChild(prev => prev ? { ...prev, current_surah: surah, current_ayah: ayah } : prev)
    setChildren(prev => prev.map(child => child.id === childId ? { ...child, current_surah: surah, current_ayah: ayah } : child))
    await loadAyahText(surah, ayah)
    await persistCurrentAyah(childId, surah, ayah)
  }

  async function advanceToNextAyah() {
    if (!selectedChild) return
    const next = getNextAyah(currentAyahRef.current.surah, currentAyahRef.current.ayah)
    if (!next) { setAutoMode(false); return }
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
      // Silently fail — fallback is handled inside playTutorFeedback
    }
  }

  async function handlePlayRecitationClick() {
    const { surah, ayah } = currentAyahRef.current
    if (autoMode) {
      const skipTutor = flowStatus.includes('blocked') || flowStatus.includes('tap Play Recitation')
      await runAutoListenFlow(surah, ayah, selectedChild, { skipTutor })
      return
    }

    await playCurrentAyah(surah, ayah)
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

  function handleChildSwitch(child: Child) {
    setSelectedChild(child)
    currentAyahRef.current = { surah: child.current_surah, ayah: child.current_ayah }
    setVoiceTutor(child.voice_tutor ?? true)
    setPracticeStep('listen')
    loadChildData(child.id)
  }

  async function handleSaveSettings() {
    if (!user) return
    try {
      const updated = await updateProfile({
        name: user.name,
        language: user.language,
        qiraa: user.qiraa,
      })
      setUser(updated)
      alert('Settings saved!')
    } catch (err: any) {
      alert(err.message)
    }
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
                    <div className="p-4 sm:p-6">
                      {/* Arabic ayah */}
                      <p className="arabic text-lg sm:text-2xl text-text-primary mb-6 text-center leading-[2.5]" style={{ minHeight: '3rem' }}>
                        {ayahText}
                      </p>

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
                      {practiceStep === 'listen' && (
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
                                {selectedChild.difficulty?.charAt(0).toUpperCase() + selectedChild.difficulty?.slice(1)} mode — pass at {selectedChild.difficulty === 'beginner' ? '50' : selectedChild.difficulty === 'medium' ? '75' : selectedChild.difficulty === 'advanced' ? '85' : '90'}%
                              </span>
                            </div>
                          )}
                          <p className="text-center text-text-muted text-sm">
                            {autoMode
                              ? 'Auto mode: listen → record → next ayah automatically'
                              : getAyahIntroText(currentAyahRef.current.surah, currentAyahRef.current.ayah)
                            }
                          </p>
                          {!autoMode && voiceTutor && (
                            <button
                              onClick={() => playOnboardingAndAyahIntro(selectedChild, currentAyahRef.current.surah, currentAyahRef.current.ayah, true)}
                              className="w-full bg-surface-dark text-text-primary font-semibold py-2.5 rounded-xl hover:bg-surface-dark/80 transition-smooth flex items-center justify-center gap-2 text-sm"
                            >
                              <Mic className="w-4 h-4" /> Play Tutor Intro
                            </button>
                          )}
                          {autoMode && flowStatus && practiceStep === 'listen' && (
                            <div className={`text-center text-xs font-medium rounded-xl px-3 py-2 ${
                              flowStatus.includes('blocked') || flowStatus.includes('tap')
                                ? 'bg-gold/10 text-gold-dark border border-gold/20'
                                : 'bg-surface-dark text-text-muted'
                            }`}>
                              {flowStatus.includes('blocked') || flowStatus.includes('tap')
                                ? 'iPhone blocked auto audio — tap Play Recitation to continue'
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
                            Skip — I already know this ayah
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
                                console.log('[NH] Stop clicked — stopping recorder')
                                setRecordingPipelineStatus('stopping recording')
                                try {
                                  mediaRecorder.stop()
                                } catch (e) {
                                  console.warn('[NH] recorder.stop() error:', e)
                                  setIsRecording(false)
                                  setMediaRecorder(null)
                                  setRecordingPipelineStatus('idle')
                                }
                                return
                              }

                              // ── START RECORDING ──
                              console.log('[NH] Start Recording clicked')
                              setAudioError('')
                              setRecordingPipelineStatus('requesting microphone')

                              try {
                                // Check mic permission
                                console.log('[NH] Requesting microphone...')
                                const permStatus = await navigator.permissions.query({ name: 'microphone' as PermissionName }).catch(() => null)
                                const permState = permStatus?.state || 'unknown'
                                setMicPermission(permState)
                                console.log('[NH] Mic permission:', permState)

                                const micConstraints = selectedMicId
                                  ? { audio: { deviceId: { exact: selectedMicId }, echoCancellation: true, noiseSuppression: true, autoGainControl: true } }
                                  : { audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } }
                                const stream = await navigator.mediaDevices.getUserMedia(micConstraints)
                                console.log('[NH] Microphone access granted', selectedMicId ? `(device: ${selectedMicId})` : '(default)')
                                setMicPermission('granted')
                                setRecordingPipelineStatus('recording')
                                const recorder = new MediaRecorder(stream)
                                const chunks: BlobPart[] = []
                                console.log('[NH] MediaRecorder created')

                                recorder.ondataavailable = e => {
                                  chunks.push(e.data)
                                  console.log('[NH] Chunk received, size:', e.data.size)
                                }

                                // Capture start time in local variable (NOT React state)
                                // because onstop closure captures values at creation time,
                                // and React state updates are batched/async
                                const startTimeMs = Date.now()
                                setRecordingStartTime(startTimeMs)

                                recorder.onstop = async () => {
                                  const durationSec = (Date.now() - startTimeMs) / 1000
                                  console.log('[NH] Recorder stopped. Total chunks:', chunks.length, 'Duration:', durationSec.toFixed(1) + 's')
                                  stream.getTracks().forEach(t => t.stop())
                                  setIsRecording(false)
                                  setRecordingStartTime(null)
                                  setRecordingPipelineStatus('preparing audio')

                                  // Guard: empty chunks
                                  if (chunks.length === 0) {
                                    console.warn('[NH] No audio chunks received')
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

                                  console.log('[NH] Audio blob created', {
                                    durationSec: durationSec.toFixed(1),
                                    blobSizeKB: (blob.size / 1024).toFixed(1),
                                    mimeType: blob.type,
                                  })

                                  // Guard: blob too small (under 3KB = likely silence/noise)
                                  if (blob.size < 3000) {
                                    console.warn('[NH] Audio blob too small:', blob.size)
                                    setAudioError('The recording was too short or empty. Please try again.')
                                    setScoring(false)
                                    setMediaRecorder(null)
                                    setRecordingPipelineStatus('audio too short')
                                    return
                                  }

                                  // Guard: recording too short
                                  if (durationSec < 1.0) {
                                    console.warn('[NH] Recording too short:', durationSec.toFixed(1) + 's')
                                    setAudioError('I did not hear enough audio. Please try again.')
                                    setScoring(false)
                                    setMediaRecorder(null)
                                    setRecordingPipelineStatus('audio too short')
                                    return
                                  }

                                  // ── SCORE THE RECORDING ──
                                  console.log('[NH] Sending to /recite/score...')
                                  setScoring(true)
                                  setMediaRecorder(null)
                                  setRecordingPipelineStatus('sending to scoring')

                                  try {
                                    const result = await scoreRecitation(blob, selectedChild.current_surah, selectedChild.current_ayah, selectedChild.id, durationSec)
                                    console.log('[NH] /recite/score response received', {
                                      accuracy: result.accuracy,
                                      audio_unclear: result.audio_unclear,
                                      audio_unclear_reason: result.audio_unclear_reason,
                                      audio_size_kb: result.audio_size_kb,
                                      transcript: result.transcript,
                                    })
                                    setRecordingPipelineStatus('scoring complete')

                                    // If backend says audio is unclear
                                    if (result.audio_unclear) {
                                      console.log('[NH] Audio unclear — showing retry')
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
                                        audioUnclearReason: result.audio_unclear_reason,
                                      }
                                      setAyahResults(prev => [...prev, newResult])
                                      setAudioError('')
                                      console.log('[NH] setPracticeStep(result) called — unclear')
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
                                    }
                                    setAyahResults(prev => [...prev, newResult])
                                    setAudioError('')
                                    console.log('[NH] setPracticeStep(result) called — scored:', result.accuracy + '%')
                                    setPracticeStep('result')
                                    setRecordingPipelineStatus('result shown')
                                  } catch (err: any) {
                                    console.error('[NH] Scoring failed:', err)
                                    setAudioError(err.message || 'Scoring failed. Please check your connection and try again.')
                                    setRecordingPipelineStatus('scoring failed')
                                    // Stay on record step so user can retry — do NOT go to result
                                  } finally {
                                    setScoring(false)
                                    setMediaRecorder(null)
                                  }
                                }

                                recorder.start()
                                console.log('[NH] Recorder started')
                                setMediaRecorder(recorder)
                                setIsRecording(true)
                              } catch {
                                console.error('[NH] Microphone access denied')
                                setMicPermission('denied')
                                setAudioError('Microphone access denied. Please allow microphone permission.')
                                setIsRecording(false)
                                setScoring(false)
                                setRecordingPipelineStatus('idle')
                              }
                            }}
                            disabled={scoring}
                            className={`w-full font-semibold py-4 rounded-xl flex items-center justify-center gap-3 transition-smooth ${
                              scoring
                                ? 'bg-text-muted text-white opacity-60 cursor-not-allowed'
                                : isRecording
                                  ? 'bg-danger text-white animate-pulse shadow-md shadow-danger/20'
                                  : 'bg-primary-dark text-white hover:bg-primary shadow-md shadow-primary/20'
                            }`}
                          >
                            {scoring ? (
                              <><RefreshCw className="w-5 h-5 animate-spin" /> Analyzing...</>
                            ) : isRecording ? (
                              <><Square className="w-5 h-5" /> Tap to stop recording</>
                            ) : (
                              <><Mic className="w-5 h-5" /> Start Recording</>
                            )}
                          </button>

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
                                  {last.assistedAdvance ? 'Practice needed — moving on' :
                                   mastered ? 'Excellent!' :
                                   passed ? 'Good effort!' :
                                   failedLabel}
                                </p>
                                <p className="text-sm text-text-muted mt-1">
                                  Accuracy: {last.accuracy}% (need {threshold}%)
                                  {!isBeginner && ` — ${SURAHS.find(s => s.number === last.surah)?.name} :${last.ayah}`}
                                  {last.assistedAdvance && ` — attempt ${last.attemptNumber}`}
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
                  </div>

                  {/* Surah picker */}
                  <SurahPicker
                    currentSurah={selectedChild.current_surah}
                    currentAyah={selectedChild.current_ayah}
                    onSelect={async (surah, ayah) => {
                      await setCurrentPracticeAyah(surah, ayah, selectedChild.id)
                      setPracticeStep('listen')
                      setAyahResults([])
                      setFlowStatus('')
                    }}
                  />

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
                            title={`${SURAHS.find(s => s.number === r.surah)?.name} :${r.ayah} — ${r.accuracy}%`}
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
                <p className="text-text-muted mb-6">Detailed analytics coming soon — mastery heatmaps, Tajweed breakdown, and weekly reports.</p>
                <div className="inline-flex items-center gap-2 bg-primary/10 text-primary px-4 py-2 rounded-xl text-sm font-medium">
                  <Flame className="w-4 h-4" />
                  {mastered} ayahs mastered so far
                </div>
              </div>
            )}

            {/* Settings tab */}
            {activeTab === 'settings' && (
              <div className="bg-surface-card rounded-2xl p-8 border border-surface-dark max-w-lg mx-auto">
                <h3 className="text-xl font-bold mb-6 text-text-primary">Settings</h3>
                <div className="space-y-5">
                  <div>
                    <label className="block text-sm font-medium text-text-secondary mb-2">Display Name</label>
                    <input
                      type="text"
                      value={user.name}
                      onChange={e => setUser({ ...user, name: e.target.value })}
                      className="w-full px-4 py-3 rounded-xl border border-surface-dark bg-surface text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-smooth"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-text-secondary mb-2">Qira'ah</label>
                    <select
                      value={user.qiraa}
                      onChange={e => setUser({ ...user, qiraa: e.target.value })}
                      className="w-full px-4 py-3 rounded-xl border border-surface-dark bg-surface text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-smooth"
                    >
                      <option value="hafs">Hafs (عاصم)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-text-secondary mb-2">Feedback Language</label>
                    <select
                      value={user.language}
                      onChange={e => setUser({ ...user, language: e.target.value })}
                      className="w-full px-4 py-3 rounded-xl border border-surface-dark bg-surface text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-smooth"
                    >
                      <option value="en">English</option>
                      <option value="ar">العربية</option>
                      <option value="fr">Français</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-text-secondary mb-2">Reciter (Qari)</label>
                    <select
                      value={reciter}
                      onChange={e => { const v = e.target.value as ReciterId; setReciter(v); setSelectedReciter(v) }}
                      className="w-full px-4 py-3 rounded-xl border border-surface-dark bg-surface text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-smooth"
                    >
                      {RECITERS.map(r => (
                        <option key={r.id} value={r.id}>{r.name}</option>
                      ))}
                    </select>
                  </div>

                  <button
                    onClick={handleSaveSettings}
                    className="w-full bg-primary-dark text-white font-semibold py-3 rounded-xl hover:bg-primary transition-smooth mt-4"
                  >
                    Save Changes
                  </button>

                  {/* Debug Mode Section */}
                  <div className="border-t border-surface-dark pt-5 mt-5">
                    <button
                      onClick={() => setShowDebug(!showDebug)}
                      className="flex items-center gap-2 text-sm font-medium text-text-muted hover:text-text-primary transition-smooth"
                    >
                      <Bug className="w-4 h-4" />
                      Recording Diagnostics
                      {showDebug ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                    </button>

                    {showDebug && (
                      <div className="mt-4 space-y-4">
                        {/* Debug mode toggle */}
                        <div className="flex items-center justify-between">
                          <label className="text-sm text-text-primary">Debug mode (show recording info)</label>
                          <button
                            onClick={() => {
                              const newVal = !debugMode
                              setDebugMode(newVal)
                              localStorage.setItem('nh-debug', String(newVal))
                            }}
                            className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-smooth ${
                              debugMode ? 'bg-primary text-white' : 'bg-surface-dark text-text-muted'
                            }`}
                          >
                            {debugMode ? 'ON' : 'OFF'}
                          </button>
                        </div>

                        {/* Mic test */}
                        <div className="bg-surface rounded-xl p-4 border border-surface-dark">
                          <p className="text-sm font-medium text-text-primary mb-3">🎤 Microphone Setup</p>

                          {/* Mic device selector */}
                          <div className="mb-4">
                            <label className="block text-xs font-medium text-text-muted mb-1">Microphone</label>
                            <select
                              value={selectedMicId}
                              onChange={e => {
                                setSelectedMicId(e.target.value)
                                localStorage.setItem('nh-mic-device', e.target.value)
                              }}
                              onClick={async () => {
                                try {
                                  const devices = await navigator.mediaDevices.enumerateDevices()
                                  const mics = devices.filter(d => d.kind === 'audioinput')
                                  setMicDevices(mics)
                                } catch { /* permission needed first */ }
                              }}
                              className="w-full px-3 py-2 rounded-lg border border-surface-dark bg-surface text-text-primary text-xs focus:outline-none focus:ring-1 focus:ring-primary/30"
                            >
                              <option value="">Default Microphone</option>
                              {micDevices.map(d => (
                                <option key={d.deviceId} value={d.deviceId}>{d.label || `Microphone ${d.deviceId.slice(0, 8)}`}</option>
                              ))}
                            </select>
                            <p className="text-[10px] text-text-muted mt-1">
                              Click the dropdown to refresh. Use the right mic for Quran recitation.
                            </p>
                          </div>

                          {/* Test button */}
                          <p className="text-sm font-medium text-text-primary mb-2">🔊 Test Microphone</p>
                          <p className="text-xs text-text-muted mb-3">Record 3 seconds to check if your mic and Whisper are working.</p>
                          <button
                            onClick={async () => {
                              if (micTesting) return
                              try {
                                setMicTesting(true)
                                setMicTestResult(null)
                                const stream = await navigator.mediaDevices.getUserMedia({
                                  audio: selectedMicId ? { deviceId: { exact: selectedMicId } } : true,
                                })
                                const recorder = new MediaRecorder(stream)
                                const chunks: BlobPart[] = []
                                const testStart = Date.now()

                                recorder.ondataavailable = e => chunks.push(e.data)
                                recorder.onstop = async () => {
                                  stream.getTracks().forEach(t => t.stop())
                                  const duration = (Date.now() - testStart) / 1000
                                  const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' })
                                  try {
                                    const result = await testMic(blob, duration)
                                    const clearStatus = result.audio_unclear ? '\u26a0\ufe0f Yes - Check mic setup in Settings.' : '\u2705 Clear - Mic is working.'
                                    setMicTestResult(
                                      `\U0001f399 Mic Test Results:` + '\n' +
                                      `  Transcript: ${result.transcript || '(nothing)'}` + '\n' +
                                      `  Normalized: ${result.normalized_transcript || '(empty)'}` + '\n' +
                                      `  Size: ${result.audio_size_kb} KB | Duration: ${result.duration_seconds.toFixed(1)}s` + '\n' +
                                      `  Arabic: ${result.has_meaningful_arabic ? '\u2705 Yes' : '\u274c No'} | Quality: ${clearStatus}` + '\n' +
                                      `  ${result.audio_unclear_reason ? 'Reason: ' + result.audio_unclear_reason : ''}`
                                    )                                  } catch (err: any) {
                                    setMicTestResult(`Error: ${err.message}`)
                                  } finally {
                                    setMicTesting(false)
                                  }
                                }

                                recorder.start()
                                // Stop after 3 seconds
                                setTimeout(() => {
                                  if (recorder.state === 'recording') {
                                    recorder.stop()
                                  }
                                }, 3000)
                              } catch {
                                setMicTestResult('Microphone access denied.')
                                setMicTesting(false)
                              }
                            }}
                            disabled={micTesting}
                            className={`w-full py-2.5 rounded-xl text-sm font-semibold transition-smooth ${
                              micTesting
                                ? 'bg-danger text-white animate-pulse'
                                : 'bg-primary-dark text-white hover:bg-primary'
                            }`}
                          >
                            {micTesting ? 'Recording 3s...' : 'Test Microphone'}
                          </button>
                          {micTestResult && (
                            <pre className="mt-3 text-xs bg-surface-dark rounded-lg p-3 text-text-primary whitespace-pre-wrap font-mono">
                              {micTestResult}
                            </pre>
                          )}
                        </div>

                        {/* Last recording info */}
                        {lastBlobSize > 0 && (
                          <div className="bg-surface rounded-xl p-4 border border-surface-dark">
                            <p className="text-sm font-medium text-text-primary mb-2">Last Recording</p>
                            <div className="text-xs font-mono text-text-muted space-y-1">
                              <p>Duration: {lastRecordingDuration.toFixed(1)}s</p>
                              <p>Blob size: {(lastBlobSize / 1024).toFixed(1)} KB</p>
                              <p>MIME: {lastBlobMime}</p>
                              <p>Mic permission: {micPermission}</p>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
