const API_BASE = '/nh/api'

// Token management
function getToken(): string | null {
  return localStorage.getItem('nh-token')
}

function setToken(token: string) {
  localStorage.setItem('nh-token', token)
}

function clearToken() {
  localStorage.removeItem('nh-token')
}

// Base fetch with auth
async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken()
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> || {}),
  }
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers })

  if (res.status === 401) {
    clearToken()
    window.location.href = '/login'
    throw new Error('Unauthorized')
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.detail || `API error ${res.status}`)
  }

  return res.json()
}

// ── Types ──

export interface User {
  id: number
  name: string
  email: string
  role: string
  language: string
  qiraa: string
  children: Child[]
}

export interface Child {
  id: number
  parent_id: number
  name: string
  age: number | null
  avatar: string | null
  current_surah: number
  current_ayah: number
  streak_days: number
  total_mastered: number
  total_practiced: number
}

export interface PracticeSession {
  id: number
  child_id: number
  surah: number
  ayah_start: number
  ayah_end: number
  accuracy: number
  words_correct: number
  words_total: number
  mistakes: string | null
  status: string
  duration_seconds: number
}

// ── Auth ──

export async function signup(name: string, email: string, password: string) {
  const data = await apiFetch<{ access_token: string }>('/auth/signup', {
    method: 'POST',
    body: JSON.stringify({ name, email, password }),
  })
  setToken(data.access_token)
  return data
}

export async function login(email: string, password: string) {
  const data = await apiFetch<{ access_token: string }>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  })
  setToken(data.access_token)
  return data
}

export function logout() {
  clearToken()
}

export function isLoggedIn(): boolean {
  return !!getToken()
}

// ── User ──

export async function getProfile(): Promise<User> {
  return apiFetch<User>('/users/me')
}

export async function updateProfile(data: Partial<Pick<User, 'name' | 'language' | 'qiraa'>>): Promise<User> {
  return apiFetch<User>('/users/me', {
    method: 'PATCH',
    body: JSON.stringify(data),
  })
}

// ── Children ──

export async function getChildren(): Promise<Child[]> {
  return apiFetch<Child[]>('/users/children')
}

export async function createChild(name: string, age?: number, avatar?: string): Promise<Child> {
  return apiFetch<Child>('/users/children', {
    method: 'POST',
    body: JSON.stringify({ name, age, avatar }),
  })
}

export async function updateChild(id: number, data: Partial<Child>): Promise<Child> {
  return apiFetch<Child>(`/users/children/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  })
}

export async function deleteChild(id: number): Promise<void> {
  await apiFetch(`/users/children/${id}`, { method: 'DELETE' })
}

// ── Practice ──

export async function getSessions(childId: number, limit = 20): Promise<PracticeSession[]> {
  return apiFetch<PracticeSession[]>(`/practice/sessions/${childId}?limit=${limit}`)
}

export async function createSession(data: {
  child_id: number
  surah: number
  ayah_start: number
  ayah_end: number
  accuracy: number
  words_correct: number
  words_total: number
  mistakes?: string
  status?: string
  duration_seconds?: number
}): Promise<PracticeSession> {
  return apiFetch<PracticeSession>('/practice/sessions', {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export async function getDashboard(childId: number) {
  return apiFetch<any>(`/practice/dashboard/${childId}`)
}
