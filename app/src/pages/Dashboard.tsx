import { useNavigate } from 'react-router-dom'
import { useState, useEffect } from 'react'
import {
  Moon, LogOut, Mic, BarChart3, Star, Flame,
  Trophy, ChevronRight, Clock, Target,
  CheckCircle2, XCircle, AlertCircle, Users,
  Volume2, Square, RefreshCw
} from 'lucide-react'
import ThemeToggle from '../components/ThemeToggle'
import { logout, getProfile, getDashboard, updateProfile, type User, type Child, type PracticeSession } from '../lib/api'
import { getAyahAudioUrl, getAyahText, playAudio } from '../lib/quran'

// Surah name lookup
const SURAH_NAMES: Record<number, string> = {
  1: 'Al-Fatiha', 2: 'Al-Baqarah', 3: 'Ali Imran', 4: 'An-Nisa', 5: 'Al-Ma\'idah',
  6: 'Al-An\'am', 7: 'Al-A\'raf', 8: 'Al-Anfal', 9: 'At-Tawbah', 10: 'Yunus',
  11: 'Hud', 12: 'Yusuf', 13: 'Ar-Ra\'d', 14: 'Ibrahim', 15: 'Al-Hijr',
  36: 'Ya-Sin', 55: 'Ar-Rahman', 56: 'Al-Waqi\'ah', 67: 'Al-Mulk',
  78: 'An-Naba', 87: 'Al-A\'la', 93: 'Ad-Duha', 94: 'Ash-Sharh',
  95: 'At-Tin', 96: 'Al-Alaq', 97: 'Al-Qadr', 98: 'Al-Bayyinah',
  99: 'Az-Zalzalah', 100: 'Al-Adiyat', 101: 'Al-Qari\'ah', 102: 'At-Takathur',
  103: 'Al-Asr', 104: 'Al-Humazah', 105: 'Al-Fil', 106: 'Quraysh',
  107: 'Al-Ma\'un', 108: 'Al-Kawthar', 109: 'Al-Kafirun', 110: 'An-Nasr',
  111: 'Al-Masad', 112: 'Al-Ikhlas', 113: 'Al-Falaq', 114: 'An-Nas',
}

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

  useEffect(() => {
    loadData()
  }, [])

  useEffect(() => {
    if (selectedChild) {
      loadAyahText(selectedChild.current_surah, selectedChild.current_ayah)
    }
  }, [selectedChild?.id])

  async function loadAyahText(surah: number, ayah: number) {
    setAyahText('Loading...')
    const text = await getAyahText(surah, ayah)
    setAyahText(text || 'Arabic text unavailable')
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
                { label: 'Current', value: `${SURAH_NAMES[selectedChild.current_surah] || 'S.' + selectedChild.current_surah}`, icon: Target, color: 'text-primary', bg: 'bg-primary/10' },
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
                          {SURAH_NAMES[selectedChild.current_surah] || `Surah ${selectedChild.current_surah}`}, Ayah {selectedChild.current_ayah}
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
                          <p className="text-center text-text-muted text-sm">
                            Listen to the correct recitation first, then repeat it.
                          </p>
                          <button
                            onClick={async () => {
                              try {
                                setIsPlaying(true)
                                setAudioError('')
                                const url = getAyahAudioUrl(selectedChild.current_surah, selectedChild.current_ayah)
                                await playAudio(url)
                                setPracticeStep('record')
                              } catch {
                                setAudioError('Could not play audio. Check your connection.')
                              } finally {
                                setIsPlaying(false)
                              }
                            }}
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
                          <button
                            onClick={async () => {
                              try {
                                setIsRecording(true)
                                // Real mic recording will be wired to Whisper backend
                                // For now, simulate recording time
                                await new Promise(r => setTimeout(r, 4000))
                                setIsRecording(false)
                                setPracticeStep('result')
                              } catch {
                                setIsRecording(false)
                              }
                            }}
                            disabled={isRecording}
                            className={`w-full font-semibold py-4 rounded-xl flex items-center justify-center gap-3 transition-smooth ${
                              isRecording
                                ? 'bg-danger text-white animate-pulse shadow-md shadow-danger/20'
                                : 'bg-primary-dark text-white hover:bg-primary shadow-md shadow-primary/20'
                            }`}
                          >
                            {isRecording ? (
                              <><Square className="w-5 h-5" /> Recording... tap to stop</>
                            ) : (
                              <><Mic className="w-5 h-5" /> Start Recording</>
                            )}
                          </button>
                          <button
                            onClick={() => setPracticeStep('listen')}
                            className="w-full text-text-muted font-medium py-2 text-sm hover:text-text-primary transition-smooth"
                          >
                            ← Listen again
                          </button>
                        </div>
                      )}

                      {/* Step 3: Result */}
                      {practiceStep === 'result' && (
                        <div className="space-y-4">
                          {/* Placeholder result — will be real from Whisper + quran-mcp */}
                          <div className="bg-success-light rounded-xl p-4 text-center">
                            <CheckCircle2 className="w-8 h-8 text-primary mx-auto mb-2" />
                            <p className="font-bold text-primary">Great job!</p>
                            <p className="text-sm text-text-muted mt-1">AI feedback will appear here after recitation analysis.</p>
                          </div>
                          <button
                            onClick={() => setPracticeStep('listen')}
                            className="w-full bg-primary-dark text-white font-semibold py-3 rounded-xl hover:bg-primary transition-smooth flex items-center justify-center gap-2"
                          >
                            <RefreshCw className="w-4 h-4" />
                            Try Again
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Quick surahs */}
                  <div className="bg-surface-card rounded-2xl p-4 sm:p-6 border border-surface-dark">
                    <h3 className="font-bold text-lg mb-4 text-text-primary">Quick Surahs</h3>
                    <div className="grid grid-cols-2 gap-3">
                      {[1, 112, 113, 114, 36, 67, 55, 56].map(num => (
                        <button
                          key={num}
                          className="flex items-center justify-between p-4 rounded-xl border border-surface-dark hover:border-primary/30 hover:bg-primary/5 transition-smooth text-left"
                        >
                          <div>
                            <div className="font-semibold text-sm text-text-primary">{SURAH_NAMES[num] || `Surah ${num}`}</div>
                            <div className="text-xs text-text-muted">Surah {num}</div>
                          </div>
                          <ChevronRight className="w-4 h-4 text-text-muted" />
                        </button>
                      ))}
                    </div>
                  </div>
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
                                    {SURAH_NAMES[session.surah] || `S.${session.surah}`} :{session.ayah_start}{session.ayah_end !== session.ayah_start ? `-${session.ayah_end}` : ''}
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
                  <button
                    onClick={handleSaveSettings}
                    className="w-full bg-primary-dark text-white font-semibold py-3 rounded-xl hover:bg-primary transition-smooth mt-4"
                  >
                    Save Changes
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
