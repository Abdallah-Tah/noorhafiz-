import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Moon, Eye, EyeOff, LogIn } from 'lucide-react'
import ThemeToggle from '../components/ThemeToggle'
import { login } from '../lib/api'

export default function Login() {
  const navigate = useNavigate()
  const [showPassword, setShowPassword] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    login(email, password).then(() => {
      navigate('/dashboard')
    }).catch(err => {
      alert(err.message)
    })
  }

  return (
    <div className="min-h-screen flex">
      {/* Left panel — decorative */}
      <div 
        className="hidden lg:flex lg:w-1/2 pattern-overlay relative flex-col justify-center items-center p-12" 
        style={{ background: 'linear-gradient(135deg, #1B6B4A 0%, #2A9D6F 50%, #1B6B4A 100%)' }}
      >
        <div className="relative z-10 text-center">
          <div className="w-20 h-20 rounded-3xl gradient-gold flex items-center justify-center mx-auto mb-8 animate-pulse-glow">
            <Moon className="w-10 h-10 text-primary-dark" />
          </div>
          <h1 className="text-4xl font-bold text-white mb-4">NoorHafiz</h1>
          <p className="arabic text-gold-light/80 text-2xl mb-6">نور حافظ</p>
          <p className="text-white/60 max-w-sm leading-relaxed">
            Your AI-powered companion for Quran memorization. Listen, recite, and master the Quran with confidence.
          </p>
        </div>
        {/* Floating shapes */}
        <div className="absolute top-20 left-10 w-16 h-16 rounded-full bg-white/5 animate-float" />
        <div className="absolute bottom-20 right-10 w-24 h-24 rounded-full bg-gold/10 animate-float" style={{ animationDelay: '1.5s' }} />
      </div>

      {/* Right panel — form */}
      <div className="flex-1 flex items-center justify-center p-4 sm:p-6 bg-surface overflow-y-auto">
        <div className="w-full max-w-md py-6 sm:py-0">
          {/* Mobile logo */}
          <div className="lg:hidden flex items-center gap-3 mb-10">
            <div className="w-10 h-10 rounded-xl gradient-gold flex items-center justify-center">
              <Moon className="w-5 h-5 text-primary-dark" />
            </div>
            <span className="font-semibold text-xl">NoorHafiz</span>
          </div>

          <div className="mb-6 sm:mb-8">
            <h2 className="text-2xl sm:text-3xl font-bold text-text-primary mb-2">Welcome back</h2>
            <p className="text-text-muted text-sm sm:text-base">Continue your hifz journey where you left off.</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-2">Email</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="your@email.com"
                className="w-full px-4 py-3.5 rounded-xl border border-surface-dark bg-surface-card text-text-primary placeholder:text-text-muted/50 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-smooth"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-text-secondary mb-2">Password</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  className="w-full px-4 py-3.5 rounded-xl border border-surface-dark bg-surface-card text-text-primary placeholder:text-text-muted/50 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-smooth pr-12"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-secondary transition-smooth"
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            <div className="flex justify-between items-center">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" className="w-4 h-4 rounded border-surface-dark text-primary focus:ring-primary" />
                <span className="text-sm text-text-muted">Remember me</span>
              </label>
              <button type="button" className="text-sm text-primary hover:text-primary-light font-medium transition-smooth">
                Forgot password?
              </button>
            </div>

            <button
              type="submit"
              className="w-full bg-primary-dark text-white font-semibold py-3.5 rounded-xl hover:bg-primary transition-smooth flex items-center justify-center gap-2 shadow-md shadow-primary/20"
            >
              <LogIn className="w-5 h-5" />
              Log In
            </button>
          </form>

          <div className="mt-8 text-center">
            <p className="text-text-muted text-sm">
              Don't have an account?{' '}
              <button onClick={() => navigate('/signup')} className="text-primary font-semibold hover:text-primary-light transition-smooth">
                Sign up free
              </button>
            </p>
          </div>

          <button onClick={() => navigate('/')} className="mt-6 w-full text-center text-sm text-text-muted hover:text-text-secondary transition-smooth">
            ← Back to home
          </button>
          <div className="mt-4 flex justify-center">
            <ThemeToggle />
          </div>
        </div>
      </div>
    </div>
  )
}
