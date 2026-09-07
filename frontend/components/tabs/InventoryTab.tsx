'use client'

import type { Inventory, InventoryTrend, Meta } from '@/lib/api'
import { qs, useApi } from '@/lib/api'
import { MONTHS_SHORT, money, moneyFull, moneyScale, percent, periodLabel } from '@/lib/format'
import { BarChart } from '../charts/BarChart'
import { ColumnChart } from '../charts/ColumnChart'
import { DonutChart } from '../charts/DonutChart'
import { Legend } from '../charts/Legend'
import { TableView } from '../charts/TableView'
import { ChartCard } from '../ui/ChartCard'
import { StatTile } from '../ui/StatTile'
import { ErrorState, LoadingBlock } from '../ui/States'
import type { Filters } from '../ui/FilterBar'

/* Colour follows the bucket, never its rank, so filtering never repaints the
   survivors. The first three slots validate all-pairs in both themes. */
const BUCKETS = [
  { key: 'raw_material', label: 'Raw material', color: 'var(--series-1)' },
  { key: 'packaging', label: 'Packaging material', color: 'var(--series-2)' },
  { key: 'spare_parts', label: 'Spare parts', color: 'var(--series-3)' },
] as const

type BucketKey = (typeof BUCKETS)[number]['key']

const COLOR = Object.fromEntries(BUCKETS.map((b) => [b.key, b.color])) as Record<string, string>

