import { useEffect, useMemo, useRef, useState } from 'react'
import { X, Mic, Volume2, ArrowRight, CheckCircle2, Award, Info, AlertTriangle } from 'lucide-react'
import {
  playTutorFeedback,
  getTutorVoice,
  listArabicBrowserVoices,
  prepareTutorAudio,
  playPreparedTutorAudio,
  type TutorVoice,
  type TutorSpeechResult,
  type TutorPreparedAudio,
} from '../lib/quran'
import { arabicVoiceFor, getTajweedRetryCoaching, getTajweedSuccessCoaching, getTajweedWordCue } from '../lib/tutor'
import { scoreWordDrill } from '../lib/api'
import { recordDrillPass, type TajweedLessonProgress } from '../lib/tajweed'
import { getMicStream } from '../lib/recording'

type Phase = 'intro' | 'demo' | 'recording' | 'scoring' | 'feedback' | 'done'

const MADD_LETTER_LABELS: Record<string, string> = {
  'ا': 'the long alif (aaa)',
  'و': 'the long waw (ooo)',
  'ي': 'the long ya (eee)',
}

const FULL_HARAKAT_TTS = { readingMode: 'full_harakat' as const }
const PROFESSOR_TTS = { deliveryStyle: 'professor' as const }

interface Props {
  lesson: TajweedLessonProgress
  childId: number
  onClose: () => void
  /** Called when the lesson reaches mastered status, so the tree can refresh. */
  onProgressChange: (updated: TajweedLessonProgress) => void
}

function describeMaddMissing(missing: string[] | undefined): string | null {
  if (!missing || missing.length === 0) return null
  const labels = missing.map(l => MADD_LETTER_LABELS[l] || l)
  if (labels.length === 1) return `Hold ${labels[0]} longer next time.`
  return `Hold ${labels.join(' and ')} longer next time.`
}

