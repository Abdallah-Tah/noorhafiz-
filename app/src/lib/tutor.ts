// Tutor message builders — context-aware, kid-friendly, warm
// Uses evidence from scoring (accuracy, mistakes, repeat count) to sound human.
// Never says "failed", "0%", or technical words to the child.

export type TutorContext = {
  childName?: string
  surah: number
  ayah: number
  surahName: string
  previousAyah?: number
  previousSurahName?: string
  repeatCount?: number
  repeatGoal?: number
  accuracy?: number
  passed?: boolean
  audioUnclear?: boolean
  missingWords?: string[]
  isRetry?: boolean
  isMovingNext?: boolean
  isNewSurah?: boolean
  isMemoryCheck?: boolean
  memoryCheckPassed?: boolean
  /** Word the tutor flagged on the previous attempt — avoid repeating it back-to-back. */
  lastHardWord?: string
  /** Consecutive failed attempts on this ayah — drives escalating retry tone. */
  consecutiveFailCount?: number
  /** Next ayah to practice — used in move-next feedback so message says the right number. */
  nextAyah?: { surah: number; ayah: number }
}

// ── Helpers ──

/** Strip Arabic diacritics + tatweel for loose token comparison. */
function normalizeArabic(text: string): string {
  return text
    .replace(/[ً-ٰٟۖ-ۭـ]/g, '')
    .replace(/[ٱآأإ]/g, 'ا')
    .trim()
}

const BISMILLAH_HEADER_TOKENS = new Set(
  ['بسم', 'الرحمن', 'الرحيم'],
)

/**
 * Detect whether the missing-words list looks like the unnumbered Bismillah
 * header was scored as missing. Only relevant for Ayah 1 of non-Fatiha,
 * non-Tawbah surahs where the header is stripped from the child's display.
 *
 * Pattern: at least two of the three header tokens (بسم / الرحمن / الرحيم)
 * showing up together — one alone is likely a real ayah word.
 */
function looksLikeBismillahHeader(words: string[], surah: number, ayah: number): boolean {
  if (surah === 1 || surah === 9 || ayah !== 1) return false
  const matches = words.filter(w => BISMILLAH_HEADER_TOKENS.has(normalizeArabic(w)))
  return matches.length >= 2
}

function filterBismillahHeaderTokens(words: string[], ctx: TutorContext): string[] {
  if (!looksLikeBismillahHeader(words, ctx.surah, ctx.ayah)) return words
  return words.filter(w => !BISMILLAH_HEADER_TOKENS.has(normalizeArabic(w)))
}

export function pickBestMistake(
  words: string[] | undefined,
  ctx?: TutorContext,
): string | undefined {
  if (!words?.length) return undefined
  let candidates = ctx ? filterBismillahHeaderTokens(words, ctx) : words
  if (!candidates.length) return undefined

  // Avoid repeating the same hard word back-to-back if there's an alternative.
  if (ctx?.lastHardWord && candidates.length > 1) {
    const last = normalizeArabic(ctx.lastHardWord)
    const fresh = candidates.filter(w => normalizeArabic(w) !== last)
    if (fresh.length > 0) candidates = fresh
  }

  // Longest word — likely the most specific/difficult
  return [...candidates].sort((a, b) => b.length - a.length)[0]
}

function randomFrom<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)]
}

// ── Prep message (context-aware) ──

