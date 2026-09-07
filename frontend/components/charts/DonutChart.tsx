'use client'

import { useId, useMemo, useRef, useState } from 'react'

import { Tooltip, type TooltipData } from './Tooltip'

export interface DonutSlice {
  key: string
  label: string
  value: number
  color: string
}

/**
 * Part-to-whole at a glance, capped at six segments.
 *
 * Only for a share that reads instantly — never to compare close values, which
 * is a bar's job. The centre carries the total so the donut is not the only
 * place a number lives.
 */
export function DonutChart({
  slices,
  format,
  centerLabel = 'Total',
  size = 188,
  thickness = 26,
}: {
  slices: DonutSlice[]
  format: (v: number) => string
  centerLabel?: string
  size?: number
  thickness?: number
}) {
  const gid = useId()
  const wrapRef = useRef<HTMLDivElement>(null)
  const [tip, setTip] = useState<TooltipData | null>(null)
  const [hovered, setHovered] = useState<string | null>(null)

  // Declared before the early return below — hooks must run unconditionally.
  const dataKey = useMemo(
    () => slices.map((d) => `${d.key}:${d.value}`).join('|'),
    [slices]
  )

  const total = slices.reduce((s, d) => s + Math.max(d.value, 0), 0)
  if (total <= 0) {
    return (
      <div
        className="flex items-center justify-center rounded-full text-[12px]"
        style={{ width: size, height: size, color: 'var(--text-muted)', background: 'var(--surface-sunken)' }}
      >
        No data
      </div>
    )
  }

  const r = size / 2
  const inner = r - thickness
  const cx = r
  const cy = r
  // A 2px surface gap separates touching segments — never a stroke.
  const gapDeg = (2 / (2 * Math.PI * (r - thickness / 2))) * 360

  let angle = -90

  const arc = (startDeg: number, endDeg: number) => {
    const s = (startDeg * Math.PI) / 180
    const e = (endDeg * Math.PI) / 180
    const large = endDeg - startDeg > 180 ? 1 : 0
    const x0 = cx + r * Math.cos(s)
    const y0 = cy + r * Math.sin(s)
    const x1 = cx + r * Math.cos(e)
    const y1 = cy + r * Math.sin(e)
    const x2 = cx + inner * Math.cos(e)
    const y2 = cy + inner * Math.sin(e)
    const x3 = cx + inner * Math.cos(s)
    const y3 = cy + inner * Math.sin(s)
    return [
      `M${x0},${y0}`,
      `A${r},${r} 0 ${large} 1 ${x1},${y1}`,
      `L${x2},${y2}`,
      `A${inner},${inner} 0 ${large} 0 ${x3},${y3}`,
      'Z',
    ].join(' ')
  }

  return (
    <div ref={wrapRef} className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} role="img" aria-label={`${centerLabel}: ${format(total)}`}>
        <defs>
          {/* Radial, so the highlight is identical all the way round — a linear
              sheen would light one side of the ring and read as encoding. */}
          <radialGradient id={`${gid}-ring`} cx="50%" cy="50%" r="50%">
            <stop offset={`${((r - thickness) / r) * 100}%`} stopColor="#fff" stopOpacity="0.2" />
            <stop offset={`${((r - thickness / 2) / r) * 100}%`} stopColor="#fff" stopOpacity="0.03" />
            <stop offset="100%" stopColor="#000" stopOpacity="0.1" />
          </radialGradient>
        </defs>
        <g key={dataKey}>
        {slices.map((d, si) => {
          const share = Math.max(d.value, 0) / total
          const sweep = share * 360
          const start = angle
          const end = angle + sweep
          angle = end
          if (sweep <= 0.2) return null
          const g = Math.min(gapDeg, sweep / 3)
          const dArc = arc(start, Math.max(end - g, start + 0.01))
          return (
            <g key={d.key}>
            <path
              className="kfg-pop-in"
              d={dArc}
              fill={d.color}
              opacity={hovered && hovered !== d.key ? 0.45 : 1}
              style={{
                transition: 'opacity 140ms',
                cursor: 'pointer',
                animationDelay: `${si * 70}ms`,
              }}
              tabIndex={0}
              role="button"
              aria-label={`${d.label}: ${format(d.value)}, ${((share * 100) || 0).toFixed(1)} percent`}
              onMouseMove={(e) => {
                const box = wrapRef.current?.getBoundingClientRect()
                if (!box) return
                setHovered(d.key)
                setTip({
                  x: e.clientX - box.left,
                  y: e.clientY - box.top,
                  title: d.label,
                  rows: [
                    { color: d.color, label: 'Value', value: format(d.value) },
                    { label: 'Share', value: `${(share * 100).toFixed(1)}%` },
                  ],
                })
              }}
              onMouseLeave={() => {
                setTip(null)
                setHovered(null)
              }}
            />
            <path
              className="kfg-pop-in pointer-events-none"
              d={dArc}
              fill={`url(#${gid}-ring)`}
              style={{ animationDelay: `${si * 70}ms` }}
              aria-hidden
            />
            </g>
          )
        })}
        </g>
      </svg>

      <div
        className="kfg-fade-in pointer-events-none absolute inset-0 flex flex-col items-center justify-center"
        style={{ animationDelay: `${slices.length * 70 + 120}ms` }}
      >
        <span className="text-[10.5px] uppercase tracking-[0.06em]" style={{ color: 'var(--text-muted)' }}>
          {centerLabel}
        </span>
        <span className="mt-0.5 text-[17px] font-semibold" style={{ color: 'var(--text-primary)' }}>
          {format(total)}
        </span>
      </div>

      <Tooltip data={tip} container={wrapRef.current?.getBoundingClientRect() ?? null} />
    </div>
  )
}
