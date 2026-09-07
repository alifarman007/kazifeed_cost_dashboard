'use client'

import { useTheme } from '@/lib/theme'

const OPTIONS = [
  { key: 'light' as const, label: 'Light', icon: '☀' },
  { key: 'system' as const, label: 'System', icon: '◐' },
  { key: 'dark' as const, label: 'Dark', icon: '☾' },
]

export function ThemeToggle() {
  const { mode, setMode } = useTheme()

  return (
    <div
      className="flex items-center rounded-lg p-0.5"
      style={{ background: 'var(--surface-sunken)' }}
      role="radiogroup"
      aria-label="Colour theme"
    >
      {OPTIONS.map((o) => {
        const active = mode === o.key
        return (
          <button
            key={o.key}
            role="radio"
            aria-checked={active}
            title={o.label}
            onClick={() => setMode(o.key)}
            className="rounded-[7px] px-2 py-1 text-[12px] leading-none transition-colors"
            style={
              active
                ? {
                    background: 'var(--surface-1)',
                    color: 'var(--text-primary)',
                    boxShadow: '0 1px 2px rgba(0,0,0,0.08)',
                  }
                : { color: 'var(--text-muted)' }
            }
          >
            <span aria-hidden>{o.icon}</span>
            <span className="sr-only">{o.label}</span>
          </button>
        )
      })}
    </div>
  )
}
