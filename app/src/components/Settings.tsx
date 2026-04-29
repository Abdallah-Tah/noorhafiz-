import { useState, useRef } from 'react'
import {
  ChevronRight, Check, Bug, ChevronDown, ChevronUp,
} from 'lucide-react'
import { RECITERS, type ReciterId, setSelectedReciter, testMic } from '../lib/quran'
import { SURAHS } from '../lib/surahs'
import { updateProfile, updateChild, type User, type Child } from '../lib/api'

// ── Types ──

interface SettingsProps {
  user: User
  setUser: React.Dispatch<React.SetStateAction<User | null>>
  selectedChild: Child | null
  setSelectedChild: React.Dispatch<React.SetStateAction<Child | null>>
  setChildren: React.Dispatch<React.SetStateAction<Child[]>>

  reciter: ReciterId
  setReciter: (r: ReciterId) => void

  childRepeatEach: number
  setChildRepeatEach: (n: number) => void
  childMemoryPassScore: number
  setChildMemoryPassScore: (n: number) => void
  childHideText: boolean
  setChildHideText: (b: boolean) => void

  childLearningPreset: string
  setChildLearningPreset: (s: string) => void
  childStartSurah: number
  setChildStartSurah: (n: number) => void
  childStartAyah: number
  setChildStartAyah: (n: number) => void
  childEndSurah: number
  setChildEndSurah: (n: number) => void
  childEndAyah: number
  setChildEndAyah: (n: number) => void
  childCompletionBehavior: string
  setChildCompletionBehavior: (s: string) => void

  onStartLesson: () => void
  showToast: (msg: string, type: 'success' | 'error') => void

  showDebug: boolean
  setShowDebug: (b: boolean) => void
  debugMode: boolean
  setDebugMode: (b: boolean) => void
  micTestResult: string | null
  setMicTestResult: (s: string | null) => void
  micTesting: boolean
  setMicTesting: (b: boolean) => void
  selectedMicId: string
  setSelectedMicId: (s: string) => void
  micDevices: MediaDeviceInfo[]
  setMicDevices: (d: MediaDeviceInfo[]) => void
  lastBlobSize: number
  lastRecordingDuration: number
  lastBlobMime: string
  micPermission: string
}

// ── Bottom Sheet Picker ──

interface PickerOption {
  value: string
  label: string
}

