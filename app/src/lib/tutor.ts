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
}

// ── Helpers ──

function pickBestMistake(words: string[] | undefined): string | undefined {
  if (!words?.length) return undefined
  // Pick the longest word — likely the most specific/difficult
  return [...words].sort((a, b) => b.length - a.length)[0]
}

function randomFrom<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)]
}

// ── Prep message (context-aware) ──

export function getTutorPrepMessage(ctx: TutorContext): string {
  // First ayah of a new surah
  if (ctx.isNewSurah && ctx.previousSurahName) {
    const templates = [
      `Nice work! We finished ${ctx.previousSurahName}. Now we'll begin ${ctx.surahName}.`,
      `MashaAllah, you completed that surah. Let's start ${ctx.surahName} now.`,
      `Great job finishing ${ctx.previousSurahName}. Ready for ${ctx.surahName}?`,
    ]
    return randomFrom(templates)
  }

  // Moving to next ayah (just passed)
  if (ctx.isMovingNext && ctx.previousAyah) {
    const templates = [
      `Great job. Now we're moving to Ayah ${ctx.ayah}. Listen first.`,
      `Good work on Ayah ${ctx.previousAyah}. Here's Ayah ${ctx.ayah}.`,
      `Ayah ${ctx.previousAyah} done. Now Ayah ${ctx.ayah} — listen.`,
    ]
    return randomFrom(templates)
  }

  // Retry same ayah after a fail
  if (ctx.isRetry) {
    const focusWord = pickBestMistake(ctx.missingWords)
    if (focusWord) {
      return `Let's try Ayah ${ctx.ayah} again. Listen for the word: ${focusWord}.`
    }
    return `Let's try Ayah ${ctx.ayah} again. Listen closely this time.`
  }

  // First ayah overall (no previous context)
  if (!ctx.previousAyah) {
    const templates = [
      `Ready? We'll start with ${ctx.surahName}, Ayah ${ctx.ayah}. Listen first.`,
      `Bismillah! Let's begin ${ctx.surahName}, Ayah ${ctx.ayah}.`,
      `Welcome! Let's start with ${ctx.surahName}, Ayah ${ctx.ayah}.`,
    ]
    return randomFrom(templates)
  }

  // Generic fallback
  return `Listen to Ayah ${ctx.ayah} of ${ctx.surahName}.`
}

// ── Record prompt (context-aware) ──

export function getTutorRecordPrompt(ctx: TutorContext): string {
  // After a mistake, give specific encouragement
  if (ctx.isRetry && ctx.missingWords?.length) {
    const word = pickBestMistake(ctx.missingWords)
    const templates = [
      `Try again slowly, especially the word: ${word}.`,
      `Your turn. Take your time with ${word}.`,
      `Bismillah. Now focus on ${word}.`,
    ]
    return randomFrom(templates)
  }

  // Moving next — short, encouraging
  if (ctx.isMovingNext) {
    const templates = [
      'Your turn. Say it slowly.',
      'Bismillah, now you try.',
      "I'm listening. Recite when you're ready.",
      'Try it now, nice and slow.',
    ]
    return randomFrom(templates)
  }

  // General record prompts
  const templates = [
    'Your turn. Say it slowly.',
    'Bismillah, now you try.',
    "I'm listening. Recite when you're ready.",
    'Try it now, nice and slow.',
    'Go ahead, you can recite now.',
  ]
  return randomFrom(templates)
}

// ── Feedback message (after scoring) ──

export function getTutorFeedbackMessage(ctx: TutorContext): string {
  const name = ctx.childName ? ` ${ctx.childName}` : ''

  // Audio unclear
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
    // Repeat goal complete — short celebration
    const templates = [
      `Great job${name}! You finished this ayah. Let's move to the next one.`,
      `MashaAllah${name}, you mastered Ayah ${ctx.ayah}. Moving on!`,
      `Excellent${name}. Ayah ${ctx.ayah} is strong now.`,
    ]
    return randomFrom(templates)
  }

  // Not passed — mention ONE word to practice
  const focusWord = pickBestMistake(ctx.missingWords)
  if (focusWord && acc > 20) {
    return `Good try${name}. I heard some of it. Let's practice ${focusWord} again.`
  }

  if (acc > 20) {
    return `Good try${name}. Let's slow down and listen again.`
  }

  // Very low accuracy / no match
  return `Good try${name}. Let's listen carefully and try again.`
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

// ── OpenClaw tutor feedback (with local fallback) ──

const TUTOR_MESSAGE_TIMEOUT_MS = 2500  // 2000ms for OpenClaw + 500ms buffer

/**
 * Fetch tutor feedback from OpenClaw (via NoorHafiz backend).
 * Falls back to local getTutorFeedbackMessage() if OpenClaw is unavailable.
 *
 * Flow: Frontend → NoorHafiz backend → OpenClaw (2s timeout)
 * OpenClaw is only personality — DB is source of truth.
 * Never blocks the practice flow.
 */
export async function fetchTutorFeedback(
  eventId: number | null,
  ctx: TutorContext,
): Promise<{ message: string; source: 'openclaw' | 'fallback' }> {
  const name = ctx.childName ? ` ${ctx.childName}` : ''
  const hardcodedFallback = `Good job${name}. Let's continue.`

  // If no event ID, skip to local fallback
  if (!eventId) {
    const local = getTutorFeedbackMessage(ctx)
    return { message: local || hardcodedFallback, source: 'fallback' }
  }

  try {
    const { getTutorMessage } = await import('../lib/api')

    const result = await getTutorMessage(eventId)

    // Chain 1: OpenClaw message if non-empty
    if (result.ok && result.message) {
      return { message: result.message, source: 'openclaw' }
    }

    // Chain 2: Backend fallback message if OpenClaw failed but backend provided one
    if (!result.ok && result.message) {
      console.log('[NoorHafiz Tutor] OpenClaw unavailable (%s) — using backend fallback', result.error || 'unknown')
      return { message: result.message, source: 'fallback' }
    }

    // Chain 3: Local tutor.ts message
    console.log('[NoorHafiz Tutor] Backend returned no message — using local fallback')
    const local = getTutorFeedbackMessage(ctx)
    return { message: local || hardcodedFallback, source: 'fallback' }
  } catch (err: any) {
    // Chain 4: Hardcoded fallback (network error)
    if (err?.name === 'AbortError') {
      console.log('[NoorHafiz Tutor] OpenClaw fetch timed out — using hardcoded fallback')
    } else {
      console.warn('[NoorHafiz Tutor] OpenClaw fetch failed:', err)
    }
    const local = getTutorFeedbackMessage(ctx)
    return { message: local || hardcodedFallback, source: 'fallback' }
  }
}
