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
  /** Repeating after a pass (locking-in cycle), as opposed to retry-after-fail. */
  isRepeating?: boolean
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

/**
 * Use the child's name only on milestones, encouragement, and lesson-complete.
 * Routine repeats and per-cycle feedback omit the name to reduce robotic feel.
 */
function nameSuffix(ctx: TutorContext): string {
  if (!ctx.childName) return ''
  const isFirstAyahOfSession = !ctx.previousAyah && !ctx.isMovingNext && !ctx.isRetry && !ctx.isRepeating
  const needsEncouragement = (ctx.consecutiveFailCount ?? 0) >= 2
  const isMilestone = ctx.isNewSurah || isFirstAyahOfSession || needsEncouragement
  return isMilestone ? ` ${ctx.childName}` : ''
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
  const name = nameSuffix(ctx)

  // First ayah of a new surah (after finishing the previous one) — milestone, name on
  if (ctx.isNewSurah && ctx.previousSurahName) {
    const named = ctx.childName ? ` ${ctx.childName}` : ''
    const templates = [
      `MashaAllah${named}! ${ctx.previousSurahName} done. Now ${ctx.surahName}. Listen.`,
      `Great work on ${ctx.previousSurahName}. Time for ${ctx.surahName} — listen first.`,
      `Done with ${ctx.previousSurahName}. Now ${ctx.surahName}, Ayah ${ctx.ayah}. Listen.`,
    ]
    return randomFrom(templates)
  }

  // Retry — kept silent on retry path in Dashboard, so this is rarely hit
  if (ctx.isRetry) {
    return `Listen one more time.`
  }

  // First ayah of the session — milestone, name on
  if (!ctx.previousAyah && !ctx.isMovingNext) {
    const named = ctx.childName ? ` ${ctx.childName}` : ''
    const templates = [
      `Bismillah${named}! ${ctx.surahName}, Ayah ${ctx.ayah}. Listen carefully.`,
      `Let's begin${named}. ${ctx.surahName}, Ayah ${ctx.ayah} — listen first.`,
      `Ready${named}? ${ctx.surahName}, Ayah ${ctx.ayah}. Listen with me.`,
    ]
    return randomFrom(templates)
  }

  return `Ayah ${ctx.ayah}${name}. Listen.`
}

// ── Record prompt (context-aware) ──

