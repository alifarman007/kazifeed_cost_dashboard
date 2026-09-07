'use client'

/** A 12-point trend for a stat tile: de-emphasis line, accent end-dot. */
export function Sparkline({
  values,
  width = 76,
  height = 26,
  className = '',
}: {
  values: (number | null)[]
  width?: number
  height?: number
  className?: string
}) {
  const pts = values.map((v) => (v == null ? null : v))
  const real = pts.filter((v): v is number => v != null)
  if (real.length < 2) return null

  const min = Math.min(...real)
  const max = Math.max(...real)
  const span = max - min || 1
  const pad = 3

  const xOf = (i: number) => (i / (pts.length - 1)) * (width - pad * 2) + pad
  const yOf = (v: number) => height - pad - ((v - min) / span) * (height - pad * 2)

  let d = ''
  let started = false
  pts.forEach((v, i) => {
    if (v == null) {
      started = false
      return
    }
    d += `${started ? 'L' : 'M'}${xOf(i).toFixed(1)},${yOf(v).toFixed(1)} `
    started = true
  })

  const lastIdx = pts.map((v, i) => (v == null ? -1 : i)).filter((i) => i >= 0).pop()!
  const lastVal = pts[lastIdx] as number

  return (
    <svg width={width} height={height} className={className} aria-hidden focusable="false">
      <path d={d.trim()} fill="none" stroke="var(--series-mute)" strokeWidth={2}
            strokeLinecap="round" strokeLinejoin="round" pathLength={1} className="kfg-draw" />
      {/* Current period in the accent, with a surface ring so it stays legible */}
      <g className="kfg-pop-in" style={{ animationDelay: '620ms' }}>
        <circle cx={xOf(lastIdx)} cy={yOf(lastVal)} r={4} fill="var(--surface-1)" />
        <circle cx={xOf(lastIdx)} cy={yOf(lastVal)} r={2.6} fill="var(--series-1)" />
      </g>
    </svg>
  )
}
