import { useNavigate } from 'react-router-dom'
import { BookOpen, Mic, BarChart3, Star, ChevronRight, Moon } from 'lucide-react'
import ThemeToggle from '../components/ThemeToggle'
import { useTheme } from '../hooks/useTheme'

export default function Welcome() {
  const navigate = useNavigate()
  useTheme()

  return (
    <div className="min-h-screen">
      {/* Hero Section */}
      <section 
        className="relative min-h-screen pattern-overlay flex items-center overflow-hidden" 
        style={{ background: 'linear-gradient(135deg, #1B6B4A 0%, #2A9D6F 50%, #1B6B4A 100%)' }}
      >
        {/* Floating decorative elements */}
        <div className="absolute top-20 right-10 w-20 h-20 rounded-full bg-white/10 animate-float" />
        <div className="absolute bottom-32 left-10 w-14 h-14 rounded-full bg-white/20 animate-float" style={{ animationDelay: '1s' }} />
        <div className="absolute top-40 left-1/4 w-8 h-8 rounded-full bg-white/5 animate-float" style={{ animationDelay: '2s' }} />

        {/* Nav */}
        <nav className="absolute top-0 left-0 right-0 p-4 sm:p-6 flex justify-between items-center z-10">
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl gradient-gold flex items-center justify-center">
              <Moon className="w-4 h-4 sm:w-5 sm:h-5 text-primary-dark" />
            </div>
            <span className="text-white font-semibold text-lg sm:text-xl tracking-wide">NoorHafiz</span>
          </div>
          {/* Desktop nav */}
          <div className="hidden md:flex items-center gap-4">
            <button onClick={() => navigate('/about')} className="text-white/80 hover:text-white text-sm font-medium transition-smooth">
              About
            </button>
            <button onClick={() => navigate('/login')} className="text-white/80 hover:text-white text-sm font-medium transition-smooth">
              Log In
            </button>
            <div className="flex items-center gap-3">
              <ThemeToggle />
              <button onClick={() => navigate('/signup')} className="bg-white text-primary-dark font-semibold px-5 py-2 rounded-xl text-sm hover:bg-white/90 transition-smooth">
                Get Started
              </button>
            </div>
          </div>
          {/* Mobile nav */}
          <div className="flex md:hidden items-center gap-2">
            <ThemeToggle />
            <button onClick={() => navigate('/login')} className="text-white/80 hover:text-white text-xs font-medium transition-smooth">
              Log In
            </button>
            <button onClick={() => navigate('/signup')} className="bg-white text-primary-dark font-semibold px-3 py-1.5 rounded-lg text-xs hover:bg-white/90 transition-smooth">
              Start
            </button>
          </div>
        </nav>

        {/* Hero Content */}
        <div className="max-w-6xl mx-auto px-4 sm:px-6 pt-28 sm:pt-24 pb-16 sm:pb-12 text-center relative z-10">
          {/* Arabic bismillah */}
          <p className="arabic text-white/60 text-lg sm:text-2xl mb-4 sm:mb-6">بِسْمِ اللَّهِ الرَّحْمَنِ الرَّحِيمِ</p>

          <h1 className="text-3xl sm:text-5xl md:text-7xl font-bold text-white mb-4 sm:mb-6 leading-tight">
            Master Your <br />
            <span className="text-gold-light">Quran Memorization</span>
          </h1>

          <p className="text-white/70 text-base sm:text-lg md:text-xl max-w-2xl mx-auto mb-8 sm:mb-10 leading-relaxed px-2">
            An AI-powered companion that listens, corrects, and guides your hifz journey.
            Built for kids, loved by parents.
          </p>

          <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 justify-center px-4 sm:px-0">
            <button
              onClick={() => navigate('/signup')}
              className="bg-gold text-primary-dark font-bold px-6 sm:px-8 py-3.5 sm:py-4 rounded-2xl text-base sm:text-lg hover:bg-gold-light transition-smooth flex items-center justify-center gap-2 shadow-lg shadow-gold/30"
            >
              Start Learning Free
              <ChevronRight className="w-5 h-5" />
            </button>
            <button
              onClick={() => navigate('/about')}
              className="glass text-white font-semibold px-6 sm:px-8 py-3.5 sm:py-4 rounded-2xl text-base sm:text-lg hover:bg-white/20 transition-smooth"
            >
              See How It Works
            </button>
          </div>

          {/* Stats bar */}
          <div className="mt-12 sm:mt-16 flex flex-wrap justify-center gap-6 sm:gap-8 md:gap-16">
            {[
              { label: 'Ayat Covered', value: '6,236' },
              { label: 'Kids Learning', value: '1,200+' },
              { label: 'Accuracy', value: '95%' },
            ].map(stat => (
              <div key={stat.label} className="text-center">
                <div className="text-3xl font-bold text-gold-light">{stat.value}</div>
                <div className="text-white/50 text-sm mt-1">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Wave divider — matches surface color */}
        <div className="absolute bottom-0 left-0 right-0">
          <svg viewBox="0 0 1440 120" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M0 120L48 108C96 96 192 72 288 66C384 60 480 72 576 78C672 84 768 84 864 78C960 72 1056 60 1152 60C1248 60 1344 72 1392 78L1440 84V120H1392C1344 120 1248 120 1152 120C1056 120 960 120 864 120C768 120 672 120 576 120C480 120 384 120 288 120C192 120 96 120 48 120H0Z" className="fill-surface"/>
          </svg>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-16 sm:py-24 px-4 sm:px-6">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-12 sm:mb-16">
            <span className="text-primary font-semibold text-xs sm:text-sm tracking-widest uppercase">How It Works</span>
            <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold text-text-primary mt-3 mb-3 sm:mb-4">
              Three Steps to Hifz Mastery
            </h2>
            <p className="text-text-muted max-w-xl mx-auto text-sm sm:text-base px-2">
              NoorHafiz uses AI to listen to your recitation, compare it against verified Quran text, and provide instant, gentle corrections.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-4 sm:gap-8">
            {[
              {
                icon: Mic,
                title: 'Recite',
                desc: 'Press record and recite the ayah you\'re memorizing. Our AI listens to every word.',
                color: 'bg-primary/10 text-primary',
              },
              {
                icon: BookOpen,
                title: 'Compare',
                desc: 'Your recitation is compared word-by-word against verified Hafs Quran text.',
                color: 'bg-gold/10 text-gold-dark',
              },
              {
                icon: BarChart3,
                title: 'Improve',
                desc: 'Get instant feedback with highlighted corrections. Track progress over time.',
                color: 'bg-primary/10 text-primary',
              },
            ].map((feat, i) => (
              <div key={i} className="bg-surface-card rounded-2xl sm:rounded-3xl p-6 sm:p-8 shadow-sm border border-surface-dark hover:shadow-md transition-smooth group">
                <div className={`w-14 h-14 rounded-2xl ${feat.color} flex items-center justify-center mb-6 group-hover:scale-110 transition-smooth`}>
                  <feat.icon className="w-7 h-7" />
                </div>
                <div className="text-sm font-bold text-gold-dark mb-2">Step {i + 1}</div>
                <h3 className="text-xl font-bold mb-3 text-text-primary">{feat.title}</h3>
                <p className="text-text-muted leading-relaxed">{feat.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Testimonial / Quote Section */}
      <section 
        className="py-14 sm:py-20 px-4 sm:px-6 pattern-overlay relative" 
        style={{ backgroundColor: '#0F4A32' }}
      >
        <div className="max-w-4xl mx-auto text-center relative z-10 px-2">
          <div className="arabic text-gold-light text-xl sm:text-3xl mb-6 sm:mb-8">
            «إِنَّا نَحْنُ نَزَّلْنَا الذِّكْرَ وَإِنَّا لَهُ لَحَافِظُونَ»
          </div>
          <p className="text-white/70 text-lg italic">
            "Indeed, it is We who sent down the Quran and indeed, it is We who are its guardian."
          </p>
          <p className="text-gold-dark mt-4 font-semibold">— Surah Al-Hijr 15:9</p>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-16 sm:py-24 px-4 sm:px-6">
        <div className="max-w-2xl mx-auto text-center px-2">
          <Star className="w-10 h-10 sm:w-12 sm:h-12 text-gold-dark mx-auto mb-4 sm:mb-6" />
          <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold mb-3 sm:mb-4 text-text-primary">
            Begin Your Hifz Journey Today
          </h2>
          <p className="text-text-muted mb-6 sm:mb-8 text-base sm:text-lg">
            Join thousands of kids mastering Quran memorization with a patient AI companion.
          </p>
          <button
            onClick={() => navigate('/signup')}
            className="bg-primary-dark text-white font-bold px-8 sm:px-10 py-3.5 sm:py-4 rounded-2xl text-base sm:text-lg hover:bg-primary transition-smooth shadow-lg shadow-primary/20"
          >
            Create Free Account
          </button>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 px-4 sm:px-6 border-t border-surface-dark">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-2">
            <Moon className="w-5 h-5 text-primary" />
            <span className="font-semibold text-text-secondary">NoorHafiz</span>
          </div>
          <p className="text-text-muted text-sm">Built with ❤️ for the Ummah — © 2026 NoorHafiz</p>
        </div>
      </footer>
    </div>
  )
}