export default function TajweedLessonPlayer({ lesson, childId, onClose, onProgressChange }: Props) {
  const [wordIndex, setWordIndex] = useState(0)
  const [phase, setPhase] = useState<Phase>('intro')
  const [feedback, setFeedback] = useState<{ matched: boolean; transcript?: string; maddMissing?: string[] } | null>(null)
  const [busy, setBusy] = useState(false)
  const [drillPassCount, setDrillPassCount] = useState(lesson.drill_pass_count)
  const [mastered, setMastered] = useState(lesson.status === 'mastered')
  // Most recent TTS playback result — drives the debug bar.
  const [ttsDebug, setTtsDebug] = useState<TutorSpeechResult | null>(null)
  const [ttsDebugOpen, setTtsDebugOpen] = useState(false)
  const [preparedAudio, setPreparedAudio] = useState<Record<string, TutorPreparedAudio>>({})
  const [audioPreparing, setAudioPreparing] = useState(false)
  const arabicBrowserVoices = listArabicBrowserVoices()

  const tutorVoice = getTutorVoice() as TutorVoice
  const professorVoice: TutorVoice = 'english_male'
  const arabicVoice = arabicVoiceFor(tutorVoice)
  const word = lesson.demo_words[wordIndex]
  const target = lesson.drill_pass_target
  const wordCue = useMemo(
    () => getTajweedWordCue(lesson.stage, lesson.topic_key, word || ''),
    [lesson.stage, lesson.topic_key, word],
  )
  const successCoaching = useMemo(
    () => getTajweedSuccessCoaching(lesson.stage, lesson.topic_key, word || ''),
    [lesson.stage, lesson.topic_key, word],
  )
  const retryCoaching = useMemo(
    () => getTajweedRetryCoaching(lesson.stage, lesson.topic_key, word || ''),
    [lesson.stage, lesson.topic_key, word],
  )

  // Stop any in-flight playback / mic when the player closes
  const recorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  useEffect(() => {
    return () => {
      try { recorderRef.current?.stop() } catch { /* fine */ }
      streamRef.current?.getTracks().forEach(t => t.stop())
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    async function prepareLessonAudio() {
      if (!word) return
      setAudioPreparing(true)
      const entries: Array<[string, Promise<TutorPreparedAudio | null>]> = [
        ['intro', prepareTutorAudio(lesson.explanation_en, professorVoice, { fetchTimeoutMs: 20000, ...PROFESSOR_TTS })],
        [`cue-${wordIndex}`, prepareTutorAudio(wordCue, professorVoice, { fetchTimeoutMs: 12000, ...PROFESSOR_TTS })],
        [`success-${wordIndex}`, prepareTutorAudio(successCoaching, professorVoice, { fetchTimeoutMs: 12000, ...PROFESSOR_TTS })],
        [`retry-${wordIndex}`, prepareTutorAudio(retryCoaching, professorVoice, { fetchTimeoutMs: 12000, ...PROFESSOR_TTS })],
        [`word-${wordIndex}-slow`, prepareTutorAudio(word, arabicVoice, { fetchTimeoutMs: 12000, slow: true, ...FULL_HARAKAT_TTS })],
        [`word-${wordIndex}-normal`, prepareTutorAudio(word, arabicVoice, { fetchTimeoutMs: 10000, ...FULL_HARAKAT_TTS })],
      ]

      const results = await Promise.all(entries.map(async ([key, promise]) => [key, await promise] as const))
      if (cancelled) return
      const next: Record<string, TutorPreparedAudio> = {}
      results.forEach(([key, clip]) => {
        if (clip) next[key] = clip
      })
      setPreparedAudio(next)
      setAudioPreparing(false)
    }
    prepareLessonAudio().catch(err => {
      console.warn('[TajweedPlayer] lesson audio prepare failed:', err)
      if (!cancelled) setAudioPreparing(false)
    })
    return () => { cancelled = true }
  }, [lesson.id, lesson.explanation_en, arabicVoice, word, wordIndex, wordCue, successCoaching, retryCoaching])

  async function playPreparedOrGenerate(
    key: string,
    text: string,
    voice: TutorVoice,
    options: Parameters<typeof prepareTutorAudio>[2] = {},
  ): Promise<TutorSpeechResult> {
    const existing = preparedAudio[key]
    const clip = existing || await prepareTutorAudio(text, voice, options)
    if (clip && !existing) {
      setPreparedAudio(prev => ({ ...prev, [key]: clip }))
    }
    if (clip) {
      const result = await playPreparedTutorAudio(clip)
      setTtsDebug(result)
      return result
    }
    const result = await playTutorFeedback(text, voice, { ...options, fallback: false })
    setTtsDebug(result)
    return result
  }

  async function playIntro() {
    if (busy) return
    setBusy(true)
    try {
      await playPreparedOrGenerate('intro', lesson.explanation_en, professorVoice, { fetchTimeoutMs: 20000, ...PROFESSOR_TTS })
    } finally {
      setBusy(false)
    }
  }

  async function playSlow() {
    if (busy || !word) return
    setBusy(true)
    try {
      await playPreparedOrGenerate(`word-${wordIndex}-slow`, word, arabicVoice, { fetchTimeoutMs: 12000, slow: true, ...FULL_HARAKAT_TTS })
    } finally {
      setBusy(false)
    }
  }

  async function playCue() {
    if (busy || !wordCue) return
    setBusy(true)
    try {
      await playPreparedOrGenerate(`cue-${wordIndex}`, wordCue, professorVoice, { fetchTimeoutMs: 12000, ...PROFESSOR_TTS })
    } finally {
      setBusy(false)
    }
  }

  async function playNormal() {
    if (busy || !word) return
    setBusy(true)
    try {
      await playPreparedOrGenerate(`word-${wordIndex}-normal`, word, arabicVoice, { fetchTimeoutMs: 10000, ...FULL_HARAKAT_TTS })
    } finally {
      setBusy(false)
    }
  }

  async function recordAndScore() {
    if (busy || !word) return
    setBusy(true)
    setPhase('recording')
    setFeedback(null)
    let stream: MediaStream | null = null
    try {
      const micId = localStorage.getItem('nh-mic-device') || ''
      stream = await getMicStream(micId)
      streamRef.current = stream
      const recorder = new MediaRecorder(stream)
      recorderRef.current = recorder
      const chunks: Blob[] = []
      recorder.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data) }
      const stopped = new Promise<void>(resolve => { recorder.onstop = () => resolve() })
      recorder.start()
      await new Promise(r => setTimeout(r, 4000))
      if (recorder.state !== 'inactive') recorder.stop()
      await stopped

      if (!chunks.length) {
        setFeedback({ matched: false })
        setPhase('feedback')
        return
      }

      const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' })
      setPhase('scoring')
      const result = await scoreWordDrill(childId, word, blob, 4)
      setFeedback({ matched: result.matched, transcript: result.transcript, maddMissing: result.madd_missing })
      setPhase('feedback')

      if (result.matched) {
        try {
          const updated = await recordDrillPass(lesson.id, childId)
          setDrillPassCount(updated.drill_pass_count)
          if (updated.status === 'mastered') {
            setMastered(true)
          }
          onProgressChange(updated)
        } catch (err) {
          console.warn('[TajweedPlayer] drill-pass record failed:', err)
        }
        // Spoken praise (user voice) + reinforcement of the correct word in
        // Arabic voice. Mirrors how a teacher confirms a clean attempt.
        await playPreparedOrGenerate(`success-${wordIndex}`, successCoaching, professorVoice, { fetchTimeoutMs: 12000, ...PROFESSOR_TTS })
        await playPreparedOrGenerate(`word-${wordIndex}-normal`, word, arabicVoice, { fetchTimeoutMs: 10000, ...FULL_HARAKAT_TTS })
      } else {
        // Spoken coaching (user voice) — stage-aware so the kid knows WHAT
        // to listen for, not just "try again". Then replay the slow Arabic
        // demo so they hear the correct articulation immediately before
        // their next attempt.
        await playPreparedOrGenerate(`retry-${wordIndex}`, retryCoaching, professorVoice, { fetchTimeoutMs: 12000, ...PROFESSOR_TTS })
        await playPreparedOrGenerate(`word-${wordIndex}-slow`, word, arabicVoice, { fetchTimeoutMs: 12000, slow: true, ...FULL_HARAKAT_TTS })
      }
    } catch (err) {
      console.warn('[TajweedPlayer] record/score error:', err)
      setFeedback({ matched: false })
      setPhase('feedback')
    } finally {
      stream?.getTracks().forEach(t => t.stop())
      streamRef.current = null
      recorderRef.current = null
      setBusy(false)
    }
  }

  function nextWord() {
    if (wordIndex + 1 < lesson.demo_words.length) {
      setWordIndex(wordIndex + 1)
      setPhase('demo')
      setFeedback(null)
    } else {
      // Ran out of words — loop back so child can keep drilling toward target
      setWordIndex(0)
      setPhase('demo')
      setFeedback(null)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-card text-text rounded-2xl border border-border max-w-2xl w-full max-h-[92vh] overflow-y-auto shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div className="min-w-0">
            <div className="text-xs text-text-muted">Lesson {lesson.order_index} · {lesson.stage}</div>
            <div className="font-semibold truncate">{lesson.title_en}</div>
            <div className="font-arabic text-sm text-text-muted truncate" dir="rtl">{lesson.title_ar}</div>
          </div>
          <button onClick={onClose} className="text-text-muted hover:text-text" aria-label="Close">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Progress bar */}
        <div className="px-4 pt-3">
          <div className="flex items-center justify-between text-xs text-text-muted mb-1">
            <span>Drill progress</span>
            <span>{drillPassCount} / {target}</span>
          </div>
          <div className="h-2 rounded-full bg-border overflow-hidden">
            <div
              className={`h-full transition-all ${mastered ? 'bg-primary' : 'bg-gold-dark'}`}
              style={{ width: `${Math.min(100, (drillPassCount / target) * 100)}%` }}
            />
          </div>
        </div>

        {/* Phase: intro */}
        {phase === 'intro' && (
          <div className="p-5 space-y-4">
            <p className="text-text leading-relaxed">{lesson.explanation_en}</p>
            <p className="font-arabic text-text-muted leading-loose" dir="rtl">{lesson.explanation_ar}</p>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={playIntro}
                disabled={busy || audioPreparing}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-card border border-border hover:bg-card/70 text-sm"
              >
                <Volume2 className="w-4 h-4" /> {audioPreparing ? 'Preparing audio…' : 'Listen to the rule'}
              </button>
              <button
                onClick={() => setPhase('demo')}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-white text-sm font-medium"
              >
                Start drilling <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* Phase: demo + recording (shared layout — buttons swap by phase) */}
        {(phase === 'demo' || phase === 'recording' || phase === 'scoring' || phase === 'feedback') && (
          <div className="p-5 space-y-4">
            <div className="text-center py-6 rounded-xl bg-gold/10 border border-gold/30">
              <div className="text-[10px] uppercase tracking-wide text-gold-dark font-semibold mb-2">
                Word {wordIndex + 1} of {lesson.demo_words.length}
              </div>
              <div className="text-5xl font-arabic text-text" dir="rtl">{word}</div>
            </div>

            <div className="rounded-lg border border-border bg-card/70 p-3">
              <div className="text-[10px] uppercase tracking-wide text-text-muted font-semibold mb-1">
                Teacher focus
              </div>
              <p className="text-sm leading-relaxed text-text">{wordCue.replace(/^Teacher focus:\s*/, '')}</p>
            </div>

            {phase === 'demo' && (
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={playCue}
                  disabled={busy || audioPreparing}
                  className="col-span-2 inline-flex items-center justify-center gap-2 p-3 rounded-lg bg-card border border-border hover:bg-card/70 text-sm"
                >
                  <Volume2 className="w-5 h-5" />
                  <span>Hear teacher focus</span>
                </button>
                <button
                  onClick={playSlow}
                  disabled={busy}
                  className="inline-flex flex-col items-center gap-1 p-3 rounded-lg bg-card border border-border hover:bg-card/70 text-sm"
                >
                  <Volume2 className="w-5 h-5" />
                  <span>Slow demo</span>
                </button>
                <button
                  onClick={playNormal}
                  disabled={busy}
                  className="inline-flex flex-col items-center gap-1 p-3 rounded-lg bg-card border border-border hover:bg-card/70 text-sm"
                >
                  <Volume2 className="w-5 h-5" />
                  <span>Normal speed</span>
                </button>
                <button
                  onClick={recordAndScore}
                  disabled={busy}
                  className="col-span-2 inline-flex items-center justify-center gap-2 p-4 rounded-lg bg-primary text-white font-medium"
                >
                  <Mic className="w-5 h-5" /> Your turn — say only this word
                </button>
              </div>
            )}

            {phase === 'recording' && (
              <div className="text-center text-text-muted py-3">
                <div className="inline-flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                  Listening… say only this word.
                </div>
              </div>
            )}

            {phase === 'scoring' && (
              <div className="text-center text-text-muted py-3">Checking your pronunciation…</div>
            )}

            {phase === 'feedback' && feedback && (
              <div className={`p-3 rounded-lg border text-center ${
                feedback.matched
                  ? 'bg-primary/10 border-primary/40 text-primary'
                  : 'bg-amber-50 border-amber-300 text-amber-800 dark:bg-amber-900/20 dark:text-amber-200'
              }`}>
                {feedback.matched ? (
                  <div className="flex flex-col items-center gap-2">
                    <CheckCircle2 className="w-6 h-6" />
                    <span className="font-medium leading-relaxed">{successCoaching}</span>
                  </div>
                ) : (
                  <div>
                    <div className="font-medium leading-relaxed">{retryCoaching}</div>
                    {describeMaddMissing(feedback.maddMissing) && (
                      <div className="text-sm mt-1 font-medium">{describeMaddMissing(feedback.maddMissing)}</div>
                    )}
                    {feedback.transcript && (
                      <div className="text-xs opacity-75 mt-1 font-arabic" dir="rtl">I heard: {feedback.transcript}</div>
                    )}
                  </div>
                )}
                <div className="mt-3 flex flex-wrap gap-2 justify-center">
                  <button
                    onClick={() => { setPhase('demo'); setFeedback(null) }}
                    className="px-3 py-1.5 rounded-lg bg-card border border-border text-sm"
                  >
                    Listen and repeat again
                  </button>
                  {feedback.matched && (
                    <button
                      onClick={nextWord}
                      className="px-3 py-1.5 rounded-lg bg-primary text-white text-sm"
                    >
                      Continue to next word <ArrowRight className="inline w-3 h-3 ml-1" />
                    </button>
                  )}
                </div>
              </div>
            )}

            {mastered && (
              <div className="text-center p-4 rounded-lg bg-primary/10 border border-primary/40">
                <Award className="w-8 h-8 text-primary mx-auto mb-1" />
                <div className="font-semibold text-primary">Lesson mastered!</div>
                <button
                  onClick={onClose}
                  className="mt-3 px-4 py-2 rounded-lg bg-primary text-white text-sm"
                >
                  Back to lesson tree
                </button>
              </div>
            )}
          </div>
        )}

        {/* TTS debug bar — confirms which voice and locale are actually
            speaking the Arabic word. Collapsible so it doesn't dominate
            the lesson UI for casual users. */}
        <TTSDebugBar
          word={word}
          ttsDebug={ttsDebug}
          arabicBrowserVoices={arabicBrowserVoices}
          open={ttsDebugOpen}
          onToggle={() => setTtsDebugOpen(o => !o)}
        />
      </div>
    </div>
  )
}

