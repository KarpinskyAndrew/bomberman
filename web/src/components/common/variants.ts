/* Variant name -> class string maps and small pure helpers shared by the common components. */

export type ButtonVariant = 'default' | 'primary' | 'danger' | 'ghost' | 'ok'
export type ButtonSize = 'sm' | 'md' | 'lg'

const BUTTON_BASE =
  'inline-flex items-center justify-center gap-2 whitespace-nowrap border font-semibold no-underline cursor-pointer ' +
  'transition-[background,border-color,color,transform] duration-(--duration-hover) active:translate-y-px ' +
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fire-1 ' +
  'disabled:opacity-40 disabled:pointer-events-none aria-disabled:opacity-40 aria-disabled:pointer-events-none'

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  default: 'bg-surface-2 border-edge-strong text-ink hover:bg-surface-3 hover:border-ink/25',
  primary:
    'bg-(image:--gradient-fire) hover:bg-(image:--gradient-fire-hover) border-transparent text-on-accent ' +
    'shadow-(--shadow-accent)',
  danger: 'bg-bad/12 border-bad/40 text-[#ffd9dc] hover:bg-bad/20 hover:border-bad/60',
  ghost: 'bg-transparent border-transparent text-muted hover:text-ink hover:bg-ink/5',
  ok: 'bg-ok/14 border-ok/50 text-[#c9f5d5] hover:bg-ok/20',
}

const BUTTON_SIZES: Record<ButtonSize, string> = {
  sm: 'h-(--size-control-sm) px-3 text-sm rounded-control-sm',
  md: 'h-(--size-control) px-4.5 text-md rounded-control',
  lg: 'h-(--size-control-lg) px-6.5 text-lg rounded-control-lg',
}

export function buttonClasses(variant: ButtonVariant, size: ButtonSize, block: boolean): string {
  return [BUTTON_BASE, BUTTON_VARIANTS[variant], BUTTON_SIZES[size], block ? 'w-full' : '']
    .join(' ')
    .trim()
}

export type PingTone = 'ok' | 'warn' | 'bad'

/** GUI-PLAN: ping < 60 ms green, 60-120 ms yellow, > 120 ms red. */
export function pingTone(ms: number): PingTone {
  if (ms < 60) return 'ok'
  if (ms <= 120) return 'warn'
  return 'bad'
}

export type PlayerIndex = 0 | 1 | 2 | 3

/** The CSS color token of a player, by 0-based slot index. */
export function playerColorVar(index: PlayerIndex): string {
  return `var(--color-p${index + 1})`
}
