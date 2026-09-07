'use client'

export interface LegendItem {
  key: string
  label: string
  color: string
  /** Optional value shown beside the label — legends double as a readout. */
  value?: string
}

/**
 * Always present for two or more series: identity must never rest on colour
 * matching alone. A single series gets no legend — the card title already
 * names what is plotted, and a one-swatch box just restates it.
 *
 * The mark shape mirrors the chart: a rect for bars and areas, a stroke for
 * lines.
 */
export function Legend({
  items,
  mark = 'rect',
}: {
  items: LegendItem[]
  mark?: 'rect' | 'line'
}) {
  if (items.length < 2) return null

  return (
    <ul className="m-0 flex flex-wrap items-center gap-x-5 gap-y-2 p-0">
      {items.map((it) => (
        <li key={it.key} className="flex list-none items-center gap-2">
          <span
            aria-hidden
            className="inline-block shrink-0"
            style={
              mark === 'line'
                ? { width: 14, height: 2, borderRadius: 2, background: it.color }
                : { width: 10, height: 10, borderRadius: 3, background: it.color }
            }
          />
          <span className="text-[12px]" style={{ color: 'var(--text-secondary)' }}>
            {it.label}
          </span>
          {it.value && (
            <span
              className="tnum text-[12px] font-semibold"
              style={{ color: 'var(--text-primary)' }}
            >
              {it.value}
            </span>
          )}
        </li>
      ))}
    </ul>
  )
}