interface TTSDebugBarProps {
  word: string
  ttsDebug: TutorSpeechResult | null
  arabicBrowserVoices: SpeechSynthesisVoice[]
  open: boolean
  onToggle: () => void
}

function TTSDebugBar({ word, ttsDebug, arabicBrowserVoices, open, onToggle }: TTSDebugBarProps) {
  // Warning conditions: kid is hearing a non-Arabic voice on Arabic input.
  const usedFallback = ttsDebug?.source === 'browser_fallback'
  const fallbackHasNoArabic = usedFallback && ttsDebug?.browserVoiceIsArabic === false
  const langLooksArabic = ttsDebug?.language?.toLowerCase().startsWith('ar') ?? false
  const expectedArabic = isArabicWord(word) || isArabicWord(ttsDebug?.sentText)
  const helperActive = !!ttsDebug?.spokenText && ttsDebug.spokenText !== ttsDebug.sentText
  const wrongLanguage = expectedArabic && ttsDebug && ttsDebug.played && !langLooksArabic && !helperActive
  const showWarning = fallbackHasNoArabic || wrongLanguage

  const headerLabel = !ttsDebug
    ? 'TTS debug — play a demo to populate'
    : `Voice: ${ttsDebug.voice || '?'} · ${ttsDebug.language || '?'} · via ${ttsDebug.source}`

  return (
    <div className="border-t border-border">
      <button
        type="button"
        onClick={onToggle}
        className={`w-full flex items-center gap-2 px-4 py-2 text-xs ${
          showWarning ? 'bg-amber-50 dark:bg-amber-900/20 text-amber-900 dark:text-amber-200' : 'text-text-muted hover:bg-card/70'
        }`}
      >
        {showWarning ? <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" /> : <Info className="w-3.5 h-3.5 flex-shrink-0" />}
        <span className="truncate text-left flex-1">{headerLabel}</span>
        <span className="text-[10px] opacity-70">{open ? 'hide' : 'show'}</span>
      </button>
      {open && (
        <div className="px-4 py-3 space-y-2 text-xs bg-card/50 border-t border-border/60">
          {showWarning && (
            <div className="p-2 rounded bg-amber-100 dark:bg-amber-900/30 text-amber-900 dark:text-amber-200 border border-amber-300 dark:border-amber-700">
              {fallbackHasNoArabic
                ? 'No Arabic TTS voice found in this browser. Arabic pronunciation may be incorrect — install an Arabic system voice or use a Chromium-based browser with cloud voices.'
                : 'TTS responded but the locale is not Arabic — pronunciation may be wrong.'}
            </div>
          )}
          <DebugRow label="Displayed Arabic" value={word} arabic />
          <DebugRow label="Exact TTS input" value={ttsDebug?.sentText || '(none yet)'} arabic={!!ttsDebug?.sentText} />
          {ttsDebug?.spokenText && ttsDebug.spokenText !== ttsDebug.sentText && (
            <DebugRow label="Speech helper" value={ttsDebug.spokenText} />
          )}
          <DebugRow label="Provider" value={ttsDebug?.source || '(none yet)'} />
          <DebugRow label="Voice" value={ttsDebug?.voice || '(none yet)'} />
          <DebugRow label="Locale" value={ttsDebug?.language || '(none yet)'} />
          <DebugRow label="Playback" value={ttsDebug?.preGenerated ? 'pre-generated audio' : '(none yet)'} />
          <DebugRow label="Reading mode" value="full harakat" />
          {ttsDebug?.reason && <DebugRow label="Failure reason" value={ttsDebug.reason} />}
          <div className="pt-2 mt-2 border-t border-border/50">
            <div className="text-text-muted mb-1">
              Arabic voices available in this browser ({arabicBrowserVoices.length}):
            </div>
            {arabicBrowserVoices.length === 0 ? (
              <div className="font-mono text-amber-700 dark:text-amber-300">— none —</div>
            ) : (
              <ul className="font-mono space-y-0.5">
                {arabicBrowserVoices.map(v => (
                  <li key={v.voiceURI}>
                    <span className="text-text">{v.lang}</span>
                    <span className="text-text-muted"> · {v.name}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function DebugRow({ label, value, arabic = false }: { label: string; value: string; arabic?: boolean }) {
  return (
    <div className="flex gap-2">
      <span className="text-text-muted w-32 flex-shrink-0">{label}:</span>
      <span
        className={`font-mono break-all flex-1 ${arabic ? 'font-arabic text-base' : ''}`}
        dir={arabic ? 'rtl' : 'ltr'}
      >
        {value}
      </span>
    </div>
  )
}

const ARABIC_RE = /[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]/

function isArabicWord(text: string | undefined | null): boolean {
  if (!text) return false
  return ARABIC_RE.test(text)
}
