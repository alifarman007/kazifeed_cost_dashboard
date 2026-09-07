'use client'

import { MONTHS } from '@/lib/format'
import type { MetaOption } from '@/lib/api'
import { Select } from './Select'

export interface Filters {
  year: number
  /** null = the whole year. */
  month: number | null
  /** '' = every mill. */
  mill: string
}

/**
 * One filter row, above everything it scopes. Every chart, stat and table below
 * re-renders against the same slice, so the numbers always agree.
 */
export function FilterBar({
  filters,
  years,
  mills,
  onChange,
  right,
}: {
  filters: Filters
  years: number[]
  mills: MetaOption[]
  onChange: (f: Filters) => void
  right?: React.ReactNode
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="flex flex-wrap items-end gap-2.5">
        <Select
          label="Year"
          value={String(filters.year)}
          options={years.map((y) => ({ value: String(y), label: String(y) }))}
          onChange={(v) => onChange({ ...filters, year: Number(v) })}
          minWidth={96}
        />
        <Select
          label="Month"
          value={filters.month == null ? 'all' : String(filters.month)}
          options={[
            { value: 'all', label: 'Full year' },
            ...MONTHS.map((m, i) => ({ value: String(i + 1), label: m })),
          ]}
          onChange={(v) => onChange({ ...filters, month: v === 'all' ? null : Number(v) })}
          minWidth={132}
        />
        <Select
          label="Feed mill"
          value={filters.mill}
          options={[
            { value: '', label: 'All mills' },
            ...mills.map((m) => ({ value: m.id, label: m.label })),
          ]}
          onChange={(v) => onChange({ ...filters, mill: v })}
          minWidth={200}
        />
      </div>

      {right && <div className="flex items-end gap-2">{right}</div>}
    </div>
  )
}
