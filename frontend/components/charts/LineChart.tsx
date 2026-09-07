'use client'

import { useMemo, useRef, useState } from 'react'

import { useMeasure } from '@/lib/useMeasure'
import { Tooltip, type TooltipData } from './Tooltip'

export interface LineSeries {
  key: string
  label: string
  color: string
  values: (number | null)[]
}

interface Props {
  categories: string[]
  series: LineSeries[]
  format: (v: number) => string
  height?: number
  /**
   * Rates (cost per kg) are not magnitudes that sum to a whole, so a zero
   * baseline is not required — and forcing one flattens a 0.3 % spread into a
   * straight line that hides the real movement. Zoomed axes are labelled as
   * such so nobody misreads the amplitude.
   */
  zeroBaseline?: boolean
  emptyMessage?: string
}

const M = { top: 20, right: 16, bottom: 30, left: 62 }

export function LineChart({
  categories,
  series,
  format,
  height = 240,
  zeroBaseline = false,
  emptyMessage = 'No data for this period.',
}: Props) {
  const { ref: measureRef, width } = useMeasure<HTMLDivElement>()
  const wrapRef = useRef<HTMLDivElement>(null)
  const [tip, setTip] = useState<TooltipData | null>(null)
  const [hovered, setHovered] = useState<number | null>(null)

  // Declared before the early return below — hooks must run unconditionally.
  const dataKey = useMemo(
    () => series.map((sr) => `${sr.key}:${sr.values.join(',')}`).join('|'),
    [series]
  )

  const all = series.flatMap((s) => s.values).filter((v): v is number => v != null)
  if (!all.length) {
    return (
      <div
        className="flex items-center justify-center rounded-lg text-[13px]"
        style={{ height, color: 'var(--text-muted)', background: 'var(--surface-sunken)' }}
      >
        {emptyMessage}
      </div>
    )
  }

  const dataMin = Math.min(...all)
  const dataMax = Math.max(...all)
  const pad = (dataMax - dataMin) * 0.25 || dataMax * 0.05 || 1
  const lo = zeroBaseline ? 0 : Math.max(dataMin - pad, 0)
  const hi = dataMax + pad

  const w = Math.max(width, 320)
  const innerW = Math.max(w - M.left - M.right, 40)
  const innerH = Math.max(height - M.top - M.bottom, 40)

  const step = innerW / Math.max(categories.length - 1, 1)
  const xOf = (i: number) => i * step
  const yOf = (v: number) => innerH - ((v - lo) / (hi - lo)) * innerH

  const ticks = [lo, lo + (hi - lo) / 2, hi]

  const showTip = (i: number, clientX: number) => {
    const box = wrapRef.current?.getBoundingClientRect()
    if (!box) return
    setHovered(i)
    setTip({
      x: clientX - box.left,
      y: M.top + innerH / 2,
      title: categories[i],
      rows: series
        .filter((s) => s.values[i] != null)
        .map((s) => ({ color: s.color, label: s.label, value: format(s.values[i] as number) })),
    })
  }

  return (
    <div ref={wrapRef} className="relative">
      <div ref={measureRef}>
        <svg width="100%" height={height} viewBox={`0 0 ${w} ${height}`} role="img"
             aria-label={`Line chart: ${series.map((s) => s.label).join(', ')}`}>
          <g transform={`translate(${M.left},${M.top})`}>
            {ticks.map((t) => (
              <g key={t}>
                <line x1={0} x2={innerW} y1={yOf(t)} y2={yOf(t)} stroke="var(--gridline)"
                      strokeWidth={1} shapeRendering="crispEdges" />
                <text x={-10} y={yOf(t)} textAnchor="end" dominantBaseline="middle"
                      className="tnum" fontSize={10.5} fill="var(--text-muted)">
                  {format(t)}
                </text>
              </g>
            ))}

            <g key={dataKey}>
            {series.map((s) => {
              let d = ''
              let started = false
              s.values.forEach((v, i) => {
                if (v == null) {
                  started = false
                  return
                }
                d += `${started ? 'L' : 'M'}${xOf(i).toFixed(1)},${yOf(v).toFixed(1)} `
                started = true
              })
              return (
                // pathLength normalises the dash length so one keyframe draws
                // any path, whatever its real length.
                <path key={s.key} d={d.trim()} fill="none" stroke={s.color} strokeWidth={2}
                      strokeLinecap="round" strokeLinejoin="round"
                      pathLength={1} className="kfg-draw" />
              )
            })}

            {/* End markers carry a 2px surface ring so they stay legible on crossings */}
            {series.map((s) => {
              const idx = s.values.map((v, i) => (v == null ? -1 : i)).filter((i) => i >= 0).pop()
              if (idx == null || idx < 0) return null
              const v = s.values[idx] as number
              return (
                // The end marker lands once the line has finished drawing.
                <g key={`end-${s.key}`} className="kfg-pop-in" style={{ animationDelay: '640ms' }}>
                  <circle cx={xOf(idx)} cy={yOf(v)} r={5.5} fill="var(--surface-1)" />
                  <circle cx={xOf(idx)} cy={yOf(v)} r={3.5} fill={s.color} />
                </g>
              )
            })}

            </g>

            {/* Crosshair — readers aim at a month, never at a 2px line */}
            {hovered != null && (
              <line x1={xOf(hovered)} x2={xOf(hovered)} y1={0} y2={innerH}
                    stroke="var(--baseline)" strokeWidth={1} shapeRendering="crispEdges" />
            )}

            <line x1={0} x2={innerW} y1={innerH} y2={innerH} stroke="var(--baseline)"
                  strokeWidth={1} shapeRendering="crispEdges" />

            {categories.map((c, i) => (
              <text key={c} x={xOf(i)} y={innerH + 15} textAnchor="middle" fontSize={10.5}
                    fill={hovered === i ? 'var(--text-primary)' : 'var(--text-muted)'}
                    fontWeight={hovered === i ? 600 : 400}>
                {c}
              </text>
            ))}

            {categories.map((c, i) => (
              <rect key={`hit-${c}`} x={xOf(i) - step / 2} y={0} width={step} height={innerH}
                    fill="transparent" tabIndex={0} role="button"
                    style={{ cursor: 'pointer', outline: 'none' }}
                    onMouseMove={(e) => showTip(i, e.clientX)}
                    onMouseLeave={() => { setTip(null); setHovered(null) }}
                    onFocus={() => {
                      const box = wrapRef.current?.getBoundingClientRect()
                      if (box) showTip(i, box.left + M.left + xOf(i))
                    }}
                    onBlur={() => { setTip(null); setHovered(null) }} />
            ))}
          </g>
        </svg>
      </div>

      {!zeroBaseline && (
        <p className="m-0 mt-1 text-[10.5px]" style={{ color: 'var(--text-muted)' }}>
          Axis starts at {format(lo)}, not zero — unit cost moves within a narrow band.
        </p>
      )}

      <Tooltip data={tip} container={wrapRef.current?.getBoundingClientRect() ?? null} />
    </div>
  )
}
