'use client'

import { useMemo, useRef, useState } from 'react'

import { useMeasure } from '@/lib/useMeasure'

import { axisMax, niceTicks } from '@/lib/format'
import { Tooltip, type TooltipData } from './Tooltip'

export interface BarDatum {
  key: string
  label: string
  value: number
  /** Secondary line under the label — product code, mill, unit rate. */
  sublabel?: string
  /** Extra rows appended to this bar's tooltip. */
  detail?: { label: string; value: string }[]
}

interface Props {
  data: BarDatum[]
  /** Formats the value everywhere it appears: cap label, axis, tooltip. */
  format: (v: number) => string
  /** Full-precision formatter for the tooltip. Defaults to `format`. */
  formatFull?: (v: number) => string
  /** One colour for every bar — nominal categories never get a value ramp. */
  color?: string
  /** Per-bar colour, only when each bar is a distinct *entity* with an identity. */
  colorFor?: (d: BarDatum, i: number) => string
  emptyMessage?: string
  /** Width of the label gutter in px. */
  labelWidth?: number
}

const BAR_THICKNESS = 22 // <= 24px: the band always keeps some air
const ROW_HEIGHT = 44
const RANK_W = 18
const GAP = 12
const VALUE_W = 92

/** Left edge of the plot column, matching the row's grid template. */
const plotLeft = (labelWidth: number) => RANK_W + GAP + labelWidth + GAP
/** Right inset of the plot column: the value column plus its gap. */
const PLOT_RIGHT = VALUE_W + GAP

/**
 * Horizontal bars — the right form when categories are many or long-named
 * (feed products carry names like "Broiler Grower Gold Feed (Pellet) Loose").
 *
 * One hue for every bar by default: bar length already encodes magnitude, so
 * shading by value would burn the colour channel on information the chart
 * already shows.
 */
