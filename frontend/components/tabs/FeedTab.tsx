'use client'

import { useMemo, useState } from 'react'

import type { FeedProducts, FeedSummary, FeedTrend, Meta } from '@/lib/api'
import { qs, useApi } from '@/lib/api'
import {
  MONTHS_SHORT, money, moneyFull, moneyScale, num, numFull, periodLabel, rate, weight, weightFull,
} from '@/lib/format'
import { BarChart } from '../charts/BarChart'
import { ColumnChart } from '../charts/ColumnChart'
import { LineChart } from '../charts/LineChart'
import { TableView } from '../charts/TableView'
import { ChartCard } from '../ui/ChartCard'
import { StatTile } from '../ui/StatTile'
import { ErrorState, LoadingBlock } from '../ui/States'
import { PillTabs } from '../ui/Tabs'
import type { Filters } from '../ui/FilterBar'

export function FeedTab({ meta, filters }: { meta: Meta; filters: Filters }) {
  const groups = meta.feed_groups
  const [group, setGroup] = useState(groups[0]?.key ?? '')
  const active = groups.find((g) => g.key === group) ?? groups[0]

  const scope = { year: filters.year, month: filters.month, mill: filters.mill }

  const summary = useApi<FeedSummary>(`/feed/summary${qs(scope)}`)
  const products = useApi<FeedProducts>(`/feed/products${qs({ ...scope, group })}`)
  const trend = useApi<FeedTrend>(`/feed/trend${qs({ year: filters.year, mill: filters.mill, group })}`)

  const period = periodLabel(filters.year, filters.month)

  /* ------------------------------------------------------------- stat row */

  const s = summary.data
  const deltaPct =
    s && s.prev_cost != null && s.prev_cost > 0
      ? ((s.total_cost - s.prev_cost) / s.prev_cost) * 100
      : null

  const trendSeries = useMemo(
    () => trend.data?.months.map((m) => m.cost) ?? [],
    [trend.data]
  )

  /* -------------------------------------------------------------- product */

  const bars = useMemo(
    () =>
      (products.data?.rows ?? []).map((r) => ({
        key: r.product_code,
        label: r.product_name,
        value: r.cost,
        sublabel:
          r.product_code === '__others__'
            ? weight(r.qty)
            : `${r.product_code} · ${weight(r.qty)}`,
        detail: [
          { label: 'Quantity', value: weightFull(r.qty) },
          { label: 'Unit cost', value: r.rate != null ? rate(r.rate, r.uom.toLowerCase()) : '—' },
          { label: 'Batches', value: numFull(r.orders) },
        ],
      })),
    [products.data]
  )

  const partialMonth = (trend.data?.months ?? []).find((m) => m.partial && m.cost != null)
  const partialNote = partialMonth
    ? `${MONTHS_SHORT[partialMonth.month - 1]} is still being posted — its bars are a part-month figure, not a drop in output.`
    : null

  // Groups with production in the current scope; the rest are dimmed so a user
  // can see at a glance that a mill simply does not make that feed.
  const producing = new Set((s?.groups ?? []).map((g) => g.key))

  const millName = meta.mills.find((m) => m.id === filters.mill)?.label
  const emptyMessage = `No ${active?.label.toLowerCase() ?? 'feed'} feed produced${
    millName ? ` at ${millName}` : ''
  } in ${period}.`

  const kpiFmt = moneyScale(s?.total_cost ?? 0).format
  const productFmt = moneyScale(Math.max(...bars.map((b) => b.value), 0)).format
  const trendFmt = moneyScale(
    Math.max(...(trend.data?.months ?? []).map((m) => m.cost ?? 0), 0)
  ).format
  const groupFmt = moneyScale(Math.max(...(s?.groups ?? []).map((g) => g.cost), 0)).format

  const productTable = (
    <TableView
      caption={`${active?.label ?? 'Feed'} cost by product, ${period}`}
      columns={[
        { key: 'code', label: 'Code' },
        { key: 'name', label: 'Product' },
        { key: 'qty', label: 'Quantity', align: 'right' },
        { key: 'rate', label: 'Unit cost', align: 'right' },
        { key: 'cost', label: 'Total cost', align: 'right' },
      ]}
      rows={(products.data?.rows ?? []).map((r) => ({
        code: { text: r.product_code, color: 'var(--series-1)' },
        name: { text: r.product_name },
        qty: { text: weightFull(r.qty) },
        rate: { text: r.rate != null ? rate(r.rate, r.uom.toLowerCase()) : '—' },
        cost: { text: moneyFull(r.cost) },
      }))}
    />
  )

  /* ---------------------------------------------------------------- trend */

  const trendTable = (
    <TableView
      caption={`Monthly ${active?.label ?? 'feed'} cost, ${filters.year}`}
      columns={[
        { key: 'month', label: 'Month' },
        { key: 'qty', label: 'Quantity', align: 'right' },
        { key: 'rate', label: 'Avg unit cost', align: 'right' },
        { key: 'cost', label: 'Total cost', align: 'right' },
      ]}
      rows={(trend.data?.months ?? []).map((m) => ({
        month: { text: MONTHS_SHORT[m.month - 1], color: 'var(--series-1)' },
        qty: { text: weight(m.qty) },
        rate: { text: m.rate != null ? rate(m.rate) : '—' },
        cost: { text: m.cost != null ? moneyFull(m.cost) : '—' },
      }))}
    />
  )

  return (
    <div className="flex flex-col gap-4">
      {/* KPI row */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          index={0}
          label="Total feed cost"
          value={s ? kpiFmt(s.total_cost) : '—'}
          delta={deltaPct}
          deltaLabel={filters.month == null ? 'vs prev. year' : 'vs prev. month'}
          upIsGood={false}
          hero
          loading={summary.loading}
        />
        <StatTile
          index={1}
          label="Volume produced"
          value={s ? weight(s.total_qty) : '—'}
          loading={summary.loading}
        />
        <StatTile
          index={2}
          label="Average unit cost"
          value={s?.avg_rate != null ? rate(s.avg_rate) : '—'}
          loading={summary.loading}
        />
        <StatTile
          index={3}
          label={`${active?.label ?? 'Group'} this period`}
          value={products.data ? kpiFmt(products.data.total_cost) : '—'}
          trend={trendSeries}
          loading={products.loading}
        />
      </div>

      {summary.error && <ErrorState error={summary.error} />}

      {/* Group sub-tabs */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
        <PillTabs
          items={groups.map((g) => ({
            key: g.key,
            label: g.label,
            empty: producing.size > 0 && !producing.has(g.key),
          }))}
          value={group}
          onChange={setGroup}
          ariaLabel="Feed group"
        />
        <span className="text-[12px]" style={{ color: 'var(--text-muted)' }}>
          {s?.groups.length ?? 0} feed groups in production
        </span>
      </div>

      {/* Product cost — the main chart */}
      <ChartCard
        index={0}
        title={`${active?.label ?? 'Feed'} cost by product`}
        subtitle="Loose (bulk) production output, valued at batch cost"
        meta={period}
        table={productTable}
        refetching={products.refetching}
      >
        {products.loading ? (
          <LoadingBlock height={320} />
        ) : products.error ? (
          <ErrorState error={products.error} />
        ) : (
          <>
            <BarChart
              data={bars}
              format={productFmt}
              formatFull={moneyFull}
              colorFor={(b) =>
                b.key === '__others__' ? 'var(--series-mute)' : 'var(--series-1)'
              }
              emptyMessage={emptyMessage}
            />
            {products.data?.basis_note && (
              <p className="m-0 mt-3 text-[11.5px] leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                {products.data.basis_note}
              </p>
            )}
            {(products.data?.truncated ?? 0) > 0 && (
              <p className="m-0 mt-3 text-[11.5px]" style={{ color: 'var(--text-muted)' }}>
                The {products.data?.truncated} smallest products are grouped into “Others”
                so the chart still totals correctly. Each one is listed in the table view.
              </p>
            )}
          </>
        )}
      </ChartCard>

      {/* Monthly trend — cost and volume side by side rather than on two y-axes.
          Kazi uses standard costing, so unit cost barely moves (a ~0.3 % band
          across a year); volume is the variable that actually explains the cost
          line, and it deserves its own chart rather than a second scale. */}
      <div className="grid gap-4 xl:grid-cols-2">
        <ChartCard
          index={1}
          title={`${active?.label ?? 'Feed'} cost by month`}
          subtitle={`Every month of ${filters.year}`}
          meta={filters.mill ? undefined : 'All mills'}
          table={trendTable}
          refetching={trend.refetching}
        >
          {trend.loading ? (
            <LoadingBlock height={270} />
          ) : trend.error ? (
            <ErrorState error={trend.error} />
          ) : (
            <ColumnChart
              categories={MONTHS_SHORT}
              series={[
                {
                  key: 'cost',
                  label: 'Feed cost',
                  color: 'var(--series-1)',
                  values: (trend.data?.months ?? []).map((m) => m.cost),
                },
              ]}
              format={trendFmt}
              formatFull={moneyFull}
              labelPeak
              height={270}
            />
          )}
          {partialNote && <PartialNote text={partialNote} />}
        </ChartCard>

        <ChartCard
          index={2}
          title={`${active?.label ?? 'Feed'} volume by month`}
          subtitle="Tonnage produced — what drives the cost line"
          meta={filters.mill ? undefined : 'All mills'}
          refetching={trend.refetching}
        >
          {trend.loading ? (
            <LoadingBlock height={270} />
          ) : (
            <ColumnChart
              categories={MONTHS_SHORT}
              series={[
                {
                  key: 'qty',
                  label: 'Volume',
                  color: 'var(--series-3)',
                  values: (trend.data?.months ?? []).map((m) =>
                    m.qty == null ? null : m.qty / 1000
                  ),
                },
              ]}
              format={(v) => `${num(v)} t`}
              formatFull={(v) => `${numFull(v)} tonnes`}
              labelPeak
              height={270}
            />
          )}
          {partialNote && <PartialNote text={partialNote} />}
        </ChartCard>
      </div>

      {/* Unit cost gets its own card and a zoomed axis — on a zero baseline a
          0.3 % spread renders as a dead-flat line. */}
      <ChartCard
        index={3}
        title={`${active?.label ?? 'Feed'} unit cost by month`}
        subtitle="Cost per kilogram of feed produced"
        meta={`${filters.year}`}
        refetching={trend.refetching}
      >
        {trend.loading ? (
          <LoadingBlock height={220} />
        ) : (
          <LineChart
            categories={MONTHS_SHORT}
            series={[
              {
                key: 'rate',
                label: 'Unit cost',
                color: 'var(--series-1)',
                values: (trend.data?.months ?? []).map((m) => m.rate),
              },
            ]}
            format={(v) => rate(v)}
            height={220}
            emptyMessage={emptyMessage}
          />
        )}
      </ChartCard>

      {/* Group comparison */}
      <ChartCard
        index={4}
        title="Cost across feed groups"
        subtitle="Every feed category produced in this period"
        meta={period}
        table={
          <TableView
            caption={`Feed cost by group, ${period}`}
            columns={[
              { key: 'group', label: 'Feed group' },
              { key: 'qty', label: 'Quantity', align: 'right' },
              { key: 'cost', label: 'Total cost', align: 'right' },
            ]}
            rows={(s?.groups ?? []).map((g) => ({
              group: { text: g.label, color: 'var(--series-1)' },
              qty: { text: weightFull(g.qty) },
              cost: { text: moneyFull(g.cost) },
            }))}
          />
        }
        refetching={summary.refetching}
      >
        {summary.loading ? (
          <LoadingBlock height={220} />
        ) : (
          <BarChart
            data={(s?.groups ?? []).map((g) => ({
              key: g.key,
              label: g.label,
              value: g.cost,
              sublabel: weight(g.qty),
            }))}
            format={groupFmt}
            formatFull={moneyFull}
            color="var(--series-1)"
            labelWidth={168}
          />
        )}
      </ChartCard>
    </div>
  )
}

function PartialNote({ text }: { text: string }) {
  return (
    <p className="m-0 mt-2 text-[11px]" style={{ color: 'var(--text-muted)' }}>
      {text}
    </p>
  )
}
