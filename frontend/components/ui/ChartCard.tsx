'use client'

import { useId, useState } from 'react'

interface Props {
  title: string
  /** Right-hand period / scope note. */
  meta?: string
  subtitle?: string
  /** Rendered under the header, above the plot — legends live here. */
  toolbar?: React.ReactNode
  children: React.ReactNode
  /** When given, the card offers a chart/table switch. */
  table?: React.ReactNode
  className?: string
  /** Holds the previous render at reduced opacity instead of flashing a skeleton. */
  refetching?: boolean
  /** Stagger index, so a column of cards arrives in reading order. */
  index?: number
}

export function ChartCard({
  title,
  meta,
  subtitle,
  toolbar,
  children,
  table,
  className = '',
  refetching = false,
  index = 0,
}: Props) {
  const [view, setView] = useState<'chart' | 'table'>('chart')
  const id = useId()

  return (
    // The fade-up runs on mount only — i.e. when a tab is opened. Changing a
    // filter re-renders in place, so only the marks re-animate, not the frame.
    <section
      className={`card kfg-fade-up flex flex-col overflow-hidden ${className}`}
      style={{ animationDelay: `${Math.min(index, 6) * 45}ms` }}
    >
      <header className="flex flex-wrap items-start justify-between gap-3 px-5 pb-3 pt-4">
        <div className="min-w-0">
          <h3
            className="m-0 text-[14px] font-semibold leading-tight"
            style={{ color: 'var(--text-primary)' }}
          >
            {title}
          </h3>
          {subtitle && (
            <p className="m-0 mt-1 text-[12px] leading-tight" style={{ color: 'var(--text-muted)' }}>
              {subtitle}
            </p>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-3">
          {meta && (
            <span className="text-[12px] tnum" style={{ color: 'var(--text-muted)' }}>
              {meta}
            </span>
          )}
          {table && (
            <div
              className="flex items-center rounded-lg p-0.5"
              style={{ background: 'var(--surface-sunken)' }}
              role="tablist"
              aria-label={`${title} view`}
            >
              {(['chart', 'table'] as const).map((v) => (
                <button
                  key={v}
                  role="tab"
                  aria-selected={view === v}
                  aria-controls={`${id}-${v}`}
                  onClick={() => setView(v)}
                  className="rounded-[7px] px-2.5 py-1 text-[11.5px] font-medium capitalize transition-colors"
                  style={
                    view === v
                      ? {
                          background: 'var(--surface-1)',
                          color: 'var(--text-primary)',
                          boxShadow: '0 1px 2px rgba(0,0,0,0.08)',
                        }
                      : { color: 'var(--text-muted)' }
                  }
                >
                  {v}
                </button>
              ))}
            </div>
          )}
        </div>
      </header>

      {toolbar && <div className="px-5 pb-3">{toolbar}</div>}

      <div className={`flex-1 px-5 pb-5 ${refetching ? 'is-refetching' : ''}`}>
        {view === 'chart' ? (
          <div id={`${id}-chart`}>{children}</div>
        ) : (
          <div id={`${id}-table`}>{table}</div>
        )}
      </div>
    </section>
  )
}
