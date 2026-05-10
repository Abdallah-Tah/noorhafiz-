import { useEffect, useState } from 'react'
import { Sparkles } from 'lucide-react'
import TajweedTree from './TajweedTree'
import TajweedLessonPlayer from './TajweedLessonPlayer'
import { getTajweedProgress, type TajweedLessonProgress } from '../lib/tajweed'
import type { Child } from '../lib/api'

interface Props {
  child: Child | null
}

export default function TajweedSection({ child }: Props) {
  const [lessons, setLessons] = useState<TajweedLessonProgress[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeLesson, setActiveLesson] = useState<TajweedLessonProgress | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      if (!child) {
        setLessons([])
        setLoading(false)
        return
      }
      setLoading(true)
      setError(null)
      try {
        const data = await getTajweedProgress(child.id)
        if (!cancelled) {
          setLessons(data)
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load tajweed lessons')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => { cancelled = true }
  }, [child?.id])

  function handleProgressChange(updated: TajweedLessonProgress) {
    setLessons(prev => prev.map(l => l.id === updated.id ? updated : l))
    // Re-derive locked → available in case prereq just got mastered.
    if (updated.status === 'mastered') {
      setLessons(prev => recomputeLocks(prev))
    }
  }

  if (!child) {
    return (
      <div className="bg-card border border-border rounded-xl p-8 text-center text-text-muted">
        <Sparkles className="w-10 h-10 mx-auto mb-3 text-gold-dark" />
        <p>Select a child to start the tajweed lessons.</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-card border border-border rounded-xl p-6 text-center text-red-600 dark:text-red-300">
        {error}
      </div>
    )
  }

  return (
    <div>
      <TajweedTree lessons={lessons} loading={loading} onSelect={setActiveLesson} />
      {activeLesson && (
        <TajweedLessonPlayer
          lesson={activeLesson}
          childId={child.id}
          onClose={() => setActiveLesson(null)}
          onProgressChange={handleProgressChange}
        />
      )}
    </div>
  )
}

/** When a lesson newly becomes mastered, any lesson whose prerequisite_ids are
 * fully mastered should flip from 'locked' to 'available'. The backend recomputes
 * this on every progress fetch, but we apply the same rule client-side so the UI
 * updates without an extra round-trip after a drill-pass. */
function recomputeLocks(lessons: TajweedLessonProgress[]): TajweedLessonProgress[] {
  const masteredIds = new Set(lessons.filter(l => l.status === 'mastered').map(l => l.id))
  return lessons.map(l => {
    if (l.status === 'mastered' || l.status === 'in_progress') return l
    const allMastered = l.prerequisite_ids.every(id => masteredIds.has(id))
    return { ...l, status: allMastered ? 'available' : 'locked' }
  })
}
