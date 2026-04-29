import { useState, useEffect, useRef, useCallback } from 'react'
import {
  ArrowLeft, Search, ChevronLeft, ChevronRight,
  Play, Bookmark, BookmarkCheck, BookOpen,
  Mic,
} from 'lucide-react'
import { searchSurahs, type Surah, SURAHS } from '../lib/surahs'
import { getAyahText, getAyahAudioUrl, playAudio } from '../lib/quran'

// ── Types ──

interface BookmarkEntry {
  surah: number
  ayah: number
  label: string
}

interface QuranReaderProps {
  selectedChild?: { current_surah: number; current_ayah: number }
  setCurrentPracticeAyah: (surah: number, ayah: number, childId?: number) => Promise<void>
  setActiveTab: (tab: 'practice' | 'progress' | 'quran' | 'settings') => void
}

const PAGE_SIZE = 20
const AYAHS_PER_PAGE = 20

// ── Bookmark helpers ──

function loadBookmarks(): BookmarkEntry[] {
  try {
    return JSON.parse(localStorage.getItem('nh-bookmarked-ayahs') || '[]')
  } catch { return [] }
}

function saveBookmarks(b: BookmarkEntry[]) {
  localStorage.setItem('nh-bookmarked-ayahs', JSON.stringify(b))
}

function toggleBookmark(bm: BookmarkEntry) {
  const current = loadBookmarks()
  const exists = current.find(b => b.surah === bm.surah && b.ayah === bm.ayah)
  const next = exists
    ? current.filter(b => !(b.surah === bm.surah && b.ayah === bm.ayah))
    : [bm, ...current]
  saveBookmarks(next)
  return next
}

// ── Component ──

