import { Loader2, Mic, CheckCircle2, AlertCircle } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

export type StatusPhase =
  | 'preparing'   // tutor is getting ready / between turns
  | 'countdown'   // 3-2-1 before recording
  | 'listening'   // mic is open
  | 'checking'    // backend is scoring / transcribing
  | 'done'        // pass / lesson complete
  | 'warn'        // noise / no-speech / soft error

interface PhaseStyle {
  Icon: LucideIcon | null
  iconClass: string
  frameClass: string
  iconAnimation: string
  showDots: boolean
  dotsClass: string
}

const PHASE_STYLES: Record<StatusPhase, PhaseStyle> = {
  preparing: {
    Icon: Loader2,
    iconClass: 'text-amber-500 dark:text-amber-400',
    frameClass: 'bg-amber-50 dark:bg-amber-950/30 ring-1 ring-amber-200/60 dark:ring-amber-800/40',
    iconAnimation: 'animate-spin',
    showDots: true,
    dotsClass: 'bg-amber-400',
  },
  countdown: {
    Icon: null,
    iconClass: 'text-primary',
    frameClass: 'bg-primary/10 ring-1 ring-primary/20',
    iconAnimation: '',
    showDots: false,
    dotsClass: 'bg-primary',
  },
  listening: {
    Icon: Mic,
    iconClass: 'text-rose-500 dark:text-rose-400',
    frameClass: 'bg-rose-50 dark:bg-rose-950/30 ring-1 ring-rose-200/60 dark:ring-rose-800/40 animate-pulse',
    iconAnimation: '',
    showDots: false,
    dotsClass: 'bg-rose-400',
  },
  checking: {
    Icon: Loader2,
    iconClass: 'text-primary-dark',
    frameClass: 'bg-primary/10 ring-1 ring-primary/20',
    iconAnimation: 'animate-spin',
    showDots: true,
    dotsClass: 'bg-primary-dark',
  },
  done: {
    Icon: CheckCircle2,
    iconClass: 'text-emerald-500 dark:text-emerald-400',
    frameClass: 'bg-emerald-50 dark:bg-emerald-950/30 ring-1 ring-emerald-200/60 dark:ring-emerald-800/40',
    iconAnimation: '',
    showDots: false,
    dotsClass: 'bg-emerald-400',
  },
  warn: {
    Icon: AlertCircle,
    iconClass: 'text-amber-600 dark:text-amber-400',
    frameClass: 'bg-amber-50 dark:bg-amber-950/30 ring-1 ring-amber-200/60 dark:ring-amber-800/40',
    iconAnimation: '',
    showDots: false,
    dotsClass: 'bg-amber-400',
  },
}

interface StatusBadgeProps {
  phase: StatusPhase
  title: string
  subtitle?: string
  countdown?: number
  size?: 'md' | 'lg'
  className?: string
}

/**
 * Single, consistent loading/status indicator for the recording flow.
 *
 * Same 64×64 (or 80×80 for `lg`) rounded squircle every time — only the icon
 * and color shift between phases. Optional 3-bouncing-dots progress hint
 * appears for `preparing` and `checking` so the kid always knows the app
 * is alive.
 */
export function StatusBadge({
  phase,
  title,
  subtitle,
  countdown,
  size = 'md',
  className = '',
}: StatusBadgeProps) {
  const style = PHASE_STYLES[phase]
  const frameSize = size === 'lg' ? 'w-20 h-20' : 'w-16 h-16'
  const iconSize = size === 'lg' ? 'w-10 h-10' : 'w-8 h-8'
  const numberSize = size === 'lg' ? 'text-7xl' : 'text-6xl'

  return (
    <div className={`text-center py-4 space-y-3 ${className}`}>
      <div
        className={`inline-flex items-center justify-center ${frameSize} rounded-2xl transition-colors duration-300 ${style.frameClass}`}
      >
        {phase === 'countdown' && typeof countdown === 'number' ? (
          <span className={`${numberSize} font-bold ${style.iconClass} animate-pulse leading-none`}>
            {countdown}
          </span>
        ) : style.Icon ? (
          <style.Icon className={`${iconSize} ${style.iconClass} ${style.iconAnimation}`} />
        ) : null}
      </div>
      <p className="text-base font-semibold text-text-primary leading-tight">{title}</p>
      {subtitle && <p className="text-sm text-text-muted leading-snug">{subtitle}</p>}
      {style.showDots && (
        <div className="flex items-center justify-center gap-1.5 pt-0.5" aria-hidden="true">
          <span className={`w-1.5 h-1.5 ${style.dotsClass} rounded-full animate-bounce [animation-delay:0ms]`} />
          <span className={`w-1.5 h-1.5 ${style.dotsClass} rounded-full animate-bounce [animation-delay:150ms]`} />
          <span className={`w-1.5 h-1.5 ${style.dotsClass} rounded-full animate-bounce [animation-delay:300ms]`} />
        </div>
      )}
    </div>
  )
}
