import { useNavigate } from 'react-router-dom'
import { useState } from 'react'
import {
  Moon, LogOut, BookOpen, Mic, BarChart3, Star, Flame,
  Trophy, ChevronRight, Clock, Target, Play, Pause,
  CheckCircle2, XCircle, AlertCircle
} from 'lucide-react'

export default function Dashboard() {
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState<'practice' | 'progress' | 'settings'>('practice')

  // Mock data — will be replaced with real API calls
  const user = { name: 'Ahmed', role: 'student' as const }
  const stats = {
    streak: 7,
    totalAyahs: 45,
    mastered: 32,
    inProgress: 8,
    accuracy: 92,
    todayRevisions: 3,
  }
  const recentSessions = [
    { surah: 'Al-Baqarah', ayah: '255', accuracy: 96, date: 'Today', status: 'mastered' },
    { surah: 'Al-Baqarah', ayah: '256', accuracy: 82, date: 'Today', status: 'practicing' },
    { surah: 'Al-Baqarah', ayah: '257', accuracy: 45, date: 'Yesterday', status: 'needs-work' },
    { surah: 'Al-Ikhlas', ayah: '1-4', accuracy: 100, date: 'Yesterday', status: 'mastered' },
  ]

  return (
    <div className="min-h-screen bg-surface">
      {/* Top nav */}
      <nav className="bg-surface-card border-b border-surface-dark px-6 py-4 flex justify-between items-center sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl gradient-gold flex items-center justify-center">
            <Moon className="w-4 h-4 text-primary-dark" />
          </div>
          <span className="font-semibold text-lg">NoorHafiz</span>
        </div>
        <div className="flex items-center gap-4">
          <div className="hidden sm:flex items-center gap-2 bg-surface rounded-xl px-3 py-2">
            <Flame className="w-4 h-4 text-orange-500" />
            <span className="text-sm font-bold text-orange-600">{stats.streak} day streak</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-sm font-bold">
              {user.name[0]}
            </div>
            <span className="hidden sm:inline text-sm font-medium">{user.name}</span>
          </div>
          <button onClick={() => navigate('/')} className="text-text-muted hover:text-danger transition-smooth">
            <LogOut className="w-5 h-5" />
          </button>
        </div>
      </nav>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6">
        {/* Welcome + quick stats */}
        <div className="mb-8">
          <h1 className="text-2xl md:text-3xl font-bold text-text-primary mb-1">
            Assalamu Alaikum, {user.name} 👋
          </h1>
          <p className="text-text-muted">Ready to continue your hifz journey?</p>
        </div>

        {/* Stats cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          {[
            { label: 'Ayahs Mastered', value: stats.mastered, total: stats.totalAyahs, icon: CheckCircle2, color: 'text-primary', bg: 'bg-primary/10' },
            { label: 'In Progress', value: stats.inProgress, icon: Clock, color: 'text-gold-dark', bg: 'bg-gold/10' },
            { label: 'Accuracy', value: `${stats.accuracy}%`, icon: Target, color: 'text-primary', bg: 'bg-primary/10' },
            { label: 'Today', value: stats.todayRevisions, suffix: ' revisions', icon: Play, color: 'text-gold-dark', bg: 'bg-gold/10' },
          ].map((stat, i) => (
            <div key={i} className="bg-surface-card rounded-2xl p-5 border border-surface-dark">
              <div className={`w-10 h-10 rounded-xl ${stat.bg} ${stat.color} flex items-center justify-center mb-3`}>
                <stat.icon className="w-5 h-5" />
              </div>
              <div className="text-2xl font-bold text-text-primary">
                {stat.value}
                {stat.suffix && <span className="text-sm font-normal text-text-muted">{stat.suffix}</span>}
                {stat.total && <span className="text-sm font-normal text-text-muted">/{stat.total}</span>}
              </div>
              <div className="text-sm text-text-muted mt-1">{stat.label}</div>
            </div>
          ))}
        </div>

        {/* Progress bar */}
        <div className="bg-surface-card rounded-2xl p-6 border border-surface-dark mb-8">
          <div className="flex justify-between items-center mb-3">
            <span className="font-semibold">Overall Progress</span>
            <span className="text-primary font-bold">{Math.round((stats.mastered / stats.totalAyahs) * 100)}%</span>
          </div>
          <div className="w-full h-3 bg-surface-dark rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-primary to-primary-light rounded-full transition-all duration-500"
              style={{ width: `${(stats.mastered / stats.totalAyahs) * 100}%` }}
            />
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-surface-dark rounded-xl p-1 mb-8">
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

        {/* Tab content */}
        {activeTab === 'practice' && (
          <div className="grid md:grid-cols-3 gap-6">
            {/* Quick practice */}
            <div className="md:col-span-2 space-y-6">
              {/* Current ayah card */}
              <div className="bg-surface-card rounded-2xl border border-surface-dark overflow-hidden">
                <div className="bg-primary-dark p-6 pattern-overlay relative">
                  <div className="relative z-10">
                    <span className="text-gold-light text-sm font-semibold">Continue where you left off</span>
                    <h3 className="text-white text-xl font-bold mt-1">Surah Al-Baqarah, Ayah 258</h3>
                  </div>
                </div>
                <div className="p-6">
                  <p className="arabic text-2xl text-text-primary mb-6 text-center leading-[2.5]">
                    أَلَمْ تَرَ إِلَى الَّذِي حَاجَّ إِبْرَاهِيمَ فِي رَبِّهِ أَنْ آتَاهُ اللَّهُ الْمُلْكَ
                  </p>
                  <button className="w-full bg-primary text-white font-semibold py-4 rounded-xl hover:bg-primary-light transition-smooth flex items-center justify-center gap-3 shadow-md shadow-primary/20">
                    <Mic className="w-5 h-5" />
                    Start Reciting
                  </button>
                </div>
              </div>

              {/* Pick a surah */}
              <div className="bg-surface-card rounded-2xl p-6 border border-surface-dark">
                <h3 className="font-bold text-lg mb-4">Pick a Surah</h3>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { name: 'Al-Fatiha', ayahs: 7, mastered: 7 },
                    { name: 'Al-Baqarah', ayahs: 286, mastered: 32 },
                    { name: 'Al-Ikhlas', ayahs: 4, mastered: 4 },
                    { name: 'Al-Mulk', ayahs: 30, mastered: 0 },
                  ].map(surah => (
                    <button
                      key={surah.name}
                      className="flex items-center justify-between p-4 rounded-xl border border-surface-dark hover:border-primary/30 hover:bg-primary/5 transition-smooth text-left"
                    >
                      <div>
                        <div className="font-semibold text-sm">{surah.name}</div>
                        <div className="text-xs text-text-muted">{surah.ayahs} ayat</div>
                      </div>
                      <div className="flex items-center gap-2">
                        {surah.mastered === surah.ayahs ? (
                          <CheckCircle2 className="w-5 h-5 text-primary" />
                        ) : surah.mastered > 0 ? (
                          <span className="text-xs font-medium text-gold-dark">{surah.mastered}/{surah.ayahs}</span>
                        ) : (
                          <ChevronRight className="w-4 h-4 text-text-muted" />
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Sidebar */}
            <div className="space-y-6">
              {/* Streak card */}
              <div className="bg-surface-card rounded-2xl p-6 border border-surface-dark text-center">
                <Trophy className="w-10 h-10 text-gold mx-auto mb-3" />
                <div className="text-3xl font-bold text-text-primary">{stats.streak}</div>
                <div className="text-text-muted text-sm">Day Streak 🔥</div>
                <div className="mt-4 flex gap-1 justify-center">
                  {Array.from({ length: 7 }).map((_, i) => (
                    <div
                      key={i}
                      className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold ${
                        i < stats.streak
                          ? 'bg-gold/20 text-gold-dark'
                          : 'bg-surface-dark text-text-muted/30'
                      }`}
                    >
                      {i < stats.streak ? '✓' : '·'}
                    </div>
                  ))}
                </div>
              </div>

              {/* Recent sessions */}
              <div className="bg-surface-card rounded-2xl p-6 border border-surface-dark">
                <h3 className="font-bold mb-4">Recent Sessions</h3>
                <div className="space-y-3">
                  {recentSessions.map((session, i) => (
                    <div key={i} className="flex items-center justify-between py-2">
                      <div className="flex items-center gap-3">
                        {session.status === 'mastered' && <CheckCircle2 className="w-4 h-4 text-primary" />}
                        {session.status === 'practicing' && <AlertCircle className="w-4 h-4 text-gold-dark" />}
                        {session.status === 'needs-work' && <XCircle className="w-4 h-4 text-danger" />}
                        <div>
                          <div className="text-sm font-medium">{session.surah} :{session.ayah}</div>
                          <div className="text-xs text-text-muted">{session.date}</div>
                        </div>
                      </div>
                      <span className={`text-sm font-bold ${
                        session.accuracy >= 90 ? 'text-primary' :
                        session.accuracy >= 60 ? 'text-gold-dark' : 'text-danger'
                      }`}>
                        {session.accuracy}%
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'progress' && (
          <div className="bg-surface-card rounded-2xl p-8 border border-surface-dark text-center">
            <BarChart3 className="w-12 h-12 text-primary mx-auto mb-4" />
            <h3 className="text-xl font-bold mb-2">Progress Tracking</h3>
            <p className="text-text-muted mb-6">Detailed analytics coming soon — mastery heatmaps, Tajweed breakdown, and weekly reports.</p>
            <div className="inline-flex items-center gap-2 bg-primary/10 text-primary px-4 py-2 rounded-xl text-sm font-medium">
              <Flame className="w-4 h-4" />
              {stats.mastered} ayahs mastered so far
            </div>
          </div>
        )}

        {activeTab === 'settings' && (
          <div className="bg-surface-card rounded-2xl p-8 border border-surface-dark max-w-lg mx-auto">
            <h3 className="text-xl font-bold mb-6">Settings</h3>
            <div className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-2">Display Name</label>
                <input
                  type="text"
                  defaultValue={user.name}
                  className="w-full px-4 py-3 rounded-xl border border-surface-dark bg-surface text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-smooth"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-2">Qira'ah</label>
                <select className="w-full px-4 py-3 rounded-xl border border-surface-dark bg-surface text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-smooth">
                  <option>Hafs (عاصم)</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-2">Feedback Language</label>
                <select className="w-full px-4 py-3 rounded-xl border border-surface-dark bg-surface text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-smooth">
                  <option>English</option>
                  <option>العربية</option>
                  <option>Français</option>
                </select>
              </div>
              <button className="w-full bg-primary text-white font-semibold py-3 rounded-xl hover:bg-primary-light transition-smooth mt-4">
                Save Changes
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
