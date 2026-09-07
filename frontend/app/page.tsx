'use client'

import { useEffect, useState } from 'react'

import type { Meta } from '@/lib/api'
import { useApi } from '@/lib/api'
import { FeedTab } from '@/components/tabs/FeedTab'
import { InventoryTab } from '@/components/tabs/InventoryTab'
import { LogisticsTab } from '@/components/tabs/LogisticsTab'
import { FilterBar, type Filters } from '@/components/ui/FilterBar'
import { Header } from '@/components/ui/Header'
import { ErrorState, LoadingBlock } from '@/components/ui/States'
import { MainTabs } from '@/components/ui/Tabs'

const DOMAINS = [
  { key: 'feed', label: 'Feed Cost' },
  { key: 'logistics', label: 'Logistics' },
  { key: 'inventory', label: 'Inventory' },
]

export default function Page() {
  const meta = useApi<Meta>('/meta')
  const [domain, setDomain] = useState('feed')
  const [filters, setFilters] = useState<Filters | null>(null)

  // Seed the filters from whatever the database actually has once meta lands.
  useEffect(() => {
    if (meta.data && !filters) {
      setFilters({
        year: meta.data.default_year,
        month: meta.data.default_month,
        mill: '',
      })
    }
  }, [meta.data, filters])

  return (
    <div className="min-h-screen">
      <Header subtitle="Feed production · Logistics · Inventory" />

      <main className="mx-auto max-w-[1440px] px-6 pb-16 pt-5">
        {meta.error ? (
          <ErrorState error={meta.error} onRetry={() => location.reload()} />
        ) : !meta.data || !filters ? (
          <LoadingBlock height={420} />
        ) : (
          <div className="flex flex-col gap-5">
            {/* One filter row, above everything it scopes */}
            <FilterBar
              filters={filters}
              years={meta.data.years}
              mills={meta.data.mills}
              onChange={setFilters}
            />

            <MainTabs items={DOMAINS} value={domain} onChange={setDomain} />

            <div className="pt-1">
              {domain === 'feed' && <FeedTab meta={meta.data} filters={filters} />}
              {domain === 'logistics' && <LogisticsTab meta={meta.data} filters={filters} />}
              {domain === 'inventory' && <InventoryTab meta={meta.data} filters={filters} />}
            </div>

            <footer
              className="flex flex-wrap items-center justify-between gap-2 pt-3 text-[11.5px]"
              style={{ color: 'var(--text-muted)', borderTop: '1px solid var(--border-hairline)' }}
            >
              <span>
                Source: Kazi Farms iDempiere · amounts in {meta.data.currency} (
                {meta.data.currency_symbol})
              </span>
              <span className="tnum">
                Data {meta.data.data_range.min} — {meta.data.data_range.max}
              </span>
            </footer>
          </div>
        )}
      </main>
    </div>
  )
}
