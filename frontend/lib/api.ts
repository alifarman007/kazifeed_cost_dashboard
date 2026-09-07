'use client'

import useSWR from 'swr'

/* ------------------------------------------------------------------ types */

export interface MetaOption {
  id: string
  label: string
}

export interface FeedGroup {
  key: string
  label: string
  category_ids: number[]
}

export interface Meta {
  currency: string
  currency_symbol: string
  years: number[]
  default_year: number
  default_month: number
  mills: MetaOption[]
  feed_groups: FeedGroup[]
  inventory_buckets: MetaOption[]
  logistics_categories: MetaOption[]
  data_range: { min: string; max: string }
  generated_at: string
}

export interface FeedProductRow {
  product_code: string
  product_name: string
  uom: string
  qty: number
  cost: number
  rate: number | null
  orders: number
  mills: number
}

export interface FeedProducts {
  period: { year: number; month: number | null }
  group: string
  /** How the number is built, and what it deliberately leaves out. */
  basis_note: string
  total_cost: number
  total_qty: number
  avg_rate: number | null
  rows: FeedProductRow[]
  truncated: number
}

export interface MonthPoint {
  month: number
  [k: string]: number | null
}

export interface FeedTrend {
  year: number
  group: string
  months: {
    month: number
    cost: number | null
    qty: number | null
    rate: number | null
    /** The running month is only partly posted. */
    partial: boolean
  }[]
}

export interface FeedSummary {
  period: { year: number; month: number | null }
  total_cost: number
  prev_cost: number | null
  total_qty: number
  avg_rate: number | null
  groups: { key: string; label: string; cost: number; qty: number }[]
}

export interface LogisticsLeg {
  transport: number
  /** Booked jointly in the ledger — never split into two lines. */
  loading_unloading: number
  custom_duty: number
  clearing_port: number
  other: number
  total: number
}

export interface Logistics {
  period: { year: number; month: number | null }
  inbound: LogisticsLeg
  outbound: LogisticsLeg
  /** At-mill wages covering both raw-material unloading and feed loading. */
  internal: LogisticsLeg
  grand_total: number
  /** Recoverable AIT/VAT on imports, excluded from the total. */
  recoverable_taxes: number
  available: Record<string, boolean>
  note?: string
}

export interface LogisticsTrend {
  year: number
  months: {
    month: number
    inbound: number | null
    outbound: number | null
    internal: number | null
  }[]
}

export interface InventoryBucket {
  key: string
  label: string
  value: number
  share: number
}

export interface Inventory {
  period: { year: number; month: number | null }
  basis: 'stock_value' | 'consumption'
  /** The current calendar month is still being posted. */
  partial: boolean
  note: string
  buckets: InventoryBucket[]
  total: number
  prev_total: number | null
}

export interface InventoryTrend {
  year: number
  basis: string
  months: {
    month: number
    raw_material: number | null
    packaging: number | null
    spare_parts: number | null
    partial: boolean
  }[]
}

/* ---------------------------------------------------------------- fetcher */

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly detail?: string
  ) {
    super(message)
  }
}

async function fetcher<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { accept: 'application/json' } })
  if (!res.ok) {
    let detail: string | undefined
    try {
      detail = (await res.json())?.detail
    } catch {
      /* body wasn't JSON — the status alone will have to do */
    }
    throw new ApiError(`Request failed (${res.status})`, res.status, detail)
  }
  return res.json() as Promise<T>
}

/** Build a query string, dropping empty values so the API sees clean params. */
export function qs(params: Record<string, string | number | null | undefined>): string {
  const sp = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v === null || v === undefined || v === '') continue
    sp.set(k, String(v))
  }
  const s = sp.toString()
  return s ? `?${s}` : ''
}

const SWR_OPTS = {
  revalidateOnFocus: false,
  keepPreviousData: true, // hold the previous render — no skeleton flash
  shouldRetryOnError: false,
}

export function useApi<T>(path: string | null) {
  const { data, error, isLoading, isValidating } = useSWR<T>(
    path ? `/api${path}` : null,
    fetcher<T>,
    SWR_OPTS
  )
  return {
    data,
    error: error as ApiError | undefined,
    loading: isLoading,
    refetching: isValidating && !isLoading,
  }
}