export function BarChart({
  data,
  format,
  formatFull,
  color = 'var(--series-1)',
  colorFor,
  emptyMessage = 'No cost recorded for this period.',
  labelWidth = 208,
}: Props) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const { ref: measureRef, width: outerW } = useMeasure<HTMLDivElement>()
  const [tip, setTip] = useState<TooltipData | null>(null)

  // Replay the entry animation on new data, never on hover. Declared before the
  // early return below — hooks must run unconditionally.
  const dataKey = useMemo(() => data.map((d) => `${d.key}:${d.value}`).join('|'), [data])

  if (!data.length) {
    return (
      <div
        className="flex h-[180px] items-center justify-center rounded-lg text-[13px]"
        style={{ color: 'var(--text-muted)', background: 'var(--surface-sunken)' }}
      >
        {emptyMessage}
      </div>
    )
  }

  const dataMax = Math.max(...data.map((d) => d.value), 0)

  // Tick density follows the available width. Three legs side by side leave a
  // narrow plot, and five money labels there collide into "৳0.2 C৳0.4 C…".
  const plotW = Math.max(outerW - plotLeft(labelWidth) - PLOT_RIGHT, 0)
  // Never below 2: a count of 1 collapses the axis to a lone "0", which tells
  // the reader nothing about the scale the bars are drawn against.
  const tickCount = plotW < 300 ? 2 : plotW < 460 ? 3 : 4

  const max = axisMax(dataMax, tickCount) || 1
  const ticks = niceTicks(max, tickCount)
  const fullFmt = formatFull ?? format

  const show = (e: React.MouseEvent | React.FocusEvent, d: BarDatum, fill: string) => {
    const box = wrapRef.current?.getBoundingClientRect()
    if (!box) return
    const target = (e.currentTarget as HTMLElement).getBoundingClientRect()
    setTip({
      x: ('clientX' in e ? e.clientX : target.left + target.width / 2) - box.left,
      y: target.top + target.height / 2 - box.top,
      title: d.label,
      subtitle: d.sublabel,
      rows: [
        { color: fill, label: 'Cost', value: fullFmt(d.value) },
        ...(d.detail ?? []).map((r) => ({ label: r.label, value: r.value })),
      ],
    })
  }

  return (
    <div ref={wrapRef} className="relative">
      {/* Width probe for tick density — spans the same box as the rows. */}
      <div ref={measureRef} className="pointer-events-none absolute inset-x-0 top-0 h-px" aria-hidden />
      {/* Plot area: rank | label gutter | track | value */}
      <div className="relative">
        {/* Gridlines sit behind the bars, spanning only the track column. */}
        <div
          className="pointer-events-none absolute inset-y-0"
          style={{ left: plotLeft(labelWidth), right: PLOT_RIGHT }}
          aria-hidden
        >
          {ticks.map((t) => (
            <div
              key={t}
              className="absolute inset-y-0 w-px"
              style={{ left: `${(t / max) * 100}%`, background: 'var(--gridline)' }}
            />
          ))}
        </div>

        <ul key={dataKey} className="relative m-0 list-none p-0">
          {data.map((d, i) => {
            const fill = colorFor ? colorFor(d, i) : color
            const pct = max > 0 ? (d.value / max) * 100 : 0
            return (
              <li
                key={d.key}
                className="group grid items-center gap-3"
                style={{
                  gridTemplateColumns: `${RANK_W}px ${labelWidth}px 1fr ${VALUE_W}px`,
                  height: ROW_HEIGHT,
                }}
              >
                {/* Rank — quiet structure, and an anchor for the eye when
                    several bars are nearly the same length. */}
                <div
                  className="tnum text-right text-[11px] tabular-nums transition-colors"
                  style={{ color: 'var(--text-muted)' }}
                  aria-hidden
                >
                  {i + 1}
                </div>

                {/* Label gutter */}
                <div className="min-w-0 pr-1">
                  <div
                    className="truncate text-[12.5px] font-medium leading-tight"
                    style={{ color: 'var(--text-primary)' }}
                    title={d.label}
                  >
                    {d.label}
                  </div>
                  {d.sublabel && (
                    <div
                      className="truncate text-[11px] leading-tight"
                      style={{ color: 'var(--text-muted)' }}
                      title={d.sublabel}
                    >
                      {d.sublabel}
                    </div>
                  )}
                </div>

                {/* Track — the whole row is the hit target, comfortably > 24px */}
                <button
                  type="button"
                  className="group/bar relative flex h-full w-full items-center rounded-md text-left"
                  onMouseMove={(e) => show(e, d, fill)}
                  onMouseLeave={() => setTip(null)}
                  onFocus={(e) => show(e, d, fill)}
                  onBlur={() => setTip(null)}
                  aria-label={`${d.label}: ${fullFmt(d.value)}`}
                >
                  {/* The rail the bar is measured along. Without it a 0.03 Cr
                      bar is a speck floating in white space; with it, every row
                      reads as a full-width measurement that happens to be short. */}
                  <span
                    className="pointer-events-none absolute inset-x-0 transition-colors duration-200 group-hover:[background:var(--bar-track-hover)]"
                    style={{
                      height: BAR_THICKNESS,
                      background: 'var(--bar-track)',
                      // Same geometry as the bar: square where the axis starts,
                      // rounded at the far end.
                      borderRadius: '2px 5px 5px 2px',
                    }}
                    aria-hidden
                  />

                  <span
                    className="kfg-grow-right relative block overflow-hidden transition-[filter] duration-200 group-hover:brightness-[1.06]"
                    style={{
                      animationDelay: `${i * 34}ms`,
                      width: `max(${pct}%, ${d.value > 0 ? '5px' : '0px'})`,
                      height: BAR_THICKNESS,
                      backgroundColor: fill,
                      // Square where it meets the baseline, 4px round at the data end.
                      borderRadius: '2px 5px 5px 2px',
                      // Lift in the bar's own hue — depth without a border, which
                      // would add data-weight ink that isn't data.
                      boxShadow: `0 1px 2px color-mix(in srgb, ${fill} 30%, transparent)`,
                    }}
                  >
                    {/* Sheen across the thickness — cosmetic material, never
                        along the length where it would shade by magnitude. */}
                    <span
                      className="absolute inset-0"
                      style={{ background: 'var(--bar-sheen)' }}
                      aria-hidden
                    />
                  </span>
                </button>

                {/* Direct label — the relief for sub-3:1 slots, always visible */}
                <div
                  className="tnum text-right text-[12.5px] font-semibold tracking-[-0.01em]"
                  style={{ color: 'var(--text-primary)' }}
                >
                  {format(d.value)}
                </div>
              </li>
            )
          })}
        </ul>
      </div>

      {/* Axis */}
      <div
        className="relative mt-1 h-5"
        style={{ marginLeft: plotLeft(labelWidth), marginRight: PLOT_RIGHT }}
        aria-hidden
      >
        <div className="absolute inset-x-0 top-0 h-px" style={{ background: 'var(--baseline)' }} />
        {ticks.map((t) => (
          <span
            key={t}
            className="tnum absolute top-1.5 -translate-x-1/2 whitespace-nowrap text-[10.5px]"
            style={{ left: `${(t / max) * 100}%`, color: 'var(--text-muted)' }}
          >
            {t === 0 ? '0' : format(t)}
          </span>
        ))}
      </div>

      <Tooltip data={tip} container={wrapRef.current?.getBoundingClientRect() ?? null} />
    </div>
  )
}
