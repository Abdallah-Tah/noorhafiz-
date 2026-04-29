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
  selectedChild?: { id: number; current_surah: number; current_ayah: number }
  setCurrentPracticeAyah: (surah: number, ayah: number, childId?: number) => Promise<void>
  setActiveTab: (tab: 'practice' | 'progress' | 'quran' | 'settings') => void
}

const PAGE_SIZE = 20
const AYAHS_PER_PAGE = 4

// ── Bookmark helpers (single bookmark per child) ──

function bookmarkKey(childId: number) {
  return `nh-bookmark-child-${childId}`
}

function loadBookmark(childId: number): BookmarkEntry | null {
  try {
    const raw = localStorage.getItem(bookmarkKey(childId))
    return raw ? JSON.parse(raw) : null
  } catch { return null }
}

function saveBookmark(childId: number, bm: BookmarkEntry | null) {
  if (bm) {
    localStorage.setItem(bookmarkKey(childId), JSON.stringify(bm))
  } else {
    localStorage.removeItem(bookmarkKey(childId))
  }
}

function toggleSingleBookmark(childId: number, bm: BookmarkEntry): BookmarkEntry | null {
  const current = loadBookmark(childId)
  // If same ayah already bookmarked, remove it
  if (current && current.surah === bm.surah && current.ayah === bm.ayah) {
    saveBookmark(childId, null)
    return null
  }
  // Otherwise replace with new bookmark
  saveBookmark(childId, bm)
  return bm
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
  const [readerPage, setReaderPage] = useState(0)
  const [loadingAyahs, setLoadingAyahs] = useState(false)
  const [playingAyah, setPlayingAyah] = useState<string | null>(null)

  // Practice confirm dialog
  const [practiceTarget, setPracticeTarget] = useState<{ surah: number; ayah: number } | null>(null)

  // Bookmarks (single per child)
  const childId = selectedChild?.id
  const [bookmark, setBookmark] = useState<BookmarkEntry | null>(() => 
    childId ? loadBookmark(childId) : null
  )

  // Re-load bookmark when child changes
  useEffect(() => {
    setBookmark(childId ? loadBookmark(childId) : null)
  }, [childId])

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

  function openSurah(surah: Surah, startPage = 0) {
    setSelectedSurah(surah.number)
    setView('reader')
    setReaderPage(startPage)
    setAyahTexts(new Map())
    ayahTextsRef.current = new Map()
    loadAyahPage(surah.number, startPage)
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
      setReaderPage(pageNum)
      setLoadingAyahs(false)
    }
  }, [])

  function goToReaderPage(pageNum: number) {
    if (!selectedSurah) return
    loadAyahPage(selectedSurah, pageNum)
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
    if (!childId) return
    const surahData = SURAHS.find(s => s.number === surah)
    const label = `${surahData?.name || `Surah ${surah}`} ${ayah}`
    const next = toggleSingleBookmark(childId, { surah, ayah, label })
    setBookmark(next)
  }

  function isBookmarked(surah: number, ayah: number): boolean {
    return bookmark?.surah === surah && bookmark?.ayah === ayah
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
  const totalReaderPages = Math.ceil(totalAyahs / AYAHS_PER_PAGE)
  const pageStart = readerPage * AYAHS_PER_PAGE + 1
  const pageEnd = Math.min(pageStart + AYAHS_PER_PAGE - 1, totalAyahs)

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
          {bookmark && (
            <button
              onClick={() => { setSection('bookmarks'); setSearch(''); setPage(0) }}
              className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition-smooth ${
                section === 'bookmarks'
                  ? 'bg-primary text-white'
                  : 'bg-surface-card border border-surface-dark text-text-muted hover:text-text-primary'
              }`}
            >
              Saved Ayah
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
          <div className="bg-surface-card rounded-2xl border border-surface-dark/50 mb-6">
            {!bookmark ? (
              <div className="px-4 py-8 text-center">
                <Bookmark className="w-8 h-8 text-text-muted/40 mx-auto mb-2" />
                <p className="text-sm text-text-muted">No saved ayah</p>
                <p className="text-xs text-text-muted/60 mt-1">Bookmark ayahs while reading to save your spot</p>
              </div>
            ) : (
              <button
                onClick={() => {
                  const s = SURAHS.find(s => s.number === bookmark.surah)
                  if (!s) return
                  const targetPage = Math.floor((bookmark.ayah - 1) / AYAHS_PER_PAGE)
                  openSurah(s, targetPage)
                }}
                className="w-full flex items-center justify-between gap-3 px-4 py-3 hover:bg-surface transition-smooth active:bg-surface-dark/40 text-left"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center text-xs font-bold shrink-0">
                    {bookmark.surah}
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm text-text-primary font-medium truncate">{bookmark.label}</div>
                    <div className="text-xs text-text-muted">Ayah {bookmark.ayah}</div>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-text-muted/40 shrink-0" />
              </button>
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
        {loadingAyahs ? (
          Array.from({ length: AYAHS_PER_PAGE }).map((_, i) => (
            <div key={`skel-${i}`} className="bg-surface-card rounded-2xl border border-surface-dark/50 p-4">
              <div className="h-24 bg-surface rounded-xl animate-pulse" />
            </div>
          ))
        ) : (
          Array.from({ length: pageEnd - pageStart + 1 }, (_, i) => {
            const ayahNum = pageStart + i
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
                {text ? (
                  <p className="arabic text-xl sm:text-2xl text-text-primary px-4 pb-4 text-right leading-[2.2]" dir="rtl">
                    {text}
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
          })
        )}
      </div>

      {/* Page navigation */}
      {!loadingAyahs && totalReaderPages > 1 && (
        <div className="flex items-center justify-between mt-5 mb-4">
          <button
            onClick={() => goToReaderPage(readerPage - 1)}
            disabled={readerPage === 0}
            className="px-3 py-2 rounded-lg text-sm font-medium text-text-muted hover:text-text-primary disabled:opacity-25 transition-smooth flex items-center gap-1"
          >
            <ChevronLeft className="w-4 h-4" />
            Previous
          </button>

          <span className="text-xs text-text-muted tabular-nums">
            Page {readerPage + 1} of {totalReaderPages}
          </span>

          <button
            onClick={() => goToReaderPage(readerPage + 1)}
            disabled={readerPage >= totalReaderPages - 1}
            className="px-3 py-2 rounded-lg text-sm font-medium text-text-muted hover:text-text-primary disabled:opacity-25 transition-smooth flex items-center gap-1"
          >
            Next
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* End of surah */}
      {!loadingAyahs && totalAyahs > 0 && (
        <p className="text-center text-xs text-text-muted/50 mt-2 pb-4">
          {surahData?.name || 'Surah'} · {totalAyahs} ayahs
        </p>
      )}
    </div>
  )
}