export function getTutorRecordPrompt(ctx: TutorContext): string {
  const fails = ctx.consecutiveFailCount ?? 0

  // 2nd+ consecutive fail — slow demo tier with focus word
  if (ctx.isRetry && !ctx.isRepeating && fails >= 2) {
    const word = pickBestMistake(ctx.missingWords, ctx)
    if (word) {
      const templates = [
        `Take a breath. Listen for ${word}, then say it slowly.`,
        `It's okay — ${word} is tricky. Listen, then try slowly.`,
        `Slow down. Focus on ${word}, then your turn.`,
      ]
      return randomFrom(templates)
    }
    return 'Take a breath. Listen, then say it slowly.'
  }

  // First retry after a fail — name the focus word once
  if (ctx.isRetry && !ctx.isRepeating && ctx.missingWords?.length) {
    const word = pickBestMistake(ctx.missingWords, ctx)
    if (word) {
      const templates = [
        `Try again — focus on ${word}.`,
        `Your turn. Listen for ${word}.`,
        `One more try, with ${word}.`,
      ]
      return randomFrom(templates)
    }
  }

  // Repeating after a pass — short, encouraging, no focus word needed
  if (ctx.isRepeating) {
    const templates = [
      'Once more.',
      'Again — even better this time.',
      'One more time.',
      "You've got this. Try again.",
      'Same one — make it stronger.',
    ]
    return randomFrom(templates)
  }

  // First record prompt or move-next — short and inviting
  const templates = [
    'Your turn.',
    "I'm listening.",
    'Go ahead — take your time.',
    'Recite when ready.',
    'Now you try.',
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
      // No spoken metrics — the visual counter shows progress. A real teacher
      // would just acknowledge and ask for another pass.
      const templates = [
        `Beautiful${name}. One more time, even smoother.`,
        `Nicely done${name}. Let's do that again.`,
        `MashaAllah${name}. Once more, with the same calm.`,
        `That was clean${name}. Repeat it for me.`,
      ]
      return randomFrom(templates)
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

// ── Two-clip feedback (coaching in user voice + Arabic word in Arabic voice) ──

/**
 * Build a feedback message split into a coaching part (no Arabic word) and
 * the focus word itself. Used when we want to play the coaching in the user's
 * tutor voice and the Arabic word as a separate clip in an Arabic voice — so
 * the child hears the word with correct makhraj, not with an English accent.
 *
 * When there's no `missingWords` to focus on (or the child passed), returns
 * `{coachingText, focusWord: undefined}` and the caller falls back to the
 * existing single-clip flow.
 */
export function getTutorFeedbackParts(ctx: TutorContext): { coachingText: string; focusWord?: string } {
  if (ctx.audioUnclear || ctx.passed) {
    return { coachingText: getTutorFeedbackMessage(ctx) }
  }

  const focusWord = pickBestMistake(ctx.missingWords, ctx)
  if (!focusWord) {
    return { coachingText: getTutorFeedbackMessage(ctx) }
  }

  const name = ctx.childName ? ` ${ctx.childName}` : ''
  const acc = ctx.accuracy ?? 0
  const fails = ctx.consecutiveFailCount ?? 0

  if (fails >= 2 && acc > 20) {
    return { coachingText: `It's okay${name}. This one is tricky — let's slow down and try together.`, focusWord }
  }
  if (acc > 50) {
    return { coachingText: `Good try${name}. Most of it was clear. Let's work on this word.`, focusWord }
  }
  if (acc > 20) {
    return { coachingText: `Good try${name}. I heard some of it. Let's practice this word.`, focusWord }
  }
  return { coachingText: `Good try${name}. Let's listen carefully and try this word.`, focusWord }
}

/** Arabic voice partner for the user's selected tutor voice. */
export function arabicVoiceFor(userVoice: 'english_male' | 'english_female' | 'arabic_male' | 'arabic_female'): 'arabic_male' | 'arabic_female' {
  if (userVoice === 'arabic_male' || userVoice === 'english_male') return 'arabic_male'
  return 'arabic_female'
}

// ── Word-drill prompts (Ayman-Suwaid style: isolate, slow, repeat) ──

export function getWordDrillPrepMessage(): string {
  const templates = [
    "Now just this one word. Listen first.",
    "Let's say only this word. Listen carefully.",
    "Just this word — slow and clear. Listen.",
  ]
  return randomFrom(templates)
}

export function getWordDrillRecordPrompt(): string {
  const templates = [
    'Your turn — just the word.',
    'Now you — say it slowly.',
    'Say just this word.',
  ]
  return randomFrom(templates)
}

export function getWordDrillSuccessMessage(ctx: TutorContext): string {
  const name = ctx.childName ? ` ${ctx.childName}` : ''
  const templates = [
    `MashaAllah${name}! Now the whole ayah.`,
    `That's it${name}. Now try the full ayah.`,
    `Beautiful${name}. Let's put it back in the ayah.`,
  ]
  return randomFrom(templates)
}

export function getWordDrillRetryMessage(): string {
  const templates = [
    "Almost. Listen once more, then try.",
    "Close. Slow it down — listen and try again.",
    "Not quite. One more time, slowly.",
  ]
  return randomFrom(templates)
}

// ── Tajweed-aware coaching (stage-specific, professional, child-friendly) ──
// The English professor voice is clear, respectful, and precise:
// - Cue the body: where the breath, tongue, lips, or throat should work.
// - Cue the sound quality: bounce, softness, connection, or steadiness.
// - Keep corrections calm and specific; avoid baby talk or vague praise.

type TajweedStage = 'makharij' | 'sifaat' | 'ahkam' | 'applied'
type TutorLanguage = 'en' | 'ar'

function hasAnyArabic(text: string, chars: string[]): boolean {
  const normalized = normalizeArabic(text)
  return chars.some(ch => normalized.includes(normalizeArabic(ch)))
}

function stripTajweedCuePrefix(cue: string, language: TutorLanguage): string {
  return cue.replace(language === 'ar' ? /^تركيز المعلم:\s*/ : /^Teacher focus:\s*/, '')
}

export function getTajweedWordCue(stage: TajweedStage, topicKey: string, word: string, language: TutorLanguage = 'en'): string {
  if (language === 'ar') {
    if (topicKey === 'halq_deep_hamza_ha') {
      if (hasAnyArabic(word, ['ه'])) {
        return 'تركيز المعلم: ابدأ الهاء من أقصى الحلق. اجعلها رخوة ومعها نفس هادئ، ثم أكمل الكلمة بهدوء.'
      }
      return 'تركيز المعلم: أعط الهمزة وقفة نظيفة من أقصى الحلق، ولا تضغطها من الفم.'
    }
    if (topicKey === 'jawf') {
      return 'تركيز المعلم: دع صوت المد يجري من الجوف بين الحلق والفم، وثبت النفس حتى يكتمل المد.'
    }
    if (topicKey === 'halq_middle_ayn_ha') {
      if (hasAnyArabic(word, ['ح'])) {
        return 'تركيز المعلم: أخرج الحاء من وسط الحلق مع همس واضح، ولا تجعلها ثقيلة.'
      }
      return 'تركيز المعلم: ضع العين في وسط الحلق وافتحها بلطف، بدون ضغط من اللسان.'
    }
    if (topicKey === 'halq_shallow_ghayn_kha') {
      if (hasAnyArabic(word, ['خ'])) {
        return 'تركيز المعلم: اجعل الخاء خفيفة جافة من أدنى الحلق، قريبة من الفم.'
      }
      return 'تركيز المعلم: اجعل الغين ناعمة من أدنى الحلق، فيها اهتزاز لطيف لا خشونة.'
    }
    if (topicKey === 'shafatan_ba_meem_waw') {
      if (hasAnyArabic(word, ['ب', 'م'])) {
        return 'تركيز المعلم: دع الشفتين تلتقيان بلطف ثم أطلق الصوت بلا ضغط زائد.'
      }
      return 'تركيز المعلم: دوّر الشفتين للواو، وحافظ على الشكل بدون إغلاق كامل.'
    }
    if (topicKey === 'qalqala') {
      return 'تركيز المعلم: أعط الحرف الأخير قلقلة صغيرة منضبطة، ولا تضف حركة جديدة بعده.'
    }
    if (topicKey === 'idhhar') {
      return 'تركيز المعلم: أظهر النون أو التنوين بوضوح قبل حرف الحلق، بدون غنة زائدة.'
    }
    if (topicKey === 'idgham_ghunna') {
      return 'تركيز المعلم: أدمج الصوت في الحرف التالي بسلاسة، وأمسك الغنة مقدار حركتين بهدوء.'
    }
    if (stage === 'applied') {
      return 'تركيز المعلم: تمهل، وأعط كل حرف مخرجه الصحيح قبل أن تصل الكلمة كاملة.'
    }
    return 'تركيز المعلم: استمع جيدًا إلى مكان خروج الصوت، ثم أعد الكلمة بنفس الموضع.'
  }

  if (topicKey === 'halq_deep_hamza_ha') {
    if (hasAnyArabic(word, ['ه'])) {
      return 'Teacher focus: start the haa from the deepest part of the throat. Keep it soft, with breath flowing, then finish the word calmly.'
    }
    return 'Teacher focus: give the hamza a clean gentle stop from deep in the throat. Do not squeeze it from the mouth.'
  }
  if (topicKey === 'jawf') {
    return 'Teacher focus: let the madd sound flow through the open space between the throat and mouth. Keep the breath steady until the vowel is complete.'
  }
  if (topicKey === 'halq_middle_ayn_ha') {
    if (hasAnyArabic(word, ['ح'])) {
      return 'Teacher focus: let the haa come breathy from the middle throat. Keep it whispered, not heavy.'
    }
    return 'Teacher focus: place the ayn in the middle throat. Let it open gently, without pushing from the tongue.'
  }
  if (topicKey === 'halq_shallow_ghayn_kha') {
    if (hasAnyArabic(word, ['خ'])) {
      return 'Teacher focus: make the khaa dry and light from the upper throat, close to the mouth.'
    }
    return 'Teacher focus: make the ghayn smooth from the upper throat. It should vibrate softly, not harshly.'
  }
  if (topicKey === 'shafatan_ba_meem_waw') {
    if (hasAnyArabic(word, ['ب', 'م'])) {
      return 'Teacher focus: let the lips meet cleanly, then release the sound without extra pressure.'
    }
    return 'Teacher focus: round the lips for waw. Keep the lips shaped, but do not close them.'
  }
  if (topicKey === 'qalqala') {
    return 'Teacher focus: give the last letter a tiny controlled bounce. Do not add a new vowel after it.'
  }
  if (topicKey === 'idhhar') {
    return 'Teacher focus: make the noon or tanween clear before the throat letter. No extra nasal stretch.'
  }
  if (topicKey === 'idgham_ghunna') {
    return 'Teacher focus: merge smoothly into the next letter and hold the ghunna for two calm counts.'
  }
  if (stage === 'applied') {
    return 'Teacher focus: slow down and give every letter its correct place before moving through the whole word.'
  }
  return 'Teacher focus: listen carefully to where the sound begins, then repeat the word with the same placement.'
}

/** Stage-aware coaching after a missed tajweed drill. Each line points
 * to a physical or sensory cue the child can feel — the way Sheikh
 * Suwayd directs students' attention to their throat, lips, breath. */
export function getTajweedRetryCoaching(stage: TajweedStage, topicKey = '', word = '', language: TutorLanguage = 'en'): string {
  const cue = topicKey && word ? stripTajweedCuePrefix(getTajweedWordCue(stage, topicKey, word, language), language) : ''
  if (cue) {
    const templates = language === 'ar'
      ? [
          `محاولة جيدة. ${cue} استمع مرة أخرى، ثم أعد هذه الكلمة فقط.`,
          `اقتربت جدًا. ${cue} خذ نفسًا هادئًا وجرب مرة أخرى.`,
          `قريب. ${cue} سأقولها ببطء؛ انسخ نفس الصوت.`,
        ]
      : [
          `Good attempt. ${cue} Listen once more, then repeat only this word.`,
          `You are close. ${cue} Take a calm breath and try again.`,
          `Almost. ${cue} I will say it slowly; copy the same sound.`,
        ]
    return randomFrom(templates)
  }

  const byStageEn: Record<TajweedStage, string[]> = {
    makharij: [
      "Good effort. Focus on where the sound begins, then try again.",
      "Almost. Place the sound carefully in the correct part of the throat or mouth.",
      "Slow your breath, find the makhraj, and repeat the word clearly.",
      "Listen closely. Notice where the letter lives before you try again.",
      "The sound is close. Let the air come from the correct point.",
    ],
    sifaat: [
      "Almost. Keep the quality of the letter light and controlled.",
      "Close. Do not force the sound; let the letter touch and release.",
      "Listen for a gentle tap, not a push. Then try again.",
      "Good attempt. Let the letter settle, then give it a light bounce.",
    ],
    ahkam: [
      "Almost. Let the two sounds connect smoothly.",
      "Close. Keep the air moving so the letters meet naturally.",
      "Listen to how the letters join, then repeat calmly.",
      "Good effort. Slow down and connect the rule with control.",
    ],
    applied: [
      "Almost. Slow down and give every letter its correct place.",
      "Close. Do not rush; pronounce each letter with care.",
      "Listen to the whole word calmly, then try again.",
      "Good attempt. Keep the breath steady from beginning to end.",
    ],
  }
  const byStageAr: Record<TajweedStage, string[]> = {
    makharij: [
      'محاولة جيدة. ركز على مكان بداية الصوت، ثم جرب مرة أخرى.',
      'اقتربت. ضع الصوت في موضعه الصحيح من الحلق أو الفم.',
      'اهدأ في النفس، وابحث عن المخرج، ثم أعد الكلمة بوضوح.',
      'استمع جيدًا. لاحظ مكان الحرف قبل أن تعيد القراءة.',
    ],
    sifaat: [
      'اقتربت. حافظ على صفة الحرف خفيفة ومنضبطة.',
      'قريب. لا تضغط الصوت؛ دع الحرف يلمس موضعه ثم يخرج بهدوء.',
      'استمع للنبرة الخفيفة، ثم جرب مرة أخرى.',
      'محاولة جيدة. دع الحرف يستقر ثم أعطه قلقلة لطيفة.',
    ],
    ahkam: [
      'اقتربت. دع الصوتين يلتقيان بسلاسة.',
      'قريب. حافظ على جريان النفس حتى تتصل الحروف طبيعيًا.',
      'استمع كيف تتصل الحروف، ثم أعدها بهدوء.',
      'محاولة جيدة. تمهل وطبق الحكم بانضباط.',
    ],
    applied: [
      'اقتربت. تمهل وأعط كل حرف موضعه الصحيح.',
      'قريب. لا تستعجل؛ انطق كل حرف بعناية.',
      'استمع إلى الكلمة كاملة بهدوء، ثم جرب مرة أخرى.',
      'محاولة جيدة. حافظ على نفس ثابت من البداية إلى النهاية.',
    ],
  }
  const byStage = language === 'ar' ? byStageAr : byStageEn
  return randomFrom(byStage[stage] ?? byStage.applied)
}

/** Stage-aware praise after a correct tajweed drill. Specific praise
 * tells the child exactly what they got right — the Suwayd touch that
 * makes feedback feel earned rather than reflex. */
export function getTajweedSuccessCoaching(stage: TajweedStage, topicKey = '', word = '', language: TutorLanguage = 'en'): string {
  const cue = topicKey && word ? stripTajweedCuePrefix(getTajweedWordCue(stage, topicKey, word, language), language) : ''
  if (cue) {
    const templates = language === 'ar'
      ? [
          `ما شاء الله. كانت واضحة. حافظ على نفس الموضع: ${cue}`,
          `ممتاز. الكلمة نظيفة. تذكر هذا الإحساس: ${cue}`,
          'جيد جدًا. ضبطت الصوت. حافظ على هذا الهدوء في الكلمة التالية.',
        ]
      : [
          `MashaAllah. That was clear. Keep that same placement: ${cue}`,
          `Excellent. The word was clean. Remember this feeling: ${cue}`,
          `Very good. You controlled the sound well. Keep it steady like that for the next word.`,
        ]
    return randomFrom(templates)
  }

  const byStageEn: Record<TajweedStage, string[]> = {
    makharij: [
      "MashaAllah. Your makhraj was clear.",
      "Excellent. The sound came from the correct place.",
      "Very good. That was a controlled makhraj.",
      "Well done. The letter was placed accurately.",
      "MashaAllah. Every sound was in its proper place.",
    ],
    sifaat: [
      "MashaAllah. The letter quality was clear.",
      "Excellent. The sound was light and controlled.",
      "Very good. The bounce was gentle and accurate.",
      "Well done. The echo was clean.",
    ],
    ahkam: [
      "MashaAllah. The connection was smooth.",
      "Excellent. The rule was clear and controlled.",
      "Very good. The letters joined correctly.",
      "Well done. The sounds met in the right way.",
    ],
    applied: [
      "MashaAllah. Every letter was placed carefully.",
      "Excellent recitation. Calm and clean.",
      "Very good. Each sound was where it belonged.",
      "Well done. The whole word flowed together.",
    ],
  }
  const byStageAr: Record<TajweedStage, string[]> = {
    makharij: [
      'ما شاء الله. المخرج كان واضحًا.',
      'ممتاز. خرج الصوت من الموضع الصحيح.',
      'جيد جدًا. كان المخرج منضبطًا.',
      'أحسنت. وضعت الحرف بدقة.',
    ],
    sifaat: [
      'ما شاء الله. صفة الحرف كانت واضحة.',
      'ممتاز. الصوت كان خفيفًا ومنضبطًا.',
      'جيد جدًا. القلقلة كانت لطيفة وصحيحة.',
      'أحسنت. الصدى كان نظيفًا.',
    ],
    ahkam: [
      'ما شاء الله. الاتصال كان سلسًا.',
      'ممتاز. الحكم كان واضحًا ومنضبطًا.',
      'جيد جدًا. اتصلت الحروف بطريقة صحيحة.',
      'أحسنت. التقت الأصوات في موضعها الصحيح.',
    ],
    applied: [
      'ما شاء الله. وضعت كل حرف بعناية.',
      'تلاوة ممتازة. هادئة ونظيفة.',
      'جيد جدًا. كل صوت كان في موضعه.',
      'أحسنت. الكلمة كلها جرت بانسجام.',
    ],
  }
  const byStage = language === 'ar' ? byStageAr : byStageEn
  return randomFrom(byStage[stage] ?? byStage.applied)
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
  | 'ready_to_listen'
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
    case 'ready_to_listen':
      return 'Get ready to recite…'
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

// ── Cache prewarm ──

/**
 * Literal, name-free phrases that get spoken on most lessons.
 *
 * The TTS LRU cache keys on the exact rendered text, so name-interpolated
 * feedback ("Beautiful John...") is rarely a cache hit across children. The
 * record-prompt and retry-guidance pools, however, are pure literals — those
 * are the ones worth prewarming at session start.
 *
 * Keep this list under ~20 entries; the backend prewarm endpoint bounds
 * fan-out at 32 to protect upstream TTS quotas.
 */
export function getCommonTutorPhrases(): string[] {
  return [
    // Record prompts — first attempt
    'Your turn.',
    "I'm listening.",
    'Go ahead — take your time.',
    'Recite when ready.',
    'Now you try.',

    // Repeat-after-pass prompts
    'Once more.',
    'Again — even better this time.',
    'One more time.',
    "You've got this. Try again.",
    'Same one — make it stronger.',

    // Retry coaching (literal, no missing-word interpolation)
    'Take a breath. Listen, then say it slowly.',

    // Audio-unclear guidance — literal across all attempts
    "It sounds noisy. Let's try again somewhere quieter.",
    "I didn't hear your voice. Move closer to the microphone and try again.",
    'That was too short. Say the full ayah slowly.',
    "I heard sound, but not the ayah clearly. Let's try again.",
    "I couldn't hear the recitation clearly. Try again.",
    'I could not hear you clearly. Try again.',
    'I could not hear you clearly. Move closer and try again.',

    // Memory check
    "Take a deep breath. I'm listening.",
  ]
}

// ── Tutor feedback (local-first, OpenClaw optional) ──

/**
 * Build tutor feedback for a completed recitation attempt.
 *
 * Default (VITE_OPENCLAW_LIVE_TUTOR=false): returns local template immediately —
 * no network call, no wait, deterministic for every cycle.
 *
 * When VITE_OPENAI_TUTOR_ENABLED=true: tries the backend OpenAI route with a
 * timeout and falls back to local on any failure.
 */
export async function fetchTutorFeedback(
  eventId: number | null,
  ctx: TutorContext,
): Promise<{ message: string; source: 'openai' | 'fallback' }> {
  const name = ctx.childName ? ` ${ctx.childName}` : ''
  const hardcodedFallback = `Good job${name}. Let's continue.`

  // Default: local template only — no OpenAI during live practice.
  const openaiEnabled = import.meta.env.VITE_OPENAI_TUTOR_ENABLED === 'true'
  if (!openaiEnabled) {
    const local = getTutorFeedbackMessage(ctx)
    return { message: local || hardcodedFallback, source: 'fallback' }
  }

  // OpenAI path (only when explicitly enabled).
  if (!eventId) {
    const local = getTutorFeedbackMessage(ctx)
    return { message: local || hardcodedFallback, source: 'fallback' }
  }

  try {
    const { getTutorMessage } = await import('../lib/api')
    const nextAyahNum = ctx.nextAyah?.ayah
    const result = await getTutorMessage(eventId, nextAyahNum)

    if (result.ok && result.message) {
      return { message: result.message, source: 'openai' }
    }

    if (!result.ok && result.message) {
      return { message: result.message, source: 'fallback' }
    }

    const local = getTutorFeedbackMessage(ctx)
    return { message: local || hardcodedFallback, source: 'fallback' }
  } catch (err: any) {
    if (err?.name === 'AbortError') {
      console.log('[Tutor] OpenAI fetch timed out')
    } else {
      console.warn('[Tutor] OpenAI fetch failed:', err)
    }
    const local = getTutorFeedbackMessage(ctx)
    return { message: local || hardcodedFallback, source: 'fallback' }
  }
}
