/**
 * Number & currency formatting.
 *
 * Kazi Farms is a Bangladeshi group, so money reads in the South Asian
 * numbering system (lakh / crore) by default — ৳33.80 Cr is how a Kazifeed
 * finance user says the number, and 338,034,749 is not.
 */

export const TAKA = '৳' // ৳

const CRORE = 10_000_000
const LAKH = 100_000

/** Compact money for axis ticks, bar caps and stat tiles. */
export function money(value: number | null | undefined, opts: { sign?: boolean } = {}): string {
  if (value == null || Number.isNaN(value)) return '—'
  const sign = value < 0 ? '-' : opts.sign && value > 0 ? '+' : ''
  const abs = Math.abs(value)

  if (abs >= CRORE) return `${sign}${TAKA}${trim(abs / CRORE)} Cr`
  if (abs >= LAKH) return `${sign}${TAKA}${trim(abs / LAKH)} L`
  if (abs >= 1_000) return `${sign}${TAKA}${trim(abs / 1_000)}K`
  return `${sign}${TAKA}${trim(abs)}`
}

/** Full precision with thousands separators — used in the table view. */
export function moneyFull(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return '—'
  return `${TAKA}${value.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`
}

/**
 * One money unit for a whole chart.
 *
 * Auto-compacting each bar independently puts "৳59 Cr" next to "৳13.7 L" in the
 * same column, and the reader has to convert in their head to see that one is
 * 400x the other. A chart picks its unit from its own maximum and sticks to it.
 */
export function moneyScale(max: number): { format: (v: number) => string; unit: string } {
  const abs = Math.abs(max)
  const [div, unit] =
    abs >= CRORE ? [CRORE, 'Cr'] : abs >= LAKH ? [LAKH, 'L'] : abs >= 1_000 ? [1_000, 'K'] : [1, '']

  const digits = div === 1 ? 0 : 2
  return {
    unit,
    format: (v: number) => {
      if (v == null || Number.isNaN(v)) return '—'
      const n = v / div
      // Keep small values legible rather than collapsing them all to "0".
      const d = Math.abs(n) < 1 && n !== 0 ? Math.max(digits, 2) : digits
      const s = n.toLocaleString('en-IN', { maximumFractionDigits: d })
      return unit ? `${TAKA}${s} ${unit}` : `${TAKA}${s}`
    },
  }
}

/** Compact plain number (order counts, generic quantities). */
export function num(value: number | null | undefined, digits = 1): string {
  if (value == null || Number.isNaN(value)) return '—'
  const abs = Math.abs(value)
  const sign = value < 0 ? '-' : ''
  if (abs >= 1_000_000) return `${sign}${trim(abs / 1_000_000, digits)}M`
  if (abs >= 1_000) return `${sign}${trim(abs / 1_000, digits)}K`
  return `${sign}${trim(abs, digits)}`
}

/**
 * Feed weight. The ERP stores kilograms, but a feed mill talks in tonnes —
 * "24,414 t" is the number a plant manager recognises, "2.4 Cr kg" is not.
 */
export function weight(kg: number | null | undefined): string {
  if (kg == null || Number.isNaN(kg)) return '—'
  const t = kg / 1000
  if (Math.abs(t) >= 1000) return `${Math.round(t).toLocaleString('en-IN')} t`
  if (Math.abs(t) >= 1) return `${t.toLocaleString('en-IN', { maximumFractionDigits: 1 })} t`
  return `${Math.round(kg).toLocaleString('en-IN')} kg`
}

export function weightFull(kg: number | null | undefined): string {
  if (kg == null || Number.isNaN(kg)) return '—'
  return `${Math.round(kg).toLocaleString('en-IN')} kg (${(kg / 1000).toLocaleString('en-IN', {
    maximumFractionDigits: 1,
  })} t)`
}

export function numFull(value: number | null | undefined, digits = 0): string {
  if (value == null || Number.isNaN(value)) return '—'
  return value.toLocaleString('en-IN', { maximumFractionDigits: digits })
}

/** Rate per unit — always shown at full precision, these are small numbers. */
export function rate(value: number | null | undefined, unit = 'kg'): string {
  if (value == null || Number.isNaN(value)) return '—'
  return `${TAKA}${value.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}/${unit}`
}

export function percent(value: number | null | undefined, digits = 1): string {
  if (value == null || Number.isNaN(value)) return '—'
  return `${value.toFixed(digits)}%`
}

/** Signed percentage delta, for stat tiles. */
export function delta(value: number | null | undefined, digits = 1): string {
  if (value == null || Number.isNaN(value)) return '—'
  const s = value > 0 ? '+' : ''
  return `${s}${value.toFixed(digits)}%`
}

function trim(n: number, digits = 2): string {
  // 33.80 -> "33.8", 5.00 -> "5", 1284 -> "1,284"
  if (n >= 100) return n.toLocaleString('en-IN', { maximumFractionDigits: 0 })
  const fixed = n.toFixed(n >= 10 ? Math.min(digits, 1) : digits)
  return String(parseFloat(fixed))
}

export const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

export const MONTHS_SHORT = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
]

export function periodLabel(year: number, month: number | null): string {
  return month == null ? `Full year ${year}` : `${MONTHS[month - 1]} ${year}`
}

/**
 * Axis ticks rounded to clean numbers — they carry every value the chart does
 * not directly label, so they must read as 0 / 10 Cr / 20 Cr, never 17.3.
 */
export function niceTicks(max: number, count = 4): number[] {
  if (!Number.isFinite(max) || max <= 0) return [0]
  const raw = max / count
  const mag = Math.pow(10, Math.floor(Math.log10(raw)))
  const norm = raw / mag
  const step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10) * mag
  const ticks: number[] = []
  for (let t = 0; t <= max + step * 0.001; t += step) ticks.push(t)
  return ticks
}

/** The top of the y-scale: the highest nice tick at or above the data max. */
export function axisMax(max: number, count = 4): number {
  const ticks = niceTicks(max, count)
  const top = ticks[ticks.length - 1]
  return top >= max ? top : top + (ticks[1] ?? max)
}
