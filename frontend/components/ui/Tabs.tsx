'use client'

export interface TabItem {
  key: string
  label: string
  /** Optional trailing count/value chip. */
  badge?: string
  /** No data in the current scope — still selectable, but visibly quiet. */
  empty?: boolean
}

/** Primary navigation: the three cost domains. */
export function MainTabs({
  items,
  value,
  onChange,
}: {
  items: TabItem[]
  value: string
  onChange: (k: string) => void
}) {
  return (
    <div
      role="tablist"
      aria-label="Cost domain"
      className="flex items-stretch gap-1 overflow-x-auto"
      style={{ borderBottom: '1px solid var(--border-hairline)' }}
    >
      {items.map((it) => {
        const active = it.key === value
        return (
          <button
            key={it.key}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(it.key)}
            className="relative whitespace-nowrap px-4 pb-3 pt-2 text-[14px] font-semibold transition-colors"
            style={{ color: active ? 'var(--text-primary)' : 'var(--text-muted)' }}
          >
            {it.label}
            <span
              aria-hidden
              className="absolute inset-x-2 bottom-[-1px] h-[2px] rounded-full transition-opacity"
              style={{ background: 'var(--accent)', opacity: active ? 1 : 0 }}
            />
          </button>
        )
      })}
    </div>
  )
}

/** Secondary navigation: feed species groups inside the Feed Cost tab. */
export function PillTabs({
  items,
  value,
  onChange,
  ariaLabel = 'Section',
}: {
  items: TabItem[]
  value: string
  onChange: (k: string) => void
  ariaLabel?: string
}) {
  return (
    <div role="tablist" aria-label={ariaLabel} className="flex flex-wrap items-center gap-1.5">
      {items.map((it) => {
        const active = it.key === value
        return (
          <button
            key={it.key}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(it.key)}
            title={it.empty ? `${it.label}: nothing produced in this period` : undefined}
            className="flex items-center gap-2 rounded-full px-3.5 py-1.5 text-[12.5px] font-medium transition-all"
            style={
              active
                ? {
                    background: 'var(--accent-wash)',
                    color: 'var(--accent)',
                    boxShadow: 'inset 0 0 0 1px var(--accent-ring)',
                  }
                : {
                    background: 'var(--surface-1)',
                    color: it.empty ? 'var(--text-muted)' : 'var(--text-secondary)',
                    boxShadow: 'inset 0 0 0 1px var(--border-hairline)',
                    opacity: it.empty ? 0.6 : 1,
                  }
            }
          >
            {it.label}
            {it.badge && (
              <span
                className="tnum rounded-full px-1.5 py-px text-[10.5px] font-semibold"
                style={{
                  background: active ? 'var(--accent)' : 'var(--surface-sunken)',
                  color: active ? 'var(--surface-1)' : 'var(--text-muted)',
                }}
              >
                {it.badge}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
