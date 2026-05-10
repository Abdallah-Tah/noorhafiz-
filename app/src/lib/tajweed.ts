// Tajweed section client — talks to the /tajweed router.

const API_BASE = '/nh/api'

function getToken(): string | null {
  return localStorage.getItem('nh-token')
}

async function tajweedFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken()
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> || {}),
  }
  if (token) headers['Authorization'] = `Bearer ${token}`

  let res: Response
  try {
    res = await fetch(`${API_BASE}${path}`, { ...options, headers })
  } catch (err) {
    const detail = err instanceof Error ? err.message : 'network error'
    throw new Error(`Cannot reach the backend. Is the API server running on port 8000? (${detail})`, { cause: err })
  }

  if (res.status === 401) {
    localStorage.removeItem('nh-token')
    window.location.href = '/login'
    throw new Error('Unauthorized')
  }
  // 404 on a /tajweed route almost always means the router wasn't registered
  // when the running backend started. Detect this and give an actionable
  // message instead of the bare "Not Found" body.
  if (res.status === 404) {
    const body = await res.json().catch(() => ({}))
    const detail = body.detail || 'Not Found'
    if (detail === 'Not Found') {
      throw new Error('Tajweed routes are not registered on the running backend — restart the API server (uvicorn) so it picks up the new /tajweed router.')
    }
    throw new Error(detail)
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.detail || `Tajweed API ${res.status}`)
  }
  return res.json()
}

export type TajweedStage = 'makharij' | 'sifaat' | 'ahkam' | 'applied'
export type LessonStatus = 'locked' | 'available' | 'in_progress' | 'mastered'

export interface TajweedDemoAyah {
  surah: number
  ayah: number
  highlight_indices?: number[]
}

export interface TajweedLesson {
  id: number
  order_index: number
  stage: TajweedStage
  topic_key: string
  title_ar: string
  title_en: string
  explanation_ar: string
  explanation_en: string
  demo_words: string[]
  demo_ayat: TajweedDemoAyah[]
  prerequisite_ids: number[]
  drill_pass_target: number
}

export interface TajweedLessonProgress extends TajweedLesson {
  status: LessonStatus
  drill_pass_count: number
  mastered_at: string | null
}

export async function getTajweedLessons(): Promise<TajweedLesson[]> {
  return tajweedFetch<TajweedLesson[]>('/tajweed/lessons')
}

export async function getTajweedProgress(childId: number): Promise<TajweedLessonProgress[]> {
  return tajweedFetch<TajweedLessonProgress[]>(`/tajweed/progress/${childId}`)
}

export async function recordDrillPass(lessonId: number, childId: number): Promise<TajweedLessonProgress> {
  return tajweedFetch<TajweedLessonProgress>(`/tajweed/lesson/${lessonId}/drill-pass`, {
    method: 'POST',
    body: JSON.stringify({ child_id: childId }),
  })
}

export async function completeTajweedLesson(lessonId: number, childId: number): Promise<TajweedLessonProgress> {
  return tajweedFetch<TajweedLessonProgress>(`/tajweed/lesson/${lessonId}/complete`, {
    method: 'POST',
    body: JSON.stringify({ child_id: childId }),
  })
}

// ── Stage labels for UI ──

export const STAGE_LABELS: Record<TajweedStage, { en: string; ar: string }> = {
  makharij: { en: 'Articulation Points', ar: 'مخارج الحروف' },
  sifaat: { en: 'Letter Attributes', ar: 'صفات الحروف' },
  ahkam: { en: 'Tajweed Rules', ar: 'أحكام التجويد' },
  applied: { en: 'Applied Practice', ar: 'تطبيقات' },
}

export const STAGE_ORDER: TajweedStage[] = ['makharij', 'sifaat', 'ahkam', 'applied']
