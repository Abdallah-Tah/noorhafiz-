import { Lock, CheckCircle2, PlayCircle, Award } from 'lucide-react'
import type { TajweedLessonProgress, TajweedStage } from '../lib/tajweed'
import { STAGE_LABELS, STAGE_ORDER } from '../lib/tajweed'

interface Props {
  lessons: TajweedLessonProgress[]
  onSelect: (lesson: TajweedLessonProgress) => void
  loading?: boolean
}

export default function TajweedTree({ lessons, onSelect, loading }: Props) {
  if (loading) {
    return (
      <div className="text-center text-text-muted py-12">Loading curriculum…</div>
    )
  }

  if (!lessons.length) {
    return (
      <div className="text-center text-text-muted py-12">
        No tajweed lessons available yet. Run the seed migration to populate.
      </div>
    )
  }

  // Group by stage in fixed Suwaid order
  const byStage = STAGE_ORDER.reduce((acc, stage) => {
    acc[stage] = lessons.filter(l => l.stage === stage).sort((a, b) => a.order_index - b.order_index)
    return acc
  }, {} as Record<TajweedStage, TajweedLessonProgress[]>)

  const masteredCount = lessons.filter(l => l.status === 'mastered').length

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between bg-card border border-border rounded-xl p-4">
        <div>
          <div className="text-sm text-text-muted">Tajweed progress</div>
          <div className="text-2xl font-bold text-text">{masteredCount} / {lessons.length} mastered</div>
        </div>
        <Award className="w-10 h-10 text-gold-dark" />
      </div>

      {STAGE_ORDER.map(stage => {
        const stageLessons = byStage[stage]
        if (!stageLessons.length) return null
        return (
          <section key={stage}>
            <div className="flex items-baseline justify-between mb-3 px-1">
              <h3 className="text-lg font-semibold text-text">{STAGE_LABELS[stage].en}</h3>
              <span className="text-sm font-arabic text-text-muted" dir="rtl">{STAGE_LABELS[stage].ar}</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {stageLessons.map(lesson => (
                <LessonCard key={lesson.id} lesson={lesson} onSelect={onSelect} />
              ))}
            </div>
          </section>
        )
      })}
    </div>
  )
}

function LessonCard({ lesson, onSelect }: { lesson: TajweedLessonProgress; onSelect: (l: TajweedLessonProgress) => void }) {
  const locked = lesson.status === 'locked'
  const mastered = lesson.status === 'mastered'
  const inProgress = lesson.status === 'in_progress'
  const progressPct = Math.min(100, Math.round((lesson.drill_pass_count / lesson.drill_pass_target) * 100))

  return (
    <button
      type="button"
      disabled={locked}
      onClick={() => !locked && onSelect(lesson)}
      className={`text-left rounded-xl border p-4 transition-all ${
        locked
          ? 'bg-card/50 border-border/50 opacity-60 cursor-not-allowed'
          : mastered
          ? 'bg-primary/5 border-primary/40 hover:bg-primary/10'
          : 'bg-card border-border hover:border-primary/40 hover:shadow-md'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="text-sm text-text-muted">Lesson {lesson.order_index}</div>
          <div className="font-semibold text-text truncate">{lesson.title_en}</div>
          <div className="font-arabic text-text-muted text-sm truncate" dir="rtl">{lesson.title_ar}</div>
        </div>
        <div className="shrink-0">
          {locked && <Lock className="w-5 h-5 text-text-muted" />}
          {mastered && <CheckCircle2 className="w-5 h-5 text-primary" />}
          {!locked && !mastered && <PlayCircle className="w-5 h-5 text-gold-dark" />}
        </div>
      </div>
      {!locked && !mastered && (
        <div className="mt-3">
          <div className="h-1.5 rounded-full bg-border overflow-hidden">
            <div className="h-full bg-gold-dark transition-all" style={{ width: `${progressPct}%` }} />
          </div>
          <div className="text-xs text-text-muted mt-1">
            {inProgress
              ? `${lesson.drill_pass_count} / ${lesson.drill_pass_target} drill passes`
              : `Tap to begin (${lesson.drill_pass_target} drills)`}
          </div>
        </div>
      )}
      {mastered && (
        <div className="text-xs text-primary mt-2">Mastered</div>
      )}
    </button>
  )
}
