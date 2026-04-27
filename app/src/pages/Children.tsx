import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Plus, Trash2, User, BookOpen, Settings, Volume2, VolumeX } from 'lucide-react'
import ThemeToggle from '../components/ThemeToggle'
import { getChildren, createChild, deleteChild, updateChild, type Child } from '../lib/api'

export default function ChildrenPage() {
  const navigate = useNavigate()
  const [children, setChildren] = useState<Child[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [name, setName] = useState('')
  const [age, setAge] = useState('')
  const [editingChild, setEditingChild] = useState<number | null>(null)

  useEffect(() => {
    loadChildren()
  }, [])

  async function loadChildren() {
    try {
      const data = await getChildren()
      setChildren(data)
    } catch {
      // not logged in
      navigate('/login')
    } finally {
      setLoading(false)
    }
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    try {
      const child = await createChild(name, age ? parseInt(age) : undefined)
      setChildren(prev => [...prev, child])
      setName('')
      setAge('')
      setShowForm(false)
    } catch (err: any) {
      alert(err.message)
    }
  }

  async function handleDelete(id: number) {
    if (!confirm('Remove this child profile?')) return
    try {
      await deleteChild(id)
      setChildren(prev => prev.filter(c => c.id !== id))
    } catch (err: any) {
      alert(err.message)
    }
  }

  async function handleUpdateSetting(childId: number, field: string, value: any) {
    try {
      const updated = await updateChild(childId, { [field]: value })
      setChildren(prev => prev.map(c => c.id === childId ? { ...c, ...updated } : c))
    } catch (err: any) {
      alert(err.message)
    }
  }

  const avatarEmojis = ['👦', '👧', '🧒', '👶', '📚', '🌟', '🌙', '🦁']

  return (
    <div className="min-h-screen bg-surface">
      {/* Nav */}
      <nav className="bg-surface-card border-b border-surface-dark px-4 sm:px-6 py-3 sm:py-4 flex justify-between items-center sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/dashboard')} className="text-text-muted hover:text-text-primary transition-smooth">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <span className="font-semibold text-text-primary">Child Profiles</span>
        </div>
        <ThemeToggle />
      </nav>

      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-2xl font-bold text-text-primary">Your Children</h1>
            <p className="text-text-muted text-sm mt-1">Manage hifz profiles for each child</p>
          </div>
          <button
            onClick={() => setShowForm(!showForm)}
            className="bg-primary-dark text-white font-semibold px-4 py-2 rounded-xl text-sm hover:bg-primary transition-smooth flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Add Child
          </button>
        </div>

        {/* Add child form */}
        {showForm && (
          <form onSubmit={handleAdd} className="bg-surface-card rounded-2xl p-6 border border-surface-dark mb-6">
            <h3 className="font-bold text-text-primary mb-4">New Child Profile</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-2">Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="Child's name"
                  className="w-full px-4 py-3 rounded-xl border border-surface-dark bg-surface text-text-primary placeholder:text-text-muted/50 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-smooth"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-2">Age (optional)</label>
                <input
                  type="number"
                  value={age}
                  onChange={e => setAge(e.target.value)}
                  placeholder="Age"
                  min="3"
                  max="18"
                  className="w-full px-4 py-3 rounded-xl border border-surface-dark bg-surface text-text-primary placeholder:text-text-muted/50 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-smooth"
                />
              </div>
              <div className="flex gap-3">
                <button type="submit" className="bg-primary-dark text-white font-semibold px-6 py-2.5 rounded-xl hover:bg-primary transition-smooth">
                  Create Profile
                </button>
                <button type="button" onClick={() => setShowForm(false)} className="text-text-muted font-medium px-4 py-2.5 rounded-xl hover:text-text-primary transition-smooth">
                  Cancel
                </button>
              </div>
            </div>
          </form>
        )}

        {/* Children list */}
        {loading ? (
          <div className="text-center py-12 text-text-muted">Loading...</div>
        ) : children.length === 0 ? (
          <div className="text-center py-16">
            <User className="w-12 h-12 text-text-muted mx-auto mb-4" />
            <h3 className="text-lg font-bold text-text-primary mb-2">No children yet</h3>
            <p className="text-text-muted text-sm">Add a child profile to start tracking their hifz progress.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {children.map(child => (
              <div key={child.id} className="bg-surface-card rounded-2xl border border-surface-dark overflow-hidden">
                <div className="p-5 flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xl">
                      {avatarEmojis[child.id % avatarEmojis.length]}
                    </div>
                    <div>
                      <h3 className="font-bold text-text-primary">{child.name}</h3>
                      <div className="flex items-center gap-3 text-sm text-text-muted mt-1">
                        {child.age && <span>Age {child.age}</span>}
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                          child.difficulty === 'beginner' ? 'bg-success-light text-primary' :
                          child.difficulty === 'hard' ? 'bg-danger-light text-danger' :
                          child.difficulty === 'advanced' ? 'bg-gold/10 text-gold-dark' :
                          'bg-surface-dark text-text-muted'
                        }`}>
                          {child.difficulty || 'Medium'}
                        </span>
                        <span className="flex items-center gap-1">
                          <BookOpen className="w-3.5 h-3.5" />
                          {child.total_mastered} mastered
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => navigate(`/dashboard?child=${child.id}`)}
                      className="bg-primary/10 text-primary font-medium px-4 py-2 rounded-lg text-sm hover:bg-primary/20 transition-smooth"
                    >
                      Practice
                    </button>
                    <button
                      onClick={() => setEditingChild(editingChild === child.id ? null : child.id)}
                      className={`p-2 transition-smooth ${editingChild === child.id ? 'text-primary bg-primary/10 rounded-lg' : 'text-text-muted hover:text-text-primary'}`}
                    >
                      <Settings className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(child.id)}
                      className="p-2 text-text-muted hover:text-danger transition-smooth"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                {/* Settings panel */}
                {editingChild === child.id && (
                  <div className="px-5 pb-5 pt-0 border-t border-surface-dark">
                    <div className="pt-4 space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-text-secondary mb-2">Difficulty Level</label>
                        <select
                          value={child.difficulty || 'medium'}
                          onChange={e => handleUpdateSetting(child.id, 'difficulty', e.target.value)}
                          className="w-full px-4 py-3 rounded-xl border border-surface-dark bg-surface text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                        >
                          <option value="beginner">Beginner — forgiving, 60% to pass</option>
                          <option value="medium">Medium — balanced, 75% to pass</option>
                          <option value="advanced">Advanced — strict, 85% to pass</option>
                          <option value="hard">Hard — hifz test, 90% to pass</option>
                        </select>
                      </div>
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium text-text-primary">Voice Tutor</p>
                          <p className="text-xs text-text-muted">AI tutor speaks feedback after each ayah</p>
                        </div>
                        <button
                          onClick={() => handleUpdateSetting(child.id, 'voice_tutor', !child.voice_tutor)}
                          className={`flex items-center gap-2 text-sm font-semibold px-3 py-1.5 rounded-full transition-smooth ${
                            child.voice_tutor
                              ? 'bg-primary text-white'
                              : 'bg-surface-dark text-text-muted'
                          }`}
                        >
                          {child.voice_tutor ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
                          {child.voice_tutor ? 'ON' : 'OFF'}
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
