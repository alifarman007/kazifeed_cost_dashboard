'use client'

import { useMemo, useRef, useState } from 'react'

import { axisMax, niceTicks } from '@/lib/format'
import { useMeasure } from '@/lib/useMeasure'
import { Tooltip, type TooltipData } from './Tooltip'

export interface ColumnSeries {
  key: string
  label: string
  color: string
  values: (number | null)[]
}

interface Props {
  /** One label per x position. */
  categories: string[]
  series: ColumnSeries[]
  format: (v: number) => string
  formatFull?: (v: number) => string
  /** 'grouped' sits series side by side; 'stacked' sums them into one column. */
  mode?: 'grouped' | 'stacked'
  height?: number
  /** Direct-label the tallest column. Sparing by design. */
  labelPeak?: boolean
  /** Longer category labels get angled instead of colliding. */
  tiltLabels?: boolean
  emptyMessage?: string
}

const GAP = 2 // the surface gap that separates touching marks
const MAX_BAR = 24 // never fill the band — leftover is air
const M = { top: 26, right: 12, bottom: 34, left: 58 }

/** Rounded at the data end, square at the baseline. */
function barPath(x: number, y: number, w: number, h: number, r = 4): string {
  if (h <= 0) return ''
  const rr = Math.min(r, w / 2, h)
  return [
    `M${x},${y + h}`,
    `L${x},${y + rr}`,
    `Q${x},${y} ${x + rr},${y}`,
    `L${x + w - rr},${y}`,
    `Q${x + w},${y} ${x + w},${y + rr}`,
    `L${x + w},${y + h}`,
    'Z',
  ].join(' ')
}

/**
 * Vertical columns for a time series. One axis only — a second y-scale would
 * invent a correlation that is not in the data.
 */
