'use client'

/**
 * The WCAG-clean twin of every chart.
 *
 * Three light-mode series slots sit below 3:1 against the surface, and the
 * documented relief for that is visible labels *or* a table view — so every
 * chart card ships this. It is also the answer to "a tooltip must never be the
 * only way to read a value".
 */
export function TableView({
  columns,
  rows,
  caption,
}: {
  columns: { key: string; label: string; align?: 'left' | 'right' }[]
  rows: Record<string, { text: string; color?: string }>[]
  caption?: string
}) {
  if (!rows.length) {
    return (
      <p className="py-6 text-center text-[13px]" style={{ color: 'var(--text-muted)' }}>
        No rows for this period.
      </p>
    )
  }

  return (
    <div className="max-h-[420px] overflow-auto">
      <table className="w-full border-collapse text-[12.5px]">
        {caption && <caption className="sr-only">{caption}</caption>}
        <thead className="sticky top-0 z-10">
          <tr style={{ background: 'var(--surface-1)' }}>
            {columns.map((c) => (
              <th
                key={c.key}
                scope="col"
                className={`whitespace-nowrap px-3 py-2 font-semibold ${
                  c.align === 'right' ? 'text-right' : 'text-left'
                }`}
                style={{
                  color: 'var(--text-secondary)',
                  borderBottom: '1px solid var(--border-strong)',
                }}
              >
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              {columns.map((c) => {
                const cell = r[c.key]
                return (
                  <td
                    key={c.key}
                    className={`px-3 py-2 ${c.align === 'right' ? 'tnum text-right' : 'text-left'}`}
                    style={{
                      color: 'var(--text-primary)',
                      borderBottom: '1px solid var(--gridline)',
                    }}
                  >
                    <span className="flex items-center gap-2" style={{ justifyContent: c.align === 'right' ? 'flex-end' : undefined }}>
                      {cell?.color && (
                        <span
                          aria-hidden
                          className="inline-block h-2.5 w-2.5 shrink-0 rounded-[3px]"
                          style={{ background: cell.color }}
                        />
                      )}
                      {cell?.text ?? '—'}
                    </span>
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