export function getTutorPrepMessage(ctx: TutorContext): string {
  const name = ctx.childName ? ` ${ctx.childName}` : ''

  // First ayah of a new surah (after finishing the previous one)
  if (ctx.isNewSurah && ctx.previousSurahName) {
    const templates = [
      `MashaAllah${name}, we finished ${ctx.previousSurahName}. Now let's begin ${ctx.surahName}. Listen carefully.`,
      `Great job on ${ctx.previousSurahName}${name}. Time for ${ctx.surahName} — listen first.`,
      `Done with ${ctx.previousSurahName}${name}. Now ${ctx.surahName}, Ayah ${ctx.ayah}. Listen with me.`,
    ]
    return randomFrom(templates)
  }

  // Retry same ayah after a fail — handled in the retry record prompt instead.
  // Keep prep silent on retry so we don't talk over the kid.
  if (ctx.isRetry) {
    return `Let's try Ayah ${ctx.ayah} one more time. Listen.`
  }

  // First ayah of the session (no previous ayah yet)
  if (!ctx.previousAyah && !ctx.isMovingNext) {
    const templates = [
      `Okay${name}, let's start with ${ctx.surahName}, Ayah ${ctx.ayah}. Listen carefully.`,
      `Ready${name}? ${ctx.surahName}, Ayah ${ctx.ayah}. Listen first, then you'll try.`,
      `Here we go${name}. ${ctx.surahName}, Ayah ${ctx.ayah}. Listen with me.`,
    ]
    return randomFrom(templates)
  }

  // Generic fallback (rarely hit — move_next path skips prep TTS in Dashboard)
  return `Ayah ${ctx.ayah} of ${ctx.surahName}. Listen.`
}

// ── Record prompt (context-aware) ──

export function getTutorRecordPrompt(ctx: TutorContext): string {
  const fails = ctx.consecutiveFailCount ?? 0

  // Escalation: 2nd consecutive retry → slow demo tier
  if (ctx.isRetry && fails >= 2) {
    const word = pickBestMistake(ctx.missingWords, ctx)
    if (word) {
      const templates = [
        `Take a breath. Listen for ${word}, then say the whole ayah slowly.`,
        `It's okay — many kids find ${word} tricky. Listen one more time, then try slowly.`,
        `Let's slow down. Focus on ${word}, then go through the ayah at your own pace.`,
      ]
      return randomFrom(templates)
    }
    return "Take a breath. Listen carefully one more time, then say it slowly."
  }

  // First retry — name the focus word once, no Bismillah
  if (ctx.isRetry && ctx.missingWords?.length) {
    const word = pickBestMistake(ctx.missingWords, ctx)
    if (word) {
      const templates = [
        `Try again — focus on ${word} this time.`,
        `Your turn. Take your time, especially with ${word}.`,
        `One more try. Listen for ${word}.`,
      ]
      return randomFrom(templates)
    }
  }

  // Moving next — short, no ceremony
  if (ctx.isMovingNext) {
    const templates = [
      'Your turn. Say it slowly.',
      "I'm listening — go ahead.",
      'Take your time. Recite when ready.',
      'Now you try, nice and slow.',
    ]
    return randomFrom(templates)
  }

  // General record prompts (first ayah / generic)
  const templates = [
    'Your turn. Say it slowly.',
    "I'm listening — go ahead.",
    'Take your time. Recite when ready.',
    'Now you try, nice and slow.',
    'Go ahead, recite when you are ready.',
  ]
  return randomFrom(templates)
}

// ── Feedback message (after scoring) ──