export function ColumnChart({
  categories,
  series,
  format,
  formatFull,
  mode = 'grouped',
  height = 300,
  labelPeak = false,
  tiltLabels = false,
  emptyMessage = 'No cost recorded for this period.',
}: Props) {
  const { ref: measureRef, width } = useMeasure<HTMLDivElement>()
  const wrapRef = useRef<HTMLDivElement>(null)
  const [tip, setTip] = useState<TooltipData | null>(null)
  const [hovered, setHovered] = useState<number | null>(null)

  const fullFmt = formatFull ?? format

  const totals = useMemo(
    () =>
      categories.map((_, i) =>
        mode === 'stacked'
          ? series.reduce((s, sr) => s + (sr.values[i] ?? 0), 0)
          : Math.max(...series.map((sr) => sr.values[i] ?? 0), 0)
      ),
    [categories, series, mode]
  )

  const dataMax = Math.max(...totals, 0)
  const hasData = series.some((s) => s.values.some((v) => v != null && v !== 0))

  const w = Math.max(width, 320)
  const innerW = Math.max(w - M.left - M.right, 40)
  const innerH = Math.max(height - M.top - M.bottom, 40)
  const max = axisMax(dataMax) || 1
  const ticks = niceTicks(max)

  const band = innerW / Math.max(categories.length, 1)
  const groupW = Math.min(band - 10, MAX_BAR * (mode === 'grouped' ? series.length : 1) + GAP * 2)
  const barW =
    mode === 'grouped'
      ? Math.max((groupW - GAP * (series.length - 1)) / series.length, 2)
      : Math.max(Math.min(groupW, MAX_BAR), 2)

  const yOf = (v: number) => innerH - (v / max) * innerH
  const peakIndex = totals.indexOf(Math.max(...totals))

  const showTip = (i: number, clientX: number) => {
    const box = wrapRef.current?.getBoundingClientRect()
    if (!box) return
    setHovered(i)
    const rows = series
      .filter((s) => s.values[i] != null)
      .map((s) => ({ color: s.color, label: s.label, value: fullFmt(s.values[i] as number) }))
    if (mode === 'stacked' && series.length > 1) {
      rows.push({ color: undefined as unknown as string, label: 'Total', value: fullFmt(totals[i]) })
    }
    setTip({
      x: clientX - box.left,
      y: M.top + innerH / 2,
      title: categories[i],
      rows,
    })
  }

  if (!hasData) {
    return (
      <div
        className="flex items-center justify-center rounded-lg text-[13px]"
        style={{ height, color: 'var(--text-muted)', background: 'var(--surface-sunken)' }}
      >
        {emptyMessage}
      </div>
    )
  }

  return (
    <div ref={wrapRef} className="relative">
      <div ref={measureRef}>
        <svg
          width="100%"
          height={height}
          viewBox={`0 0 ${w} ${height}`}
          role="img"
          aria-label={`Column chart: ${series.map((s) => s.label).join(', ')}`}
        >
          <g transform={`translate(${M.left},${M.top})`}>
            {/* Gridlines — hairline, solid, recessive */}
            {ticks.map((t) => (
              <line
                key={t}
                x1={0}
                x2={innerW}
                y1={yOf(t)}
                y2={yOf(t)}
                stroke="var(--gridline)"
                strokeWidth={1}
                shapeRendering="crispEdges"
              />
            ))}

            {/* Y ticks */}
            {ticks.map((t) => (
              <text
                key={t}
                x={-10}
                y={yOf(t)}
                textAnchor="end"
                dominantBaseline="middle"
                className="tnum"
                fontSize={10.5}
                fill="var(--text-muted)"
              >
                {t === 0 ? '0' : format(t)}
              </text>
            ))}

            {/* Baseline */}
            <line
              x1={0}
              x2={innerW}
              y1={innerH}
              y2={innerH}
              stroke="var(--baseline)"
              strokeWidth={1}
              shapeRendering="crispEdges"
            />

            {/* Marks */}
            {categories.map((cat, i) => {
              const cx = i * band + band / 2
              const dim = hovered != null && hovered !== i

              if (mode === 'stacked') {
                let acc = 0
                return (
                  <g key={cat} opacity={dim ? 0.55 : 1} style={{ transition: 'opacity 140ms' }}>
                    {series.map((s) => {
                      const v = s.values[i] ?? 0
                      if (v <= 0) return null
                      const y0 = yOf(acc)
                      acc += v
                      const y1 = yOf(acc)
                      // The 2px surface gap separates every segment of the stack.
                      const h = Math.max(y0 - y1 - GAP, 0)
                      return (
                        <path
                          key={s.key}
                          d={barPath(cx - barW / 2, y1, barW, h)}
                          fill={s.color}
                        />
                      )
                    })}
                  </g>
                )
              }

              return (
                <g key={cat} opacity={dim ? 0.55 : 1} style={{ transition: 'opacity 140ms' }}>
                  {series.map((s, si) => {
                    const v = s.values[i] ?? 0
                    if (v <= 0) return null
                    const x = cx - groupW / 2 + si * (barW + GAP)
                    const y = yOf(v)
                    return (
                      <path
                        key={s.key}
                        d={barPath(x, y, barW, innerH - y)}
                        fill={s.color}
                      />
                    )
                  })}
                </g>
              )
            })}

            {/* One sparing direct label: the peak */}
            {labelPeak && peakIndex >= 0 && totals[peakIndex] > 0 && (
              <text
                x={peakIndex * band + band / 2}
                y={yOf(totals[peakIndex]) - 8}
                textAnchor="middle"
                className="tnum"
                fontSize={11}
                fontWeight={600}
                fill="var(--text-primary)"
              >
                {format(totals[peakIndex])}
              </text>
            )}

            {/* X labels */}
            {categories.map((cat, i) => {
              const cx = i * band + band / 2
              return (
                <text
                  key={cat}
                  x={cx}
                  y={innerH + 16}
                  textAnchor={tiltLabels ? 'end' : 'middle'}
                  fontSize={10.5}
                  fill={hovered === i ? 'var(--text-primary)' : 'var(--text-muted)'}
                  fontWeight={hovered === i ? 600 : 400}
                  transform={tiltLabels ? `rotate(-35 ${cx} ${innerH + 16})` : undefined}
                >
                  {cat}
                </text>
              )
            })}

            {/* Full-height hit bands — the reader aims at a month, not at a bar */}
            {categories.map((cat, i) => (
              <rect
                key={`hit-${cat}`}
                x={i * band}
                y={0}
                width={band}
                height={innerH}
                fill="transparent"
                tabIndex={0}
                role="button"
                aria-label={`${cat}: ${fullFmt(totals[i])}`}
                style={{ cursor: 'pointer', outline: 'none' }}
                onMouseMove={(e) => showTip(i, e.clientX)}
                onMouseLeave={() => {
                  setTip(null)
                  setHovered(null)
                }}
                onFocus={() => {
                  const box = wrapRef.current?.getBoundingClientRect()
                  if (box) showTip(i, box.left + M.left + i * band + band / 2)
                }}
                onBlur={() => {
                  setTip(null)
                  setHovered(null)
                }}
              />
            ))}
          </g>
        </svg>
      </div>

      <Tooltip data={tip} container={wrapRef.current?.getBoundingClientRect() ?? null} />
    </div>
  )
}
