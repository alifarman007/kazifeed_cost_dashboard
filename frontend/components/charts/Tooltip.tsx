'use client'

import { useLayoutEffect, useRef, useState } from 'react'

export interface TooltipRow {
  /** Series colour for the line-key. Omit for a plain row. */
  color?: string
  label: string
  value: string
  /** Optional dimmer trailing note, e.g. a share or a unit rate. */
  note?: string
}

export interface TooltipData {
  x: number
  y: number
  title: string
  subtitle?: string
  rows: TooltipRow[]
}

/**
 * A floating readout anchored to the pointer.
 *
 * Values lead and labels follow — the reader already knows which series they
 * are pointing at and wants the number. Labels come from the API, so they are
 * inserted as text nodes by React, never as HTML.
 */
export function Tooltip({ data, container }: { data: TooltipData | null; container: DOMRect | null }) {
  const ref = useRef<HTMLDivElement>(null)
  const [offset, setOffset] = useState({ dx: 0, dy: 0 })

  useLayoutEffect(() => {
    if (!data || !ref.current || !container) return
    const box = ref.current.getBoundingClientRect()
    const pad = 12

    // Flip to the other side of the pointer when we'd overflow the container.
    let dx = 14
    if (data.x + dx + box.width > container.width - pad) dx = -box.width - 14

    let dy = -box.height / 2
    if (data.y + dy < pad) dy = pad - data.y
    if (data.y + dy + box.height > container.height - pad) {
      dy = container.height - pad - box.height - data.y
    }
    setOffset({ dx, dy })
  }, [data, container])

  if (!data) return null

  return (
    <div
      ref={ref}
      role="tooltip"
      className="kfg-fade-in pointer-events-none absolute z-30 min-w-[168px] max-w-[280px] rounded-xl px-3 py-2.5"
      style={{
        left: data.x,
        top: data.y,
        transform: `translate(${offset.dx}px, ${offset.dy}px)`,
        background: 'var(--surface-1)',
        border: '1px solid var(--border-strong)',
        boxShadow: 'var(--shadow-pop)',
      }}
    >
      <div className="text-[12px] font-semibold leading-tight" style={{ color: 'var(--text-primary)' }}>
        {data.title}
      </div>
      {data.subtitle && (
        <div className="mt-0.5 text-[11px] leading-tight" style={{ color: 'var(--text-muted)' }}>
          {data.subtitle}
        </div>
      )}

      <div className="mt-2 flex flex-col gap-1.5">
        {data.rows.map((row, i) => (
          <div key={i} className="flex items-baseline justify-between gap-4">
            <span className="flex min-w-0 items-center gap-2">
              {row.color && (
                // A short stroke, not a filled box — at tooltip density a box is
                // data-weight ink doing a label's job.
                <span
                  aria-hidden
                  className="inline-block h-[2px] w-3 shrink-0 rounded-full"
                  style={{ background: row.color }}
                />
              )}
              <span className="truncate text-[11.5px]" style={{ color: 'var(--text-secondary)' }}>
                {row.label}
              </span>
            </span>
            <span className="flex shrink-0 items-baseline gap-1.5">
              <span
                className="tnum text-[12.5px] font-semibold"
                style={{ color: 'var(--text-primary)' }}
              >
                {row.value}
              </span>
              {row.note && (
                <span className="tnum text-[10.5px]" style={{ color: 'var(--text-muted)' }}>
                  {row.note}
                </span>
              )}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
