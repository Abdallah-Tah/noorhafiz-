import { useState } from 'react'
import { Search, ChevronLeft, ChevronRight, CheckCircle2 } from 'lucide-react'
import { searchSurahs, type Surah } from '../lib/surahs'

interface SurahPickerProps {
  onSelect: (surah: number, ayah: number) => void
  currentSurah?: number
  currentAyah?: number
}

const PAGE_SIZE = 12

export default function SurahPicker({ onSelect, currentSurah, currentAyah }: SurahPickerProps) {
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(0)
  const [expandedSurah, setExpandedSurah] = useState<number | null>(null)

  const filtered = searchSurahs(search)
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE)
  const pageSurahs = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

  function handleSelect(surah: Surah) {
    if (expandedSurah === surah.number) {
      // Already expanded — select ayah 1
      onSelect(surah.number, currentSurah === surah.number ? (currentAyah || 1) : 1)
      setExpandedSurah(null)
    } else {
      setExpandedSurah(surah.number)
    }
  }

  function handleAyahSelect(surah: number, ayah: number) {
    onSelect(surah, ayah)
    setExpandedSurah(null)
    setSearch('')
    setPage(0)
  }

  return (
    <div className="bg-surface-card rounded-2xl p-4 sm:p-6 border border-surface-dark">
      <h3 className="font-bold text-lg mb-4 text-text-primary">Select a Surah</h3>

      {/* Search */}
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
        <input
          type="text"
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(0) }}
          placeholder="Search surah name or number..."
          className="w-full pl-10 pr-4 py-3 rounded-xl border border-surface-dark bg-surface text-text-primary placeholder:text-text-muted/50 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-smooth text-sm"
        />
      </div>

      {/* Surah grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-4">
        {pageSurahs.map(surah => (
          <div key={surah.number}>
            <button
              onClick={() => handleSelect(surah)}
              className={`w-full flex items-center justify-between p-3 rounded-xl border transition-smooth text-left ${
                currentSurah === surah.number
                  ? 'border-primary bg-primary/5'
                  : 'border-surface-dark hover:border-primary/30 hover:bg-primary/5'
              }`}
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center text-xs font-bold">
                  {surah.number}
                </div>
                <div>
                  <div className="font-semibold text-sm text-text-primary">{surah.name}</div>
                  <div className="text-xs text-text-muted">{surah.arabic} · {surah.ayahs} ayat</div>
                </div>
              </div>
              {currentSurah === surah.number && (
                <CheckCircle2 className="w-4 h-4 text-primary shrink-0" />
              )}
            </button>

            {/* Ayah picker when expanded */}
            {expandedSurah === surah.number && (
              <div className="mt-1 p-3 bg-surface rounded-xl border border-surface-dark">
                <p className="text-xs text-text-muted mb-2">Select starting ayah:</p>
                <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto">
                  {Array.from({ length: surah.ayahs }, (_, i) => i + 1).map(ayah => (
                    <button
                      key={ayah}
                      onClick={() => handleAyahSelect(surah.number, ayah)}
                      className={`w-9 h-9 rounded-lg text-xs font-medium transition-smooth ${
                        currentSurah === surah.number && currentAyah === ayah
                          ? 'bg-primary text-white'
                          : 'bg-surface-card border border-surface-dark text-text-primary hover:border-primary/30'
                      }`}
                    >
                      {ayah}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Pagination */}
      {!search && (
        <div className="flex items-center justify-between">
          <button
            onClick={() => setPage(Math.max(0, page - 1))}
            disabled={page === 0}
            className="flex items-center gap-1 px-3 py-2 rounded-lg text-sm font-medium text-text-muted hover:text-text-primary disabled:opacity-30 transition-smooth"
          >
            <ChevronLeft className="w-4 h-4" /> Prev
          </button>
          <span className="text-sm text-text-muted">
            {page + 1} / {totalPages}
          </span>
          <button
            onClick={() => setPage(Math.min(totalPages - 1, page + 1))}
            disabled={page >= totalPages - 1}
            className="flex items-center gap-1 px-3 py-2 rounded-lg text-sm font-medium text-text-muted hover:text-text-primary disabled:opacity-30 transition-smooth"
          >
            Next <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  )
}