function BottomSheet({
  open,
  onClose,
  title,
  options,
  value,
  onChange,
}: {
  open: boolean
  onClose: () => void
  title: string
  options: PickerOption[]
  value: string
  onChange: (v: string) => void
}) {
  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/30 backdrop-blur-sm"
        onClick={onClose}
      />
      {/* Sheet */}
      <div className="relative bg-surface-card rounded-t-2xl w-full max-w-lg max-h-[70vh] overflow-y-auto animate-slide-up pb-8">
        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-surface-dark" />
        </div>
        <h2 className="text-lg font-semibold text-text-primary px-6 pt-4 pb-3 text-center">
          {title}
        </h2>
        <div className="divide-y divide-surface-dark">
          {options.map((opt) => (
            <button
              key={opt.value}
              onClick={() => {
                onChange(opt.value)
                onClose()
              }}
              className="w-full flex items-center justify-between px-6 py-4 hover:bg-surface transition-smooth active:bg-surface-dark/50"
            >
              <span
                className={`text-base ${
                  opt.value === value
                    ? 'text-primary font-medium'
                    : 'text-text-primary'
                }`}
              >
                {opt.label}
              </span>
              {opt.value === value && (
                <Check className="w-5 h-5 text-primary flex-shrink-0" />
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Segmented Control ──

function SegmentedControl({
  options,
  value,
  onChange,
}: {
  options: { value: number; label: string }[]
  value: number
  onChange: (v: number) => void
}) {
  return (
    <div className="flex bg-surface rounded-lg p-0.5">
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className={`flex-1 py-1.5 rounded-md text-sm font-medium transition-smooth ${
            opt.value === value
              ? 'bg-primary text-white shadow-sm'
              : 'text-text-muted hover:text-text-primary'
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}

// ── Settings Row ──
// Apple-style: label left, value+chevron right, truncate long values, stable padding

function SettingsRow({
  label,
  value,
  helper,
  onClick,
  right,
}: {
  label: string
  value?: string | number
  helper?: string
  onClick?: () => void
  right?: React.ReactNode
}) {
  const content = (
    <>
      {/* Label side — shrinks to give value room */}
      <div className="min-w-0">
        <div className="text-sm text-text-primary truncate">{label}</div>
        {helper && (
          <p className="text-xs text-text-muted mt-0.5 leading-relaxed">{helper}</p>
        )}
      </div>

      {/* Value side — never shrinks below content, capped at 50% */}
      {right ? (
        <div className="flex items-center gap-2 shrink-0 ml-4">{right}</div>
      ) : onClick ? (
        <div className="flex items-center gap-1.5 shrink-0 max-w-[50%] ml-4">
          {value !== undefined && (
            <span className="text-sm text-text-muted truncate text-right">{value}</span>
          )}
          <ChevronRight className="w-4 h-4 text-text-muted/40 shrink-0" />
        </div>
      ) : value !== undefined ? (
        <span className="text-sm text-text-muted truncate text-right shrink-0 max-w-[50%] ml-4">{value}</span>
      ) : null}
    </>
  )

  if (onClick) {
    return (
      <button
        onClick={onClick}
        className="w-full flex items-center justify-between gap-4 px-4 py-3 min-w-0 hover:bg-surface transition-smooth active:bg-surface-dark/40"
      >
        {content}
      </button>
    )
  }

  return (
    <div className="flex items-center justify-between gap-4 px-4 py-3 min-w-0">
      {content}
    </div>
  )
}

// ── Section Container ──

function SettingsSection({
  title,
  children,
}: {
  title?: string
  children: React.ReactNode
}) {
  return (
    <div className="mb-7">
      {title && (
        <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wide px-5 mb-2">
          {title}
        </h3>
      )}
      <div className="bg-surface-card rounded-2xl border border-surface-dark/50 divide-y divide-surface-dark/40">
        {children}
      </div>
    </div>
  )
}

// ── Saved badge ──

function SavedBadge({ visible }: { visible: boolean }) {
  if (!visible) return null
  return (
    <span className="text-xs font-medium text-primary animate-fade-in-out">
      Saved ✓
    </span>
  )
}

// ═══════════════════════════════════════════
//  MAIN SETTINGS COMPONENT
// ═══════════════════════════════════════════

export default function Settings(props: SettingsProps) {
  const {
    user, setUser, selectedChild, setSelectedChild, setChildren,
    reciter, setReciter,
    childRepeatEach, setChildRepeatEach,
    childMemoryPassScore, setChildMemoryPassScore,
    childHideText, setChildHideText,
    childLearningPreset, setChildLearningPreset,
    childStartSurah, setChildStartSurah,
    childStartAyah, setChildStartAyah,
    childEndSurah, setChildEndSurah,
    childEndAyah, setChildEndAyah,
    childCompletionBehavior, setChildCompletionBehavior,
    onStartLesson, showToast,
    showDebug, setShowDebug, debugMode, setDebugMode,
    micTestResult, setMicTestResult,
    micTesting, setMicTesting,
    selectedMicId, setSelectedMicId,
    micDevices, setMicDevices,
    lastBlobSize, lastRecordingDuration, lastBlobMime, micPermission,
  } = props

  // ── Picker sheet state ──
  const [activePicker, setActivePicker] = useState<string | null>(null)

  // ── Saved badge state ──
  const [savedVisible, setSavedVisible] = useState(false)
  const savedTimer = useRef<ReturnType<typeof setTimeout>>()

  function flashSaved() {
    setSavedVisible(true)
    if (savedTimer.current) clearTimeout(savedTimer.current)
    savedTimer.current = setTimeout(() => setSavedVisible(false), 1500)
  }

  // ── Name debounce ──
  const nameTimer = useRef<ReturnType<typeof setTimeout>>()

  function handleNameChange(name: string) {
    setUser({ ...user, name })
    if (nameTimer.current) clearTimeout(nameTimer.current)
    nameTimer.current = setTimeout(async () => {
      try {
        const updated = await updateProfile({ name })
        setUser(updated)
        flashSaved()
      } catch (err: any) {
        showToast(err.message, 'error')
      }
    }, 500)
  }

  // ── Profile field save ──
  async function saveProfile(field: string, value: string) {
    try {
      const data: any = {}
      data[field] = value
      const updated = await updateProfile(data)
      setUser((prev) => (prev ? { ...prev, ...updated } : prev))
      flashSaved()
    } catch (err: any) {
      showToast(err.message, 'error')
    }
  }

  // ── Child field save ──
  async function saveChildField(field: string, value: any) {
    if (!selectedChild) return
    try {
      const updated = await updateChild(selectedChild.id, { [field]: value })
      if (updated) {
        setChildren((prev) =>
          prev.map((c) => (c.id === updated.id ? updated : c))
        )
        setSelectedChild((prev) =>
          prev?.id === updated.id ? { ...prev, ...updated } : prev
        )
        flashSaved()
      }
    } catch (err: any) {
      showToast(err.message, 'error')
    }
  }

  // ── Learning path preset change ──
  function handlePresetChange(v: string) {
    setChildLearningPreset(v)
    const updates: Partial<Child> = { learning_path_preset: v }

    if (v === 'fatiha_forward') {
      setChildStartSurah(1); setChildStartAyah(1)
      setChildEndSurah(114); setChildEndAyah(6)
      Object.assign(updates, { learning_start_surah: 1, learning_start_ayah: 1, learning_end_surah: 114, learning_end_ayah: 6 })
    } else if (v === 'juz_amma') {
      setChildStartSurah(78); setChildStartAyah(1)
      setChildEndSurah(114); setChildEndAyah(6)
      Object.assign(updates, { learning_start_surah: 78, learning_start_ayah: 1, learning_end_surah: 114, learning_end_ayah: 6 })
    } else if (v === 'short_surahs') {
      setChildStartSurah(108); setChildStartAyah(1)
      setChildEndSurah(114); setChildEndAyah(6)
      Object.assign(updates, { learning_start_surah: 108, learning_start_ayah: 1, learning_end_surah: 114, learning_end_ayah: 6 })
    } else if (v === 'ikhlas_nas') {
      setChildStartSurah(112); setChildStartAyah(1)
      setChildEndSurah(114); setChildEndAyah(6)
      Object.assign(updates, { learning_start_surah: 112, learning_start_ayah: 1, learning_end_surah: 114, learning_end_ayah: 6 })
    } else if (v === 'selected_surah' && selectedChild) {
      const surah = SURAHS.find((s) => s.number === selectedChild.current_surah)
      setChildStartSurah(selectedChild.current_surah); setChildStartAyah(1)
      setChildEndSurah(selectedChild.current_surah)
      setChildEndAyah(surah?.ayahs ?? 1)
      Object.assign(updates, {
        learning_start_surah: selectedChild.current_surah,
        learning_start_ayah: 1,
        learning_end_surah: selectedChild.current_surah,
        learning_end_ayah: surah?.ayahs ?? 1,
      })
    }
    // custom: keep current values

    saveChildBulk(updates)
  }

  async function saveChildBulk(data: Partial<Child>) {
    if (!selectedChild) return
    try {
      const updated = await updateChild(selectedChild.id, data)
      if (updated) {
        setChildren((prev) =>
          prev.map((c) => (c.id === updated.id ? updated : c))
        )
        setSelectedChild((prev) =>
          prev?.id === updated.id ? { ...prev, ...updated } : prev
        )
        flashSaved()
      }
    } catch (err: any) {
      showToast(err.message, 'error')
    }
  }

  // ── Mic test handler ──
  async function handleMicTest() {
    if (micTesting) return
    try {
      setMicTesting(true)
      setMicTestResult(null)
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: selectedMicId
          ? { deviceId: { exact: selectedMicId } }
          : true,
      })
      const recorder = new MediaRecorder(stream)
      const chunks: BlobPart[] = []
      const testStart = Date.now()

      recorder.ondataavailable = (e) => chunks.push(e.data)
      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop())
        const duration = (Date.now() - testStart) / 1000
        const blob = new Blob(chunks, {
          type: recorder.mimeType || 'audio/webm',
        })
        try {
          const result = await testMic(blob, duration)
          const clearStatus = result.audio_unclear
            ? '⚠️ Yes - Check mic setup.'
            : '✅ Clear - Mic is working.'
          setMicTestResult(
            `🎙 Mic Test Results:\n` +
              `  Heard: ${result.transcript || '(nothing)'}\n` +
              `  Normalized: ${result.normalized_transcript || '(empty)'}\n` +
              `  Size: ${result.audio_size_kb} KB | Duration: ${result.duration_seconds.toFixed(1)}s\n` +
              `  Arabic: ${result.has_meaningful_arabic ? '✅ Yes' : '❌ No'} | Quality: ${clearStatus}\n` +
              `  ${result.audio_unclear_reason ? 'Reason: ' + result.audio_unclear_reason : ''}`
          )
        } catch (err: any) {
          setMicTestResult(`Error: ${err.message}`)
        } finally {
          setMicTesting(false)
        }
      }

      recorder.start()
      setTimeout(() => {
        if (recorder.state === 'recording') recorder.stop()
      }, 3000)
    } catch {
      setMicTestResult('Microphone access denied.')
      setMicTesting(false)
    }
  }

  // ── Picker helpers ──
  function openPicker(id: string) {
    setActivePicker(id)
  }

  function closePicker() {
    setActivePicker(null)
  }

  // ── Picker configs ──
  const qiraaOptions: PickerOption[] = [
    { value: 'hafs', label: 'Hafs (عاصم)' },
  ]

  const languageOptions: PickerOption[] = [
    { value: 'en', label: 'English' },
    { value: 'ar', label: 'العربية' },
    { value: 'fr', label: 'Français' },
  ]

  const reciterOptions: PickerOption[] = RECITERS.map((r) => ({
    value: r.id,
    label: r.name,
  }))

  const studyPlanOptions: PickerOption[] = [
    { value: 'fatiha_forward', label: 'Al-Fatiha Forward' },
    { value: 'juz_amma', label: 'Juz Amma (78–114)' },
    { value: 'short_surahs', label: 'Short Surahs First (108–114)' },
    { value: 'ikhlas_nas', label: 'Al-Ikhlas to An-Nas (112–114)' },
    { value: 'selected_surah', label: 'Current Surah Only' },
    { value: 'custom', label: 'Custom Range' },
  ]

  const completionOptions: PickerOption[] = [
    { value: 'stop', label: 'Stop and celebrate' },
    { value: 'repeat', label: 'Repeat assigned range' },
  ]

  const repeatOptions = [
    { value: 1, label: '1' },
    { value: 2, label: '2' },
    { value: 3, label: '3' },
    { value: 5, label: '5' },
  ]

  const scoreOptions = [
    { value: 70, label: '70%' },
    { value: 80, label: '80%' },
    { value: 90, label: '90%' },
  ]

  // ── Value display helpers ──
  const qiraaLabel = qiraaOptions.find((o) => o.value === user.qiraa)?.label || user.qiraa
  const languageLabel = languageOptions.find((o) => o.value === user.language)?.label || user.language
  const reciterLabel = RECITERS.find((r) => r.id === reciter)?.name || reciter
  const studyPlanLabel = studyPlanOptions.find((o) => o.value === childLearningPreset)?.label || childLearningPreset
  const completionLabel = completionOptions.find((o) => o.value === childCompletionBehavior)?.label || childCompletionBehavior

  return (
    <div className="w-full max-w-[480px] mx-auto px-4 sm:px-0">
      {/* Page title */}
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-text-primary">Settings</h2>
        <div className="flex items-center gap-2 mt-1">
          <SavedBadge visible={savedVisible} />
        </div>
      </div>

      {/* A. Profile */}
      <SettingsSection title="Profile">
        {/* Display Name */}
        <div className="flex items-center justify-between gap-4 px-4 py-3 min-w-0">
          <div className="min-w-0">
            <div className="text-sm text-text-primary truncate">Display Name</div>
          </div>
          <div className="shrink-0 max-w-[55%]">
            <input
              type="text"
              value={user.name}
              onChange={(e) => handleNameChange(e.target.value)}
              className="w-full text-right text-sm text-text-primary bg-transparent border-none outline-none placeholder:text-text-muted/40 truncate"
              placeholder="Your name"
            />
          </div>
        </div>

        {/* Qira'ah */}
        <SettingsRow
          label="Qira'ah"
          value={qiraaLabel}
          onClick={() => openPicker('qiraa')}
        />

        {/* Feedback Language */}
        <SettingsRow
          label="Feedback Language"
          value={languageLabel}
          onClick={() => openPicker('language')}
        />

        {/* Reciter */}
        <SettingsRow
          label="Reciter"
          value={reciterLabel}
          onClick={() => openPicker('reciter')}
        />
      </SettingsSection>

      {/* B. Learning */}
      {selectedChild && (
        <SettingsSection title="Learning">
          {/* Repeat before moving on */}
          <div className="px-4 py-3.5">
            <span className="text-sm text-text-primary">Repeat before moving on</span>
            <div className="mt-2">
              <SegmentedControl
                options={repeatOptions}
                value={childRepeatEach}
                onChange={(v) => {
                  setChildRepeatEach(v)
                  saveChildField('repeat_each_ayah', v)
                }}
              />
            </div>
            <p className="text-xs text-text-muted mt-2">
              Good passes needed before Memory Check unlocks
            </p>
          </div>

          {/* Memory Check score */}
          <div className="px-4 py-3.5">
            <span className="text-sm text-text-primary">Memory Check score</span>
            <div className="mt-2">
              <SegmentedControl
                options={scoreOptions}
                value={childMemoryPassScore}
                onChange={(v) => {
                  setChildMemoryPassScore(v)
                  saveChildField('memory_check_pass_score', v)
                }}
              />
            </div>
            <p className="text-xs text-text-muted mt-2">
              Accuracy needed to mark an ayah as memorized
            </p>
          </div>

          {/* Hide ayah text toggle */}
          <div className="flex items-center justify-between gap-4 px-4 py-3 min-w-0">
            <div className="min-w-0">
              <div className="text-sm text-text-primary truncate">
                Hide ayah text in Memory Check
              </div>
              <p className="text-xs text-text-muted mt-0.5">
                Shows 📖 ??? instead of the ayah
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                const next = !childHideText
                setChildHideText(next)
                saveChildField('hide_text_in_memory_check', next)
              }}
              className={`relative inline-flex h-7 w-12 items-center rounded-full transition-smooth shrink-0 ${
                childHideText ? 'bg-primary' : 'bg-surface-dark'
              }`}
            >
              <span
                className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-sm transition-smooth ${
                  childHideText ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>
        </SettingsSection>
      )}

      {/* C. Study Plan */}
      {selectedChild && (
        <SettingsSection title="Study Plan">
          {/* Study plan */}
          <SettingsRow
            label="Study plan"
            value={studyPlanLabel}
            onClick={() => openPicker('studyPlan')}
            helper={
              childLearningPreset === 'custom'
                ? `${SURAHS.find(s => s.number === childStartSurah)?.name || ''} → ${SURAHS.find(s => s.number === childEndSurah)?.name || ''}`
                : undefined
            }
          />

          {/* Custom range sub-rows */}
          {(childLearningPreset === 'custom' || childLearningPreset === 'selected_surah') && (
            <>
              <SettingsRow
                label="Start"
                value={SURAHS.find(s => s.number === childStartSurah)?.name || `Surah ${childStartSurah}`}
                onClick={() => openPicker('startSurah')}
                helper={`Ayah ${childStartAyah}`}
              />

              {childLearningPreset === 'custom' && (
                <SettingsRow
                  label="End"
                  value={SURAHS.find(s => s.number === childEndSurah)?.name || `Surah ${childEndSurah}`}
                  onClick={() => openPicker('endSurah')}
                  helper={`Ayah ${childEndAyah}`}
                />
              )}
            </>
          )}

          {/* When finished */}
          <SettingsRow
            label="When finished"
            value={completionLabel}
            onClick={() => openPicker('completion')}
          />

          {/* Start assigned lesson button */}
          <div className="px-4 py-4">
            <button
              onClick={onStartLesson}
              className="w-full bg-primary text-white font-semibold py-3 rounded-xl hover:bg-primary-dark transition-smooth text-sm active:scale-[0.98]"
            >
              Start Assigned Lesson
            </button>
          </div>
        </SettingsSection>
      )}

      {/* D. Advanced */}
      <SettingsSection>
        <button
          onClick={() => setShowDebug(!showDebug)}
          className="w-full flex items-center justify-between gap-4 px-4 py-3 min-w-0 hover:bg-surface transition-smooth active:bg-surface-dark/40"
        >
          <div className="min-w-0">
            <div className="text-sm text-text-primary truncate">Recording Diagnostics</div>
          </div>
          <div className="flex items-center gap-2 text-text-muted shrink-0">
            <Bug className="w-4 h-4" />
            {showDebug ? (
              <ChevronUp className="w-4 h-4" />
            ) : (
              <ChevronDown className="w-4 h-4" />
            )}
          </div>
        </button>

        {showDebug && (
          <div className="px-4 pb-5 space-y-4 border-t border-surface-dark/50 pt-4">
            {/* Debug mode toggle */}
            <div className="flex items-center justify-between gap-4 min-w-0">
              <div className="min-w-0">
                <div className="text-sm text-text-primary truncate">Debug mode</div>
                <p className="text-xs text-text-muted mt-0.5">Show recording info during practice</p>
              </div>
              <button
                onClick={() => {
                  const next = !debugMode
                  setDebugMode(next)
                  localStorage.setItem('nh-debug', String(next))
                }}
                className={`relative inline-flex h-7 w-12 items-center rounded-full transition-smooth shrink-0 ${
                  debugMode ? 'bg-primary' : 'bg-surface-dark'
                }`}
              >
                <span
                  className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-sm transition-smooth ${
                    debugMode ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>

            {/* Mic device selector */}
            <div>
              <label className="block text-xs font-medium text-text-muted mb-1">
                Microphone
              </label>
              <select
                value={selectedMicId}
                onChange={(e) => {
                  const id = e.target.value
                  setSelectedMicId(id)
                  localStorage.setItem('nh-mic-device', id)
                }}
                onClick={async () => {
                  try {
                    const devices = await navigator.mediaDevices.enumerateDevices()
                    setMicDevices(devices.filter((d) => d.kind === 'audioinput'))
                  } catch {}
                }}
                className="w-full px-3 py-2 rounded-lg border border-surface-dark bg-surface text-text-primary text-xs focus:outline-none focus:ring-1 focus:ring-primary/30"
              >
                <option value="">Default Microphone</option>
                {micDevices.map((d) => (
                  <option key={d.deviceId} value={d.deviceId}>
                    {d.label || `Microphone ${d.deviceId.slice(0, 8)}`}
                  </option>
                ))}
              </select>
              <p className="text-[10px] text-text-muted mt-1">
                Tap the dropdown to refresh device list
              </p>
            </div>

            {/* Mic test */}
            <div>
              <p className="text-sm font-medium text-text-primary mb-1">
                Test Microphone
              </p>
              <p className="text-xs text-text-muted mb-3">
                Records 3 seconds to verify mic and recognition
              </p>
              <button
                onClick={handleMicTest}
                disabled={micTesting}
                className={`w-full py-2.5 rounded-xl text-sm font-semibold transition-smooth ${
                  micTesting
                    ? 'bg-danger text-white animate-pulse'
                    : 'bg-primary-dark text-white hover:bg-primary active:scale-[0.98]'
                }`}
              >
                {micTesting ? 'Recording 3s…' : 'Test Microphone'}
              </button>
              {micTestResult && (
                <pre className="mt-3 text-xs bg-surface rounded-lg p-3 text-text-primary whitespace-pre-wrap font-mono leading-relaxed">
                  {micTestResult}
                </pre>
              )}
            </div>

            {/* Last recording info */}
            {lastBlobSize > 0 && (
              <div className="bg-surface rounded-xl p-4">
                <p className="text-sm font-medium text-text-primary mb-2">
                  Last Recording
                </p>
                <div className="text-xs font-mono text-text-muted space-y-1">
                  <p>Duration: {lastRecordingDuration.toFixed(1)}s</p>
                  <p>Size: {(lastBlobSize / 1024).toFixed(1)} KB</p>
                  <p>MIME: {lastBlobMime}</p>
                  <p>Mic permission: {micPermission}</p>
                </div>
              </div>
            )}
          </div>
        )}
      </SettingsSection>

      {/* ── Bottom Sheet Pickers ── */}
      <BottomSheet
        open={activePicker === 'qiraa'}
        onClose={closePicker}
        title="Qira'ah"
        options={qiraaOptions}
        value={user.qiraa}
        onChange={(v) => {
          setUser({ ...user, qiraa: v })
          saveProfile('qiraa', v)
        }}
      />

      <BottomSheet
        open={activePicker === 'language'}
        onClose={closePicker}
        title="Feedback Language"
        options={languageOptions}
        value={user.language}
        onChange={(v) => {
          setUser({ ...user, language: v })
          saveProfile('language', v)
        }}
      />

      <BottomSheet
        open={activePicker === 'reciter'}
        onClose={closePicker}
        title="Reciter"
        options={reciterOptions}
        value={reciter}
        onChange={(v) => {
          setReciter(v as ReciterId)
          setSelectedReciter(v as ReciterId)
          flashSaved()
        }}
      />

      <BottomSheet
        open={activePicker === 'studyPlan'}
        onClose={closePicker}
        title="Study Plan"
        options={studyPlanOptions}
        value={childLearningPreset}
        onChange={handlePresetChange}
      />

      {/* Start Surah picker */}
      <BottomSheet
        open={activePicker === 'startSurah'}
        onClose={closePicker}
        title="Start Surah"
        options={SURAHS.map((s) => ({
          value: String(s.number),
          label: s.name,
        }))}
        value={String(childStartSurah)}
        onChange={(v) => {
          const num = Number(v)
          setChildStartSurah(num)
          setChildStartAyah(1)
          saveChildBulk({
            learning_start_surah: num,
            learning_start_ayah: 1,
          })
        }}
      />

      {/* End Surah picker */}
      <BottomSheet
        open={activePicker === 'endSurah'}
        onClose={closePicker}
        title="End Surah"
        options={SURAHS.map((s) => ({
          value: String(s.number),
          label: s.name,
        }))}
        value={String(childEndSurah)}
        onChange={(v) => {
          const num = Number(v)
          setChildEndSurah(num)
          setChildEndAyah(1)
          saveChildBulk({
            learning_end_surah: num,
            learning_end_ayah: 1,
          })
        }}
      />

      <BottomSheet
        open={activePicker === 'completion'}
        onClose={closePicker}
        title="When Finished"
        options={completionOptions}
        value={childCompletionBehavior}
        onChange={(v) => {
          setChildCompletionBehavior(v)
          saveChildField('learning_completion_behavior', v)
        }}
      />
    </div>
  )
}