export function getTutorFeedbackMessage(ctx: TutorContext): string {
  const name = ctx.childName ? ` ${ctx.childName}` : ''

  // Audio unclear — use dedicated builder if reason available
  if (ctx.audioUnclear) {
    return 'I could not hear you clearly. Move closer and try again.'
  }

  const acc = ctx.accuracy ?? 0
  const repeatCount = ctx.repeatCount ?? 0
  const repeatGoal = ctx.repeatGoal ?? 3

  // Memory check mode
  if (ctx.isMemoryCheck) {
    if (ctx.memoryCheckPassed) {
      return `MashaAllah${name}! You remembered it without help.`
    }
    return 'Good try. This one needs a little more practice.'
  }

  // Passed scoring threshold
  if (ctx.passed) {
    if (repeatCount < repeatGoal) {
      return `Nice work${name}. That's ${repeatCount} of ${repeatGoal} good repeats. Let's make it stronger.`
    }
    // Repeat goal complete — short celebration, name the next ayah if known
    const nextAyahNum = ctx.nextAyah?.ayah ?? (ctx.ayah + 1)
    const templates = [
      `Great job${name}! You finished this ayah. Moving to Ayah ${nextAyahNum}.`,
      `MashaAllah${name}, you mastered Ayah ${ctx.ayah}. Moving to Ayah ${nextAyahNum}!`,
      `Excellent${name}. Ayah ${ctx.ayah} is strong. Now let's do Ayah ${nextAyahNum}.`,
    ]
    return randomFrom(templates)
  }

  // Not passed — mention ONE word to practice
  const focusWord = pickBestMistake(ctx.missingWords, ctx)
  const fails = ctx.consecutiveFailCount ?? 0

  // After 2+ consecutive fails, soften the tone — kid needs encouragement, not pressure
  if (focusWord && fails >= 2 && acc > 20) {
    return `It's okay${name}. ${focusWord} is tricky — let's slow down and try together.`
  }

  if (focusWord && acc > 50) {
    return `Good try${name}. Most of it was clear. Let's work on ${focusWord}.`
  }

  if (focusWord && acc > 20) {
    return `Good try${name}. I heard some of it. Let's practice ${focusWord}.`
  }

  if (acc > 20) {
    return `Good try${name}. Let's slow down and listen again.`
  }

  // Very low accuracy / no match
  return `Good try${name}. Let's listen carefully and try once more.`
}

// ── Audio unclear guidance (kid-friendly, no technical words) ──

export type AudioUnclearReason =
  | 'noisy_audio'
  | 'no_speech'
  | 'too_short'
  | 'no_meaningful_arabic'
  | 'transcription_empty'
  | string

/**
 * Returns a friendly tutor message for audio/noise failures.
 * Called before retry so the child hears guidance.
 */
export function getTutorAudioUnclearMessage(reason?: AudioUnclearReason | null): string {
  switch (reason) {
    case 'noisy_audio':
      return "It sounds noisy. Let's try again somewhere quieter."
    case 'no_speech':
      return "I didn't hear your voice. Move closer to the microphone and try again."
    case 'too_short':
      return 'That was too short. Say the full ayah slowly.'
    case 'no_meaningful_arabic':
      return "I heard sound, but not the ayah clearly. Let's try again."
    case 'transcription_empty':
      return "I couldn't hear the recitation clearly. Try again."
    default:
      return 'I could not hear you clearly. Try again.'
  }
}

// ── Surah onboarding (one-time per surah) ──

export function getSurahOnboardingText(ctx: TutorContext): string {
  const name = ctx.childName || 'my student'
  return `Assalamu alaikum ${name}! Today we will practice ${ctx.surahName}. First, listen carefully. Then press record and recite. I will help you with mistakes. Let's begin.`
}

// ── Memory check messages ──

export function getMemoryCheckPrepMessage(ctx: TutorContext): string {
  return `Memory check! Try to recite Ayah ${ctx.ayah} of ${ctx.surahName} from memory.`
}

export function getMemoryCheckRecordPrompt(): string {
  return "Take a deep breath. I'm listening."
}

// ── Tutor status line (visible agent status) ──

export type TutorStatusPhase =
  | 'idle'
  | 'preparing'
  | 'playing_ayah'
  | 'listening'
  | 'scoring'
  | 'giving_feedback'
  | 'moving_next'
  | 'retrying'
  | 'lesson_complete'

/**
 * Returns a short, friendly status line for the parent-visible tutor indicator.
 * Shows what the tutor is currently doing — never technical.
 */
