'use client'

import type { Logistics, LogisticsLeg, LogisticsTrend, Meta } from '@/lib/api'
import { qs, useApi } from '@/lib/api'
import { MONTHS_SHORT, money, moneyFull, moneyScale, percent, periodLabel } from '@/lib/format'
import { BarChart } from '../charts/BarChart'
import { ColumnChart } from '../charts/ColumnChart'
import { Legend } from '../charts/Legend'
import { TableView } from '../charts/TableView'
import { ChartCard } from '../ui/ChartCard'
import { StatTile } from '../ui/StatTile'
import { ErrorState, LoadingBlock } from '../ui/States'
import type { Filters } from '../ui/FilterBar'

/** Fixed order, so a leg's bars never reshuffle between periods. */
const LINES: { key: keyof LogisticsLeg; label: string }[] = [
  { key: 'transport', label: 'Transport' },
  { key: 'loading_unloading', label: 'Loading & unloading' },
  { key: 'clearing_port', label: 'Clearing & port' },
  { key: 'custom_duty', label: 'Custom duty' },
  { key: 'other', label: 'Other handling' },
]

/* Colour follows the leg, never its size — filtering to one mill must not
   repaint the survivors. Slots 1-3 validate all-pairs in both themes. */
const LEG_COLOR = {
  inbound: 'var(--series-1)',
  outbound: 'var(--series-2)',
  internal: 'var(--series-3)',
} as const

type LegKey = keyof typeof LEG_COLOR

const LEGS: { key: LegKey; title: string; subtitle: string }[] = [
  { key: 'inbound', title: 'Inbound', subtitle: 'Moving raw material into the mills' },
  { key: 'outbound', title: 'Outbound', subtitle: 'Delivering finished feed' },
  { key: 'internal', title: 'At mill', subtitle: 'Gate wages covering both directions' },
]

