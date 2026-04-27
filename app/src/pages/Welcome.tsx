import { useNavigate } from 'react-router-dom'
import { BookOpen, Mic, BarChart3, Star, ChevronRight, Moon } from 'lucide-react'

export default function Welcome() {
  const navigate = useNavigate()

  return (
    <div className="min-h-screen">
      {/* Hero Section */}
      <section className="relative min-h-screen gradient-hero pattern-overlay flex items-center overflow-hidden">
        {/* Floating decorative elements */}
        <div className="absolute top-20 right-10 w-20 h-20 rounded-full bg-white/10 animate-float" />
        <div className="absolute bottom-32 left-10 w-14 h-14 rounded-full bg-gold/20 animate-float" style={{ animationDelay: '1s' }} />
        <div className="absolute top-40 left-1/4 w-8 h-8 rounded-full bg-white/5 animate-float" style={{ animationDelay: '2s' }} />

        {/* Nav */}
        <nav className="absolute top-0 left-0 right-0 p-6 flex justify-between items-center z-10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl gradient-gold flex items-center justify-center">
              <Moon className="w-5 h-5 text-primary-dark" />
            </div>
            <span className="text-white font-semibold text-xl tracking-wide">NoorHafiz</span>
          </div>
          <div className="flex items-center gap-4">
            <button onClick={() => navigate('/about')} className="text-white/80 hover:text-white text-sm font-medium transition-smooth">
              About
            </button>
            <button onClick={() => navigate('/login')} className="text-white/80 hover:text-white text-sm font-medium transition-smooth">
              Log In
            </button>
            <button onClick={() => navigate('/signup')} className="bg-white text-primary font-semibold px-5 py-2 rounded-xl text-sm hover:bg-white/90 transition-smooth">
              Get Started
            </button>
          </div>
        </nav>

        {/* Hero Content */}
        <div className="max-w-6xl mx-auto px-6 pt-24 pb-12 text-center relative z-10">
          {/* Arabic bismillah */}
          <p className="arabic text-white/60 text-2xl mb-6">بِسْمِ اللَّهِ الرَّحْمَنِ الرَّحِيمِ</p>

          <h1 className="text-5xl md:text-7xl font-bold text-white mb-6 leading-tight">
            Master Your <br />
            <span className="text-gold-light">Quran Memorization</span>
          </h1>

          <p className="text-white/70 text-lg md:text-xl max-w-2xl mx-auto mb-10 leading-relaxed">
            An AI-powered companion that listens, corrects, and guides your hifz journey.
            Built for kids, loved by parents.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <button
              onClick={() => navigate('/signup')}
              className="bg-gold text-primary-dark font-bold px-8 py-4 rounded-2xl text-lg hover:bg-gold-light transition-smooth flex items-center justify-center gap-2 shadow-lg shadow-gold/30"
            >
              Start Learning Free
              <ChevronRight className="w-5 h-5" />
            </button>
            <button
              onClick={() => navigate('/about')}
              className="glass text-white font-semibold px-8 py-4 rounded-2xl text-lg hover:bg-white/20 transition-smooth"
            >
              See How It Works
            </button>
          </div>

          {/* Stats bar */}
          <div className="mt-16 flex flex-wrap justify-center gap-8 md:gap-16">
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

        {/* Wave divider */}
        <div className="absolute bottom-0 left-0 right-0">
          <svg viewBox="0 0 1440 120" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M0 120L48 108C96 96 192 72 288 66C384 60 480 72 576 78C672 84 768 84 864 78C960 72 1056 60 1152 60C1248 60 1344 72 1392 78L1440 84V120H1392C1344 120 1248 120 1152 120C1056 120 960 120 864 120C768 120 672 120 576 120C480 120 384 120 288 120C192 120 96 120 48 120H0Z" fill="var(--color-surface)"/>
          </svg>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-24 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <span className="text-primary font-semibold text-sm tracking-widest uppercase">How It Works</span>
            <h2 className="text-4xl font-bold text-text-primary mt-3 mb-4">
              Three Steps to Hifz Mastery
            </h2>
            <p className="text-text-muted max-w-xl mx-auto">
              NoorHafiz uses AI to listen to your recitation, compare it against verified Quran text, and provide instant, gentle corrections.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
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
              <div key={i} className="bg-surface-card rounded-3xl p-8 shadow-sm border border-surface-dark hover:shadow-md transition-smooth group">
                <div className={`w-14 h-14 rounded-2xl ${feat.color} flex items-center justify-center mb-6 group-hover:scale-110 transition-smooth`}>
                  <feat.icon className="w-7 h-7" />
                </div>
                <div className="text-sm font-bold text-gold mb-2">Step {i + 1}</div>
                <h3 className="text-xl font-bold mb-3">{feat.title}</h3>
                <p className="text-text-muted leading-relaxed">{feat.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Testimonial / Quote Section */}
      <section className="py-20 px-6 bg-primary-dark pattern-overlay relative">
        <div className="max-w-4xl mx-auto text-center relative z-10">
          <div className="arabic text-gold-light text-3xl mb-8">
            «إِنَّا نَحْنُ نَزَّلْنَا الذِّكْرَ وَإِنَّا لَهُ لَحَافِظُونَ»
          </div>
          <p className="text-white/70 text-lg italic">
            "Indeed, it is We who sent down the Quran and indeed, it is We who are its guardian."
          </p>
          <p className="text-gold mt-4 font-semibold">— Surah Al-Hijr 15:9</p>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-24 px-6">
        <div className="max-w-2xl mx-auto text-center">
          <Star className="w-12 h-12 text-gold mx-auto mb-6" />
          <h2 className="text-3xl md:text-4xl font-bold mb-4">
            Begin Your Hifz Journey Today
          </h2>
          <p className="text-text-muted mb-8 text-lg">
            Join thousands of kids mastering Quran memorization with a patient AI companion.
          </p>
          <button
            onClick={() => navigate('/signup')}
            className="bg-primary text-white font-bold px-10 py-4 rounded-2xl text-lg hover:bg-primary-light transition-smooth shadow-lg shadow-primary/20"
          >
            Create Free Account
          </button>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 px-6 border-t border-surface-dark">
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
