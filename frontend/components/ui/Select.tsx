'use client'

export interface Option {
  value: string
  label: string
}

/** A native select styled to match the chart chrome — filters are ordinary UI. */
export function Select({
  label,
  value,
  options,
  onChange,
  minWidth = 128,
}: {
  label: string
  value: string
  options: Option[]
  onChange: (v: string) => void
  minWidth?: number
}) {
  return (
    <label className="flex flex-col gap-1">
      <span
        className="text-[10.5px] font-medium uppercase tracking-[0.055em]"
        style={{ color: 'var(--text-muted)' }}
      >
        {label}
      </span>
      <div className="relative">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full cursor-pointer appearance-none rounded-lg py-2 pl-3 pr-8 text-[13px] font-medium transition-colors"
          style={{
            minWidth,
            background: 'var(--surface-1)',
            color: 'var(--text-primary)',
            boxShadow: 'inset 0 0 0 1px var(--border-hairline)',
            border: 'none',
          }}
        >
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <svg
          aria-hidden
          className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2"
          width="10"
          height="6"
          viewBox="0 0 10 6"
          fill="none"
        >
          <path
            d="M1 1l4 4 4-4"
            stroke="var(--text-muted)"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
    </label>
  )
}
