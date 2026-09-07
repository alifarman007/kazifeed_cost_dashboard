'use client'

import type { ApiError } from '@/lib/api'

export function ErrorState({ error, onRetry }: { error: ApiError; onRetry?: () => void }) {
  return (
    <div
      className="flex flex-col items-start gap-2 rounded-xl px-4 py-3.5"
      style={{
        background: 'var(--surface-1)',
        boxShadow: 'inset 0 0 0 1px var(--border-hairline)',
      }}
      role="alert"
    >
      <span className="flex items-center gap-2 text-[13px] font-semibold" style={{ color: 'var(--status-critical)' }}>
        <span aria-hidden>⚠</span>
        Could not load this data
      </span>
      <p className="m-0 text-[12.5px]" style={{ color: 'var(--text-secondary)' }}>
        {error.detail || error.message}
      </p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="mt-1 rounded-lg px-3 py-1.5 text-[12px] font-medium"
          style={{ background: 'var(--accent-wash)', color: 'var(--accent)' }}
        >
          Try again
        </button>
      )}
    </div>
  )
}

export function EmptyState({ message }: { message: string }) {
  return (
    <div
      className="flex items-center justify-center rounded-lg px-4 py-12 text-[13px]"
      style={{ color: 'var(--text-muted)', background: 'var(--surface-sunken)' }}
    >
      {message}
    </div>
  )
}

/** A quiet placeholder that keeps the card's height while the first load runs. */
export function LoadingBlock({ height = 280 }: { height?: number }) {
  return (
    <div
      className="flex animate-pulse items-center justify-center rounded-lg text-[12.5px]"
      style={{ height, background: 'var(--surface-sunken)', color: 'var(--text-muted)' }}
    >
      Loading…
    </div>
  )
}
