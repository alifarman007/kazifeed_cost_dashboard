'use client'

import { ThemeToggle } from './ThemeToggle'

export function Header({ subtitle }: { subtitle?: string }) {
  return (
    <header
      className="sticky top-0 z-40 backdrop-blur-md"
      style={{
        background: 'color-mix(in srgb, var(--page-plane) 88%, transparent)',
        borderBottom: '1px solid var(--border-hairline)',
      }}
    >
      <div className="mx-auto flex max-w-[1440px] items-center justify-between gap-4 px-6 py-3.5">
        <div className="flex items-center gap-3">
          <Mark />
          <div className="leading-tight">
            <h1 className="m-0 text-[15px] font-semibold" style={{ color: 'var(--text-primary)' }}>
              Kazifeed Cost Dashboard
            </h1>
            {subtitle && (
              <p className="m-0 text-[11.5px]" style={{ color: 'var(--text-muted)' }}>
                {subtitle}
              </p>
            )}
          </div>
        </div>

        <ThemeToggle />
      </div>
    </header>
  )
}

/** A small wheat/feed glyph — enough identity without a logo file. */
function Mark() {
  return (
    <span
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px]"
      style={{ background: 'var(--accent-wash)', boxShadow: 'inset 0 0 0 1px var(--accent-ring)' }}
      aria-hidden
    >
      <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
        <path
          d="M10 17V7"
          stroke="var(--accent)"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
        <path
          d="M10 8.5c0-2 1.3-3.6 3.2-4.2.3 2.2-.8 4-3.2 4.2ZM10 8.5c0-2-1.3-3.6-3.2-4.2C6.5 6.5 7.6 8.3 10 8.5ZM10 13c0-2 1.3-3.6 3.2-4.2.3 2.2-.8 4-3.2 4.2ZM10 13c0-2-1.3-3.6-3.2-4.2C6.5 11 7.6 12.8 10 13Z"
          fill="var(--accent)"
        />
      </svg>
    </span>
  )
}
