import { useNavigate } from 'react-router-dom'
import { Moon, ArrowLeft, BookOpen, Mic, Shield, Heart, Users, Brain, Globe, ChevronRight } from 'lucide-react'

export default function About() {
  const navigate = useNavigate()

  return (
    <div className="min-h-screen">
      {/* Nav */}
      <nav className="p-6 flex justify-between items-center bg-surface-card border-b border-surface-dark">
        <div className="flex items-center gap-3 cursor-pointer" onClick={() => navigate('/')}>
          <div className="w-10 h-10 rounded-xl gradient-gold flex items-center justify-center">
            <Moon className="w-5 h-5 text-primary-dark" />
          </div>
          <span className="font-semibold text-xl text-text-primary">NoorHafiz</span>
        </div>
        <button onClick={() => navigate('/')} className="flex items-center gap-2 text-text-muted hover:text-text-primary transition-smooth text-sm">
          <ArrowLeft className="w-4 h-4" />
          Back
        </button>
      </nav>

      {/* Hero */}
      <section className="py-20 px-6 bg-surface">
        <div className="max-w-4xl mx-auto text-center">
          <span className="text-primary font-semibold text-sm tracking-widest uppercase">About NoorHafiz</span>
          <h1 className="text-4xl md:text-5xl font-bold text-text-primary mt-3 mb-6">
            AI That Respects the <span className="text-primary">Quran</span>
          </h1>
          <p className="text-text-muted text-lg max-w-2xl mx-auto leading-relaxed">
            NoorHafiz is an AI-powered Quran memorization companion. It listens to your recitation, 
            compares it word-by-word against verified Hafs text from quran.com, and provides gentle, 
            accurate corrections — so every Muslim can learn hifz with confidence.
          </p>
        </div>
      </section>

      {/* Why NoorHafiz */}
      <section className="py-16 px-6">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-3xl font-bold text-center mb-12">Why NoorHafiz?</h2>
          <div className="grid md:grid-cols-2 gap-8">
            {[
              {
                icon: BookOpen,
                title: 'Verified Quran Text',
                desc: 'Every word is fetched from quran-mcp — canonical Hafs text sourced directly from quran.com. Zero hallucination, zero fabrication.',
              },
              {
                icon: Mic,
                title: 'Voice-First for Kids',
                desc: 'Built around voice interaction. Kids press record, recite, and get instant feedback. No typing, no complicated UI.',
              },
              {
                icon: Brain,
                title: 'Smart Diff Engine',
                desc: 'AI transcribes recitation via Whisper, then performs word-by-word comparison. Flags missing words, extra words, and mispronunciations.',
              },
              {
                icon: Heart,
                title: 'Gentle Corrections',
                desc: 'Feedback is designed for young learners. "Almost there! You missed one word — try again." Not red marks, encouragement.',
              },
              {
                icon: Users,
                title: 'Parent Dashboard',
                desc: 'Parents see real progress: which ayahs are mastered, where the child struggles, streak counts, and weekly summaries.',
              },
              {
                icon: Shield,
                title: 'Privacy First',
                desc: 'Voice recordings are processed and discarded. No data stored beyond progress metrics. Kids\' voices are never saved or shared.',
              },
            ].map((item, i) => (
              <div key={i} className="flex gap-5 bg-surface-card p-6 rounded-2xl border border-surface-dark">
                <div className="w-12 h-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                  <item.icon className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="font-bold text-lg mb-2">{item.title}</h3>
                  <p className="text-text-muted leading-relaxed text-sm">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Technology */}
      <section className="py-16 px-6 bg-primary-dark pattern-overlay relative">
        <div className="max-w-4xl mx-auto relative z-10">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-white mb-3">Powered By</h2>
            <p className="text-white/60">Open source tools, trusted data</p>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            {[
              { name: 'quran-mcp', desc: 'Verified Quran text' },
              { name: 'Whisper', desc: 'Speech recognition' },
              { name: 'OpenClaw', desc: 'AI agent platform' },
              { name: 'Gemini', desc: 'Smart feedback' },
            ].map((tech) => (
              <div key={tech.name} className="glass rounded-2xl p-5 text-center">
                <Globe className="w-8 h-8 text-gold-light mx-auto mb-3" />
                <div className="text-white font-bold text-sm">{tech.name}</div>
                <div className="text-white/50 text-xs mt-1">{tech.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 px-6">
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="text-3xl font-bold mb-4">Ready to Start Memorizing?</h2>
          <p className="text-text-muted mb-8">Create a free account and begin your hifz journey today.</p>
          <button
            onClick={() => navigate('/signup')}
            className="bg-primary text-white font-bold px-8 py-4 rounded-2xl text-lg hover:bg-primary-light transition-smooth inline-flex items-center gap-2"
          >
            Get Started <ChevronRight className="w-5 h-5" />
          </button>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 px-6 border-t border-surface-dark">
        <div className="max-w-6xl mx-auto text-center">
          <p className="text-text-muted text-sm">Built with ❤️ for the Ummah — © 2026 NoorHafiz</p>
        </div>
      </footer>
    </div>
  )
}