export default function QuranReader({ selectedChild, setCurrentPracticeAyah, setActiveTab }: QuranReaderProps) {
  // View state
  const [view, setView] = useState<'list' | 'reader'>('list')
  const [selectedSurah, setSelectedSurah] = useState<number | null>(null)

  // List state
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(0)
  const [section, setSection] = useState<'all' | 'continue' | 'bookmarks' | 'juz_amma' | 'short'>('all')

  // Reader state
  const [ayahTexts, setAyahTexts] = useState<Map<string, string>>(new Map())
  const ayahTextsRef = useRef<Map<string, string>>(new Map())
  const [ayahPage, setAyahPage] = useState(0)
  const [loadingAyahs, setLoadingAyahs] = useState(false)
  const [playingAyah, setPlayingAyah] = useState<string | null>(null)

  // Practice confirm dialog
  const [practiceTarget, setPracticeTarget] = useState<{ surah: number; ayah: number } | null>(null)

  // Bookmarks
  const [bookmarks, setBookmarks] = useState<BookmarkEntry[]>(loadBookmarks)

  // Ref to track active status
  const mountedRef = useRef(true)
  useEffect(() => { return () => { mountedRef.current = false } }, [])

  // ── Surah list ──

  const filtered = searchSurahs(search)

  // Section filters
  function getSectionSurahs(): Surah[] {
    switch (section) {
      case 'continue':
        if (!selectedChild) return []
        return SURAHS.filter(s => s.number === selectedChild.current_surah)
      case 'juz_amma':
        return SURAHS.filter(s => s.number >= 78 && s.number <= 114)
      case 'short':
        return SURAHS.filter(s => s.number >= 108 && s.number <= 114)
      case 'bookmarks':
        return [] // handled separately
      default:
        return filtered
    }
  }

  const displaySurahs = getSectionSurahs()
  const totalPages = Math.ceil(displaySurahs.length / PAGE_SIZE)
  const pageSurahs = displaySurahs.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

  // Reset page when section/search changes
  useEffect(() => { setPage(0) }, [section, search])

  // ── Open reader ──

  function openSurah(surah: Surah) {
    setSelectedSurah(surah.number)
    setView('reader')
    setAyahPage(0)
    setAyahTexts(new Map())
    ayahTextsRef.current = new Map()
    loadAyahPage(surah.number, 0)
  }

  // ── Load ayah texts ──

  const loadAyahPage = useCallback(async (surah: number, pageNum: number) => {
    setLoadingAyahs(true)
    const start = pageNum * AYAHS_PER_PAGE + 1
    const surahData = SURAHS.find(s => s.number === surah)
    const end = Math.min(start + AYAHS_PER_PAGE - 1, surahData?.ayahs ?? 1)

    const current = ayahTextsRef.current
    const newTexts = new Map(current)
    for (let ayah = start; ayah <= end; ayah++) {
      const key = `${surah}-${ayah}`
      if (newTexts.has(key)) continue
      try {
        const text = await getAyahText(surah, ayah)
        newTexts.set(key, text)
      } catch {
        newTexts.set(key, '')
      }
    }
    if (mountedRef.current) {
      ayahTextsRef.current = newTexts
      setAyahTexts(new Map(newTexts))
      setAyahPage(pageNum)
      setLoadingAyahs(false)
    }
  }, [])

  function loadMoreAyahs() {
    if (!selectedSurah) return
    loadAyahPage(selectedSurah, ayahPage + 1)
  }

  // ── Play ayah ──

  async function handlePlayAyah(surah: number, ayah: number) {
    const key = `${surah}-${ayah}`
    setPlayingAyah(key)
    try {
      const url = getAyahAudioUrl(surah, ayah)
      await playAudio(url)
    } finally {
      setPlayingAyah(null)
    }
  }

  // ── Bookmark toggle ──

  function handleToggleBookmark(surah: number, ayah: number) {
    const surahData = SURAHS.find(s => s.number === surah)
    const label = `${surahData?.name || `Surah ${surah}`} ${ayah}`
    const next = toggleBookmark({ surah, ayah, label })
    setBookmarks(next)
  }

  function isBookmarked(surah: number, ayah: number): boolean {
    return bookmarks.some(b => b.surah === surah && b.ayah === ayah)
  }

  // ── Practice this ayah ──

  function handlePracticeAyah(surah: number, ayah: number) {
    setPracticeTarget({ surah, ayah })
  }

  async function confirmPractice() {
    if (!practiceTarget) return
    const childId = selectedChild ? undefined : undefined
    // selectedChild.id would be needed but we don't have it here
    // We pass what we have — the Dashboard handles the rest
    await setCurrentPracticeAyah(practiceTarget.surah, practiceTarget.ayah)
    setPracticeTarget(null)
    setActiveTab('practice')
  }

  function cancelPractice() {
    setPracticeTarget(null)
  }

  // ── Back to list ──

  function backToList() {
    setView('list')
    setSelectedSurah(null)
  }

  // ── Section helpers ──

  const surahData = selectedSurah ? SURAHS.find(s => s.number === selectedSurah) : null
  const totalAyahs = surahData?.ayahs ?? 0
  const loadedCount = ayahPage * AYAHS_PER_PAGE + AYAHS_PER_PAGE
  const hasMore = loadedCount < totalAyahs

  // ═══════════════════════════════════════════
  //  LIST VIEW
  // ═══════════════════════════════════════════

  if (view === 'list') {
    return (
      <div className="w-full max-w-[480px] mx-auto px-4 sm:px-0">
        {/* Section chips */}
        <div className="flex items-center gap-2 mb-4 overflow-x-auto no-scrollbar pb-1">
          {selectedChild && (
            <button
              onClick={() => { setSection('continue'); setSearch(''); setPage(0) }}
              className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition-smooth ${
                section === 'continue'
                  ? 'bg-primary text-white'
                  : 'bg-surface-card border border-surface-dark text-text-muted hover:text-text-primary'
              }`}
            >
              Continue Reading
            </button>
          )}
          {bookmarks.length > 0 && (
            <button
              onClick={() => { setSection('bookmarks'); setSearch(''); setPage(0) }}
              className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition-smooth ${
                section === 'bookmarks'
                  ? 'bg-primary text-white'
                  : 'bg-surface-card border border-surface-dark text-text-muted hover:text-text-primary'
              }`}
            >
              Bookmarked
            </button>
          )}
          <button
            onClick={() => { setSection('juz_amma'); setSearch(''); setPage(0) }}
            className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition-smooth ${
              section === 'juz_amma'
                ? 'bg-primary text-white'
                : 'bg-surface-card border border-surface-dark text-text-muted hover:text-text-primary'
            }`}
          >
            Juz Amma
          </button>
          <button
            onClick={() => { setSection('short'); setSearch(''); setPage(0) }}
            className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition-smooth ${
              section === 'short'
                ? 'bg-primary text-white'
                : 'bg-surface-card border border-surface-dark text-text-muted hover:text-text-primary'
            }`}
          >
            Short Surahs
          </button>
          {section !== 'all' && (
            <button
              onClick={() => { setSection('all'); setSearch(''); setPage(0) }}
              className="shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold bg-surface-card border border-surface-dark text-text-muted hover:text-text-primary transition-smooth"
            >
              All Surahs
            </button>
          )}
        </div>

        {/* Bookmarks section */}
        {section === 'bookmarks' && (
          <div className="bg-surface-card rounded-2xl border border-surface-dark/50 divide-y divide-surface-dark/40 mb-6">
            {bookmarks.length === 0 ? (
              <div className="px-4 py-8 text-center">
                <Bookmark className="w-8 h-8 text-text-muted/40 mx-auto mb-2" />
                <p className="text-sm text-text-muted">No bookmarks yet</p>
                <p className="text-xs text-text-muted/60 mt-1">Bookmark ayahs while reading to see them here</p>
              </div>
            ) : (
              bookmarks.map((bm, i) => (
                <button
                  key={`${bm.surah}-${bm.ayah}-${i}`}
                  onClick={() => {
                    const s = SURAHS.find(s => s.number === bm.surah)
                    if (s) openSurah(s)
                  }}
                  className="w-full flex items-center justify-between gap-3 px-4 py-3 hover:bg-surface transition-smooth active:bg-surface-dark/40 text-left"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center text-xs font-bold shrink-0">
                      {bm.surah}
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm text-text-primary font-medium truncate">{bm.label}</div>
                      <div className="text-xs text-text-muted">Ayah {bm.ayah}</div>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-text-muted/40 shrink-0" />
                </button>
              ))
            )}
          </div>
        )}

        {/* Search (only for 'all' section) */}
        {section === 'all' && (
          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search surah name or number..."
              className="w-full pl-10 pr-4 py-3 rounded-xl border border-surface-dark bg-surface-card text-text-primary placeholder:text-text-muted/50 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-smooth text-sm"
            />
          </div>
        )}

        {/* Surah grid */}
        {pageSurahs.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-4">
            {pageSurahs.map(surah => (
              <button
                key={surah.number}
                onClick={() => openSurah(surah)}
                className={`w-full flex items-center justify-between p-3 rounded-xl border transition-smooth text-left ${
                  selectedChild?.current_surah === surah.number
                    ? 'border-primary bg-primary/5'
                    : 'border-surface-dark hover:border-primary/30 hover:bg-primary/5'
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center text-xs font-bold shrink-0">
                    {surah.number}
                  </div>
                  <div className="min-w-0">
                    <div className="font-semibold text-sm text-text-primary truncate">{surah.name}</div>
                    <div className="text-xs text-text-muted truncate">{surah.arabic} · {surah.ayahs} ayat</div>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-text-muted/30 shrink-0 ml-2" />
              </button>
            ))}
          </div>
        )}

        {/* Empty state */}
        {pageSurahs.length === 0 && section !== 'bookmarks' && (
          <div className="text-center py-12">
            <Search className="w-8 h-8 text-text-muted/40 mx-auto mb-2" />
            <p className="text-sm text-text-muted">No surahs found</p>
          </div>
        )}

        {/* Pagination */}
        {!search && totalPages > 1 && (
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

  // ═══════════════════════════════════════════
  //  READER VIEW
  // ═══════════════════════════════════════════

  return (
    <div className="w-full max-w-[480px] mx-auto px-4 sm:px-0">

      {/* Practice confirm dialog */}
      {practiceTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={cancelPractice} />
          <div className="relative bg-surface-card rounded-2xl p-6 w-full max-w-sm shadow-xl animate-slide-up">
            <h3 className="text-lg font-bold text-text-primary mb-2">Start practice from this ayah?</h3>
            <p className="text-sm text-text-muted mb-6">
              This will update your current lesson position. Your assigned Study Plan stays unchanged.
            </p>
            <div className="flex gap-3">
              <button
                onClick={cancelPractice}
                className="flex-1 py-3 rounded-xl border border-surface-dark text-text-primary font-medium text-sm hover:bg-surface transition-smooth"
              >
                Cancel
              </button>
              <button
                onClick={confirmPractice}
                className="flex-1 py-3 rounded-xl bg-primary text-white font-medium text-sm hover:bg-primary-dark active:scale-[0.98] transition-smooth"
              >
                Start Practice
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reader header */}
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={backToList}
          className="w-10 h-10 rounded-xl bg-surface-card border border-surface-dark flex items-center justify-center text-text-primary hover:bg-surface transition-smooth active:scale-95 shrink-0"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="min-w-0">
          <h2 className="text-lg font-bold text-text-primary truncate">
            {surahData?.name || `Surah ${selectedSurah}`}
          </h2>
          <p className="text-sm text-text-muted truncate">
            {surahData?.arabic || ''} · {totalAyahs} ayat · {surahData?.revelation || ''}
          </p>
        </div>
      </div>

      {/* Ayah cards */}
      <div className="space-y-3">
        {Array.from({ length: Math.min(loadedCount, totalAyahs) }, (_, i) => {
          const ayahNum = i + 1
          const key = `${selectedSurah}-${ayahNum}`
          const text = ayahTexts.get(key)
          const isPlaying = playingAyah === key
          const bookmarked = isBookmarked(selectedSurah!, ayahNum)

          return (
            <div
              key={ayahNum}
              className="bg-surface-card rounded-2xl border border-surface-dark/50 overflow-hidden"
            >
              {/* Ayah number badge */}
              <div className="flex items-center gap-2 px-4 pt-4 pb-2">
                <div className="w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold">
                  {ayahNum}
                </div>
                <span className="text-xs text-text-muted font-medium">Ayah {ayahNum}</span>
              </div>

              {/* Arabic text */}
              {text !== undefined ? (
                <p className="arabic text-xl sm:text-2xl text-text-primary px-4 pb-4 text-right leading-[2.2]" dir="rtl">
                  {text || '(ayah text unavailable)'}
                </p>
              ) : (
                <div className="px-4 pb-4">
                  <div className="h-24 bg-surface rounded-xl animate-pulse" />
                </div>
              )}

              {/* Actions */}
              <div className="flex items-center divide-x divide-surface-dark/50 border-t border-surface-dark/50">
                {/* Play */}
                <button
                  onClick={() => handlePlayAyah(selectedSurah!, ayahNum)}
                  disabled={isPlaying}
                  className="flex-1 flex items-center justify-center gap-1.5 py-3 text-text-primary hover:bg-surface transition-smooth active:bg-surface-dark/40 disabled:opacity-50"
                >
                  {isPlaying ? (
                    <>
                      <div className="w-3 h-3 rounded-full border-2 border-primary border-t-transparent animate-spin" />
                      <span className="text-xs font-medium">Playing…</span>
                    </>
                  ) : (
                    <>
                      <Play className="w-4 h-4" />
                      <span className="text-xs font-medium">Play</span>
                    </>
                  )}
                </button>

                {/* Bookmark */}
                <button
                  onClick={() => handleToggleBookmark(selectedSurah!, ayahNum)}
                  className="flex-1 flex items-center justify-center gap-1.5 py-3 text-text-primary hover:bg-surface transition-smooth active:bg-surface-dark/40"
                >
                  {bookmarked ? (
                    <>
                      <BookmarkCheck className="w-4 h-4 text-primary" />
                      <span className="text-xs font-medium text-primary">Saved</span>
                    </>
                  ) : (
                    <>
                      <Bookmark className="w-4 h-4" />
                      <span className="text-xs font-medium">Bookmark</span>
                    </>
                  )}
                </button>

                {/* Practice */}
                <button
                  onClick={() => handlePracticeAyah(selectedSurah!, ayahNum)}
                  className="flex-1 flex items-center justify-center gap-1.5 py-3 text-text-primary hover:bg-surface transition-smooth active:bg-surface-dark/40"
                >
                  <Mic className="w-4 h-4" />
                  <span className="text-xs font-medium">Practice</span>
                </button>
              </div>
            </div>
          )
        })}
      </div>

      {/* Loading skeletons */}
      {loadingAyahs && (
        <div className="space-y-3 mt-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="bg-surface-card rounded-2xl border border-surface-dark/50 p-4">
              <div className="h-24 bg-surface rounded-xl animate-pulse" />
            </div>
          ))}
        </div>
      )}

      {/* Load more */}
      {hasMore && !loadingAyahs && (
        <button
          onClick={loadMoreAyahs}
          className="w-full mt-4 py-3 rounded-xl border border-surface-dark text-text-muted text-sm font-medium hover:bg-surface hover:text-text-primary transition-smooth"
        >
          Show {Math.min(AYAHS_PER_PAGE, totalAyahs - loadedCount)} more ayahs
        </button>
      )}

      {/* No more ayahs */}
      {!hasMore && !loadingAyahs && totalAyahs > 0 && (
        <p className="text-center text-xs text-text-muted/60 mt-6 pb-4">
          End of {surahData?.name || 'surah'} · {totalAyahs} ayahs
        </p>
      )}
    </div>
  )
}
