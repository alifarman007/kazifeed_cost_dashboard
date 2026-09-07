'use client'

import { useRef, useState } from 'react'

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
const ROW_HEIGHT = 40

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
  const [tip, setTip] = useState<TooltipData | null>(null)

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
  const max = axisMax(dataMax) || 1
  const ticks = niceTicks(max)
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
      {/* Plot area: label gutter | track | value */}
      <div className="relative">
        {/* Gridlines sit behind the bars, spanning only the track column. */}
        <div
          className="pointer-events-none absolute inset-y-0"
          style={{ left: labelWidth, right: 84 }}
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

        <ul className="relative m-0 list-none p-0">
          {data.map((d, i) => {
            const fill = colorFor ? colorFor(d, i) : color
            const pct = max > 0 ? (d.value / max) * 100 : 0
            return (
              <li
                key={d.key}
                className="group grid items-center gap-3"
                style={{
                  gridTemplateColumns: `${labelWidth}px 1fr 84px`,
                  height: ROW_HEIGHT,
                }}
              >
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
                  className="relative flex h-full w-full items-center rounded-md text-left transition-colors"
                  onMouseMove={(e) => show(e, d, fill)}
                  onMouseLeave={() => setTip(null)}
                  onFocus={(e) => show(e, d, fill)}
                  onBlur={() => setTip(null)}
                  aria-label={`${d.label}: ${fullFmt(d.value)}`}
                >
                  <span
                    className="block transition-[width] duration-500 ease-out"
                    style={{
                      width: `max(${pct}%, ${d.value > 0 ? '3px' : '0px'})`,
                      height: BAR_THICKNESS,
                      background: fill,
                      // Square where it meets the baseline, 4px round at the data end.
                      borderRadius: '2px 4px 4px 2px',
                    }}
                  />
                  <span
                    className="pointer-events-none absolute inset-0 rounded-md opacity-0 transition-opacity group-hover:opacity-100"
                    style={{ background: 'var(--accent-wash)' }}
                    aria-hidden
                  />
                </button>

                {/* Direct label — the relief for sub-3:1 slots, always visible */}
                <div
                  className="tnum text-right text-[12px] font-semibold"
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
        style={{ marginLeft: labelWidth, marginRight: 84 }}
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
