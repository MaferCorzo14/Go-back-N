/** Primitivas visuales compartidas: paneles, etiquetas, sliders y métricas. */

import type { ReactNode } from 'react'
import { cx } from '../lib/cx'

type Tone = 'slate' | 'sky' | 'emerald' | 'rose' | 'amber' | 'indigo' | 'violet'

/** Franja superior + color de título por panel: da identidad visual inmediata
 * a cada bloque funcional (emisor, canal, receptor, fallos…) sin tocar su lógica. */
const PANEL_ACCENT: Record<Tone, string> = {
  slate: 'border-t-slate-300',
  sky: 'border-t-sky-400',
  emerald: 'border-t-emerald-400',
  rose: 'border-t-rose-400',
  amber: 'border-t-amber-400',
  indigo: 'border-t-indigo-400',
  violet: 'border-t-violet-400',
}

const PANEL_TITLE: Record<Tone, string> = {
  slate: 'text-slate-700',
  sky: 'text-sky-700',
  emerald: 'text-emerald-700',
  rose: 'text-rose-700',
  amber: 'text-amber-700',
  indigo: 'text-indigo-700',
  violet: 'text-violet-700',
}

interface PanelProps {
  title?: ReactNode
  subtitle?: ReactNode
  aside?: ReactNode
  /** Identidad de color del panel (franja superior + título). Puramente visual. */
  accent?: Tone
  className?: string
  bodyClassName?: string
  children: ReactNode
}

export function Panel({
  title,
  subtitle,
  aside,
  accent = 'slate',
  className,
  bodyClassName,
  children,
}: PanelProps) {
  return (
    <section
      className={cx(
        'rounded-2xl border border-slate-200 border-t-4 bg-white shadow-md shadow-slate-300/25',
        PANEL_ACCENT[accent],
        className,
      )}
    >
      {(title || aside) && (
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3.5">
          <div>
            {title && (
              <h2
                className={cx(
                  'text-[14px] font-bold tracking-[0.14em] uppercase',
                  PANEL_TITLE[accent],
                )}
              >
                {title}
              </h2>
            )}
            {subtitle && <p className="mt-0.5 text-[13px] text-slate-600">{subtitle}</p>}
          </div>
          {aside}
        </header>
      )}
      <div className={cx('p-4', bodyClassName)}>{children}</div>
    </section>
  )
}

export function Tag({
  children,
  tone = 'slate',
  className,
}: {
  children: ReactNode
  tone?: 'slate' | 'sky' | 'emerald' | 'rose' | 'amber' | 'indigo'
  className?: string
}) {
  const tones = {
    slate: 'border-slate-300 bg-slate-100 text-slate-600',
    sky: 'border-sky-300 bg-sky-50 text-sky-700',
    emerald: 'border-emerald-300 bg-emerald-50 text-emerald-700',
    rose: 'border-rose-300 bg-rose-50 text-rose-700',
    amber: 'border-amber-300 bg-amber-50 text-amber-700',
    indigo: 'border-indigo-300 bg-indigo-50 text-indigo-700',
  }
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] font-semibold tracking-wide uppercase',
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  )
}

export function Stat({
  label,
  value,
  hint,
  tone = 'slate',
}: {
  label: string
  value: ReactNode
  hint?: ReactNode
  tone?: 'slate' | 'sky' | 'emerald' | 'rose' | 'amber' | 'indigo'
}) {
  const tones = {
    slate: 'text-slate-800',
    sky: 'text-sky-600',
    emerald: 'text-emerald-600',
    rose: 'text-rose-600',
    amber: 'text-amber-600',
    indigo: 'text-indigo-600',
  }
  return (
    <div className="rounded-xl border border-slate-300 bg-slate-50 px-3 py-2">
      <div className="text-[11px] font-semibold tracking-[0.12em] text-slate-600 uppercase">
        {label}
      </div>
      <div className={cx('font-mono text-xl leading-tight font-bold', tones[tone])}>{value}</div>
      {hint && <div className="mt-0.5 text-[12px] text-slate-600">{hint}</div>}
    </div>
  )
}

interface SliderProps {
  label: string
  value: number
  min: number
  max: number
  step?: number
  onChange: (value: number) => void
  format?: (value: number) => string
  hint?: ReactNode
  disabled?: boolean
}

export function Slider({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
  format,
  hint,
  disabled,
}: SliderProps) {
  return (
    <label className={cx('block', disabled && 'opacity-50')}>
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <span className="text-[13px] font-semibold text-slate-700">{label}</span>
        <span className="font-mono text-[13px] font-bold text-indigo-700">
          {format ? format(value) : value}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(Number(event.target.value))}
      />
      {hint && <p className="mt-1 text-[12px] leading-snug text-slate-600">{hint}</p>}
    </label>
  )
}

interface ButtonProps {
  children: ReactNode
  onClick: () => void
  disabled?: boolean
  title?: string
  variant?: 'primary' | 'ghost' | 'danger' | 'warning' | 'success'
  className?: string
}

export function Button({
  children,
  onClick,
  disabled,
  title,
  variant = 'ghost',
  className,
}: ButtonProps) {
  const variants = {
    primary: 'border-indigo-600 bg-indigo-600 text-white hover:bg-indigo-700 hover:border-indigo-700',
    ghost: 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50 hover:border-slate-300',
    danger: 'border-rose-300 bg-rose-50 text-rose-700 hover:bg-rose-100',
    warning: 'border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100',
    success: 'border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100',
  }
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={cx(
        'rounded-xl border px-3 py-2 text-sm font-semibold transition-colors duration-150',
        'disabled:cursor-not-allowed disabled:border-slate-100 disabled:bg-slate-50 disabled:text-slate-300',
        variants[variant],
        className,
      )}
    >
      {children}
    </button>
  )
}

/** Anillo de progreso usado por el temporizador del emisor. */
export function ProgressRing({
  fraction,
  size = 46,
  stroke = 5,
  color,
  children,
}: {
  fraction: number
  size?: number
  stroke?: number
  color: string
  children?: ReactNode
}) {
  const radius = (size - stroke) / 2
  const circumference = 2 * Math.PI * radius
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="rgba(100,116,139,0.22)"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - Math.min(1, Math.max(0, fraction)))}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">{children}</div>
    </div>
  )
}