export function InventoryTab({ meta, filters }: { meta: Meta; filters: Filters }) {
  const scope = { year: filters.year, month: filters.month, mill: filters.mill }
  const data = useApi<Inventory>(`/inventory${qs(scope)}`)
  const trend = useApi<InventoryTrend>(
    `/inventory/trend${qs({ year: filters.year, mill: filters.mill })}`
  )

  const period = periodLabel(filters.year, filters.month)
  const d = data.data
  const buckets = d?.buckets ?? []
  const months = trend.data?.months ?? []

  const deltaPct =
    d && d.prev_total != null && d.prev_total > 0
      ? ((d.total - d.prev_total) / d.prev_total) * 100
      : null

  // Raw material dwarfs the other two, so the bucket chart shares one unit while
  // each small-multiple panel scales to its own series.
  const bucketFmt = moneyScale(Math.max(...buckets.map((b) => b.value), 0)).format
  // The KPI row shares the total's unit: four tiles in three different units
  // invite the reader to compare 295 against 57.8 and get it backwards.
  const kpiFmt = moneyScale(d?.total ?? 0).format

  const legendItems = BUCKETS.map((b) => ({ key: b.key, label: b.label, color: b.color }))

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          label="Material consumed"
          value={d ? kpiFmt(d.total) : '—'}
          delta={deltaPct}
          deltaLabel={filters.month == null ? 'vs prev. year' : 'vs prev. month'}
          upIsGood={false}
          hero
          loading={data.loading}
        />
        {BUCKETS.map((b) => (
          <StatTile
            key={b.key}
            label={b.label}
            value={kpiFmt(buckets.find((x) => x.key === b.key)?.value ?? 0)}
            loading={data.loading}
          />
        ))}
      </div>

      {data.error && <ErrorState error={data.error} />}

      {d?.note && (
        <p
          className="m-0 rounded-lg px-3.5 py-2.5 text-[12px] leading-relaxed"
          style={{
            background: 'var(--surface-1)',
            color: 'var(--text-secondary)',
            boxShadow: 'inset 0 0 0 1px var(--border-hairline)',
          }}
        >
          <span aria-hidden>ℹ </span>
          {d.note}
        </p>
      )}

      <div className="grid gap-4 xl:grid-cols-[1.55fr_1fr]">
        <ChartCard
          title="Consumption by category"
          subtitle="Raw material, packaging and spare parts"
          meta={period}
          table={
            <TableView
              caption={`Inventory consumption by category, ${period}`}
              columns={[
                { key: 'bucket', label: 'Category' },
                { key: 'share', label: 'Share', align: 'right' },
                { key: 'value', label: 'Consumed', align: 'right' },
              ]}
              rows={[
                ...buckets.map((b) => ({
                  bucket: { text: b.label, color: COLOR[b.key] },
                  share: { text: percent(b.share) },
                  value: { text: moneyFull(b.value) },
                })),
                { bucket: { text: 'Total' }, share: { text: '100.0%' }, value: { text: moneyFull(d?.total ?? 0) } },
              ]}
            />
          }
          refetching={data.refetching}
        >
          {data.loading ? (
            <LoadingBlock height={210} />
          ) : (
            <BarChart
              data={buckets.map((b) => ({
                key: b.key,
                label: b.label,
                value: b.value,
                sublabel: `${percent(b.share)} of total`,
              }))}
              format={bucketFmt}
              formatFull={moneyFull}
              colorFor={(b) => COLOR[b.key] ?? 'var(--series-1)'}
              labelWidth={168}
            />
          )}
        </ChartCard>

        <ChartCard
          title="Share of consumption"
          meta={period}
          toolbar={
            <Legend
              items={BUCKETS.map((b) => ({
                key: b.key,
                label: b.label,
                color: b.color,
                value: percent(buckets.find((x) => x.key === b.key)?.share ?? 0),
              }))}
            />
          }
          refetching={data.refetching}
        >
          {data.loading ? (
            <LoadingBlock height={210} />
          ) : (
            <div className="flex items-center justify-center py-2">
              <DonutChart
                slices={buckets.map((b) => ({
                  key: b.key,
                  label: b.label,
                  value: b.value,
                  color: COLOR[b.key] ?? 'var(--series-1)',
                }))}
                format={bucketFmt}
                centerLabel="Consumed"
              />
            </div>
          )}
        </ChartCard>
      </div>

      {/* Small multiples: raw material runs ~67x packaging and spares, so one
          shared linear axis would flatten two of the three series into nothing.
          Each panel keeps its own scale, and the shared month axis still lets
          the reader compare shapes. */}
      <ChartCard
        title="Consumption by month"
        subtitle={`Every month of ${filters.year} — each panel on its own scale, so the smaller categories stay readable`}
        meta={filters.mill ? undefined : 'All mills'}
        table={
          <TableView
            caption={`Inventory consumption by month, ${filters.year}`}
            columns={[
              { key: 'month', label: 'Month' },
              { key: 'raw', label: 'Raw material', align: 'right' },
              { key: 'pack', label: 'Packaging', align: 'right' },
              { key: 'spare', label: 'Spare parts', align: 'right' },
              { key: 'total', label: 'Total', align: 'right' },
            ]}
            rows={months.map((m) => ({
              month: { text: MONTHS_SHORT[m.month - 1] + (m.partial ? ' (partial)' : '') },
              raw: { text: m.raw_material != null ? moneyFull(m.raw_material) : '—', color: COLOR.raw_material },
              pack: { text: m.packaging != null ? moneyFull(m.packaging) : '—', color: COLOR.packaging },
              spare: { text: m.spare_parts != null ? moneyFull(m.spare_parts) : '—', color: COLOR.spare_parts },
              total: {
                text: moneyFull((m.raw_material ?? 0) + (m.packaging ?? 0) + (m.spare_parts ?? 0)),
              },
            }))}
          />
        }
        refetching={trend.refetching}
      >
        {trend.loading ? (
          <LoadingBlock height={300} />
        ) : trend.error ? (
          <ErrorState error={trend.error} />
        ) : (
          <div className="grid gap-5 lg:grid-cols-3">
            {BUCKETS.map((b) => (
              <div key={b.key}>
                <div className="mb-1 flex items-center gap-2">
                  <span
                    aria-hidden
                    className="inline-block h-2.5 w-2.5 rounded-[3px]"
                    style={{ background: b.color }}
                  />
                  <span className="text-[12.5px] font-medium" style={{ color: 'var(--text-primary)' }}>
                    {b.label}
                  </span>
                </div>
                <ColumnChart
                  categories={MONTHS_SHORT}
                  series={[
                    {
                      key: b.key,
                      label: b.label,
                      color: b.color,
                      values: months.map((m) => m[b.key as BucketKey] as number | null),
                    },
                  ]}
                  format={
                    moneyScale(
                      Math.max(...months.map((m) => (m[b.key as BucketKey] as number) ?? 0), 0)
                    ).format
                  }
                  formatFull={moneyFull}
                  height={210}
                />
              </div>
            ))}
          </div>
        )}
      </ChartCard>
    </div>
  )
}