export function LogisticsTab({ meta, filters }: { meta: Meta; filters: Filters }) {
  const scope = { year: filters.year, month: filters.month, mill: filters.mill }
  const data = useApi<Logistics>(`/logistics${qs(scope)}`)
  const trend = useApi<LogisticsTrend>(
    `/logistics/trend${qs({ year: filters.year, mill: filters.mill })}`
  )

  const period = periodLabel(filters.year, filters.month)
  const d = data.data
  const months = trend.data?.months ?? []

  // One unit across all three legs, so "Inbound 6.6 Cr" and "At mill 0.54 Cr"
  // sit on the same mental scale instead of reading as 6.6 vs 54.
  const legFmt = moneyScale(
    Math.max(...LEGS.map((l) => d?.[l.key]?.total ?? 0), 0)
  ).format
  const trendFmt = moneyScale(
    Math.max(...months.flatMap((m) => [m.inbound ?? 0, m.outbound ?? 0, m.internal ?? 0]), 0)
  ).format

  // Always-shown lines: the ones the business asks for by name. A zero here is
  // information ("no duty was charged"), not a row to hide.
  const ALWAYS = new Set<keyof LogisticsLeg>(['transport', 'loading_unloading', 'custom_duty'])
  const visibleLines = LINES.filter(
    (l) => ALWAYS.has(l.key) || LEGS.some((leg) => (d?.[leg.key]?.[l.key] ?? 0) !== 0)
  )

  const kpiFmt = moneyScale(d?.grand_total ?? 0).format

  const legBars = (leg: LogisticsLeg | undefined) =>
    visibleLines.map((l) => ({
      key: String(l.key),
      label: l.label,
      value: leg?.[l.key] ?? 0,
      sublabel:
        leg && leg.total > 0
          ? `${percent(((leg[l.key] as number) / leg.total) * 100)} of leg`
          : undefined,
    }))

  const legTable = (leg: LogisticsLeg | undefined, name: string, color: string) => (
    <TableView
      caption={`${name} logistics cost, ${period}`}
      columns={[
        { key: 'line', label: 'Cost line' },
        { key: 'share', label: 'Share', align: 'right' },
        { key: 'amount', label: 'Amount', align: 'right' },
      ]}
      rows={[
        ...LINES.map((l) => ({
          line: { text: l.label, color },
          share: {
            text: leg && leg.total > 0 ? percent(((leg[l.key] as number) / leg.total) * 100) : '—',
          },
          amount: { text: moneyFull(leg?.[l.key] ?? 0) },
        })),
        { line: { text: 'Total' }, share: { text: '100.0%' }, amount: { text: moneyFull(leg?.total ?? 0) } },
      ]}
    />
  )

  const legendItems = LEGS.map((l) => ({
    key: l.key,
    label: l.title,
    color: LEG_COLOR[l.key],
  }))

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          index={0}
          label="Total logistics cost"
          value={d ? kpiFmt(d.grand_total) : '—'}
          hero
          loading={data.loading}
        />
        {LEGS.map((l, i) => (
          <StatTile
            key={l.key}
            index={i + 1}
            label={l.title}
            value={d ? kpiFmt(d[l.key].total) : '—'}
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

      <div className="grid gap-4 xl:grid-cols-3">
        {LEGS.map((l, i) => (
          <ChartCard
            key={l.key}
            index={i}
            title={l.title}
            subtitle={l.subtitle}
            meta={period}
            table={legTable(d?.[l.key], l.title, LEG_COLOR[l.key])}
            refetching={data.refetching}
          >
            {data.loading ? (
              <LoadingBlock height={210} />
            ) : (
              <div className="flex h-full flex-col">
                <BarChart
                  data={legBars(d?.[l.key])}
                  format={legFmt}
                  formatFull={moneyFull}
                  color={LEG_COLOR[l.key]}
                  labelWidth={150}
                  emptyMessage={`No ${l.title.toLowerCase()} cost in this period.`}
                />
                <div className="mt-auto">
                  <TotalRow label={`Total ${l.title.toLowerCase()}`} value={d?.[l.key].total ?? 0} />
                </div>
              </div>
            )}
          </ChartCard>
        ))}
      </div>

      <ChartCard
        index={3}
        title="Logistics cost by month"
        subtitle={`Every month of ${filters.year}`}
        meta={filters.mill ? undefined : 'All mills'}
        toolbar={<Legend items={legendItems} />}
        table={
          <TableView
            caption={`Logistics cost by month and leg, ${filters.year}`}
            columns={[
              { key: 'month', label: 'Month' },
              { key: 'inbound', label: 'Inbound', align: 'right' },
              { key: 'outbound', label: 'Outbound', align: 'right' },
              { key: 'internal', label: 'At mill', align: 'right' },
              { key: 'total', label: 'Total', align: 'right' },
            ]}
            rows={months.map((m) => ({
              month: { text: MONTHS_SHORT[m.month - 1] },
              inbound: { text: m.inbound != null ? moneyFull(m.inbound) : '—', color: LEG_COLOR.inbound },
              outbound: { text: m.outbound != null ? moneyFull(m.outbound) : '—', color: LEG_COLOR.outbound },
              internal: { text: m.internal != null ? moneyFull(m.internal) : '—', color: LEG_COLOR.internal },
              total: { text: moneyFull((m.inbound ?? 0) + (m.outbound ?? 0) + (m.internal ?? 0)) },
            }))}
          />
        }
        refetching={trend.refetching}
      >
        {trend.loading ? (
          <LoadingBlock height={310} />
        ) : trend.error ? (
          <ErrorState error={trend.error} />
        ) : (
          <ColumnChart
            categories={MONTHS_SHORT}
            series={LEGS.map((l) => ({
              key: l.key,
              label: l.title,
              color: LEG_COLOR[l.key],
              values: months.map((m) => m[l.key]),
            }))}
            format={trendFmt}
            formatFull={moneyFull}
            mode="grouped"
            height={310}
          />
        )}
      </ChartCard>
    </div>
  )
}

function TotalRow({ label, value }: { label: string; value: number }) {
  return (
    <div
      className="mt-4 flex items-baseline justify-between pt-3"
      style={{ borderTop: '1px solid var(--border-strong)' }}
    >
      <span className="text-[12.5px] font-medium" style={{ color: 'var(--text-secondary)' }}>
        {label}
      </span>
      <span className="text-[15px] font-semibold" style={{ color: 'var(--text-primary)' }}>
        {moneyFull(value)}
      </span>
    </div>
  )
}