export function getTutorStatusMessage(phase: TutorStatusPhase, ctx: TutorContext): string {
  const ayah = ctx.ayah
  const surahName = ctx.surahName

  switch (phase) {
    case 'preparing':
      return `Getting Ayah ${ayah} ready…`
    case 'playing_ayah':
      return `Listen to ${surahName}, Ayah ${ayah}`
    case 'listening':
      return 'Teacher is listening…'
    case 'scoring':
      return 'Teacher is checking your recitation…'
    case 'giving_feedback':
      return 'Teacher is giving feedback…'
    case 'moving_next':
      return 'Getting the next ayah ready…'
    case 'retrying':
      return `Let's try Ayah ${ayah} again…`
    case 'lesson_complete':
      return '🎉 Great job! Lesson complete!'
    case 'idle':
    default:
      return 'Ready'
  }
}

// ── Transition reason (shown when moving to next ayah) ──

/**
 * Returns a one-line parent-visible reason for why the tutor moved to the next ayah.
 * Displayed briefly as a toast/banner before the next ayah loads.
 */
export function getTutorTransitionReason(ctx: TutorContext): string {
  const repeatCount = ctx.repeatCount ?? 0
  const repeatGoal = ctx.repeatGoal ?? 3
  const prevAyah = ctx.previousAyah ?? ctx.ayah - 1

  if (ctx.isNewSurah) {
    return `Finished ${ctx.previousSurahName || 'that surah'}. Starting ${ctx.surahName} now.`
  }

  if (repeatCount >= repeatGoal) {
    return `You finished ${repeatGoal} good repeats of Ayah ${prevAyah}. Moving on!`
  }

  return `Good work on Ayah ${prevAyah}. Next ayah coming up.`
}

// ── Completion ──

export function getLessonCompleteMessage(ctx: TutorContext): string {
  const name = ctx.childName ? ` ${ctx.childName}` : ''
  return `🎉 MashaAllah${name}! You finished your assigned lesson for today. Great work!`
}

// ── Tutor feedback (local-first, OpenClaw optional) ──

/**
 * Build tutor feedback for a completed recitation attempt.
 *
 * Default (VITE_OPENCLAW_LIVE_TUTOR=false): returns local template immediately —
 * no network call, no wait, deterministic for every cycle.
 *
 * When VITE_OPENCLAW_LIVE_TUTOR=true: tries the backend OpenClaw route with a
 * timeout and falls back to local on any failure.  Only for background/debug use.
 */
export async function fetchTutorFeedback(
  eventId: number | null,
  ctx: TutorContext,
): Promise<{ message: string; source: 'openclaw' | 'fallback' }> {
  const name = ctx.childName ? ` ${ctx.childName}` : ''
  const hardcodedFallback = `Good job${name}. Let's continue.`

  // Default: local template only — no OpenClaw during live practice.
  const openClawEnabled = import.meta.env.VITE_OPENCLAW_LIVE_TUTOR === 'true'
  if (!openClawEnabled) {
    const local = getTutorFeedbackMessage(ctx)
    return { message: local || hardcodedFallback, source: 'fallback' }
  }

  // OpenClaw path (only when explicitly enabled).
  if (!eventId) {
    const local = getTutorFeedbackMessage(ctx)
    return { message: local || hardcodedFallback, source: 'fallback' }
  }

  try {
    const { getTutorMessage } = await import('../lib/api')
    const nextAyahNum = ctx.nextAyah?.ayah
    const result = await getTutorMessage(eventId, nextAyahNum)

    if (result.ok && result.message) {
      return { message: result.message, source: 'openclaw' }
    }

    if (!result.ok && result.message) {
      return { message: result.message, source: 'fallback' }
    }

    const local = getTutorFeedbackMessage(ctx)
    return { message: local || hardcodedFallback, source: 'fallback' }
  } catch (err: any) {
    if (err?.name === 'AbortError') {
      console.log('[Tutor] OpenClaw fetch timed out')
    } else {
      console.warn('[Tutor] OpenClaw fetch failed:', err)
    }
    const local = getTutorFeedbackMessage(ctx)
    return { message: local || hardcodedFallback, source: 'fallback' }
  }
}
