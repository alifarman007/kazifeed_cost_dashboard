'use client'

import { Sparkline } from '../charts/Sparkline'

interface Props {
  label: string
  value: string
  /** Signed percentage vs the named comparison period. */
  delta?: number | null
  deltaLabel?: string
  /** For cost, a rise is bad — so the arrow's colour flips. */
  upIsGood?: boolean
  trend?: (number | null)[]
  hero?: boolean
  loading?: boolean
  /** Stagger index across the KPI row. */
  index?: number
}

/**
 * Stat tile: label · value · optional delta · optional 12-point sparkline.
 *
 * Values use proportional figures — `tabular-nums` gives every digit the width
 * of a zero, which reads loose at display sizes. Tabular is for columns.
 */
export function StatTile({
  label,
  value,
  delta,
  deltaLabel = 'vs prev. month',
  upIsGood = false,
  trend,
  hero = false,
  loading = false,
  index = 0,
}: Props) {
  const hasDelta = delta != null && Number.isFinite(delta)
  const rising = hasDelta && (delta as number) > 0
  const flat = hasDelta && Math.abs(delta as number) < 0.05

  const good = rising === upIsGood
  const deltaColor = flat
    ? 'var(--text-muted)'
    : good
      ? 'var(--delta-up-good)'
      : 'var(--status-critical)'

  return (
    <div
      className="card kfg-fade-up flex flex-col gap-2 px-4 py-3.5"
      style={{ animationDelay: `${Math.min(index, 5) * 55}ms` }}
    >
      <span
        className="text-[11.5px] font-medium uppercase leading-tight tracking-[0.055em]"
        style={{ color: 'var(--text-muted)' }}
      >
        {label}
      </span>

      <div className="flex items-end justify-between gap-3">
        <span
          className={`font-semibold leading-none ${hero ? 'text-[34px]' : 'text-[22px]'}`}
          style={{ color: 'var(--text-primary)', opacity: loading ? 0.4 : 1 }}
        >
          {value}
        </span>
        {trend && trend.some((v) => v != null) && (
          <Sparkline values={trend} className="mb-0.5 shrink-0" />
        )}
      </div>

      {hasDelta && (
        <span className="flex items-center gap-1.5 text-[11.5px]" style={{ color: deltaColor }}>
          {/* Icon + label, never colour alone. */}
          <span aria-hidden className="text-[10px] leading-none">
            {flat ? '—' : rising ? '▲' : '▼'}
          </span>
          <span className="tnum font-semibold">
            {(delta as number) > 0 ? '+' : ''}
            {(delta as number).toFixed(1)}%
          </span>
          <span style={{ color: 'var(--text-muted)' }}>{deltaLabel}</span>
        </span>
      )}
    </div>
  )
}
