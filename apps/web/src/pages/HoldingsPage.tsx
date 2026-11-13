import { Fragment, useMemo, useState } from 'react'
import { aggregateHoldings, type HoldingRow } from '@zp/core'
import { AppChrome } from '../AppChrome.tsx'
import { useData } from '../data.tsx'
import { inr, inrSigned, pct, pctSigned } from '../fmt.ts'
import { Kpi, Panel, SlicerButton, td, th } from '../ui.tsx'

type SortKey = 'symbol' | 'value' | 'pnl' | 'pnlPct' | 'weight'
const tone = (n: number) => (n < 0 ? 'text-red-600' : n > 0 ? 'text-green-700' : '')
const desk = 'hidden sm:table-cell'

export default function HoldingsPage() {
  const { views } = useData()
  const [mode, setMode] = useState<'combined' | 'accounts'>('combined')
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'value', dir: -1 })
  const sorted = (rows: HoldingRow[]) => [...rows].sort((a, b) =>
    sort.key === 'symbol' ? sort.dir * -a.symbol.localeCompare(b.symbol) : sort.dir * (a[sort.key] - b[sort.key]))
  const combined = useMemo(() => aggregateHoldings(views), [views])

  const invested = combined.reduce((t, r) => t + r.invested, 0)
  const value = combined.reduce((t, r) => t + r.value, 0)
  const top5 = combined.slice(0, 5).reduce((t, r) => t + r.weight, 0)   // combined is value-sorted
  const ltValue = combined.reduce((t, r) => t + (r.quantity ? r.value * (r.longTermQty / r.quantity) : 0), 0)

  const head = (key: SortKey, label: string, extra = '') => (
    <th className={`${th} ${extra}`}>
      <button type="button" className="font-semibold" onClick={() => setSort(s => ({ key, dir: s.key === key ? (-s.dir as 1 | -1) : -1 }))}>
        {label}{sort.key === key ? (sort.dir === -1 ? ' ↓' : ' ↑') : ''}
      </button>
    </th>
  )

  const rowsFor = (rows: HoldingRow[]) => sorted(rows).map(h => (
    <tr key={h.symbol} className="odd:bg-gray-50">
      <td className={td}>
        <div className="font-medium">{h.symbol}</div>
        <div className="text-xs text-gray-500">{inr(h.quantity)} × {h.avgPrice.toFixed(2)}</div>
      </td>
      <td className={`${td} ${desk}`}>{h.price.toFixed(2)}</td><td className={`${td} ${desk}`}>{inr(h.invested)}</td>
      <td className={td}>{inr(h.value)}</td>
      <td className={`${td} ${tone(h.pnl)}`}>{inrSigned(h.pnl)}</td>
      <td className={`${td} ${tone(h.pnlPct)}`}>{pctSigned(h.pnlPct, 0)}</td>
      <td className={td}>{pct(h.weight)}</td>
      <td className={`${td} ${desk}`}>{h.dividends ? inr(h.dividends) : '–'}</td>
      <td className={`${td} ${desk}`}>{h.quantity ? pct((h.longTermQty / h.quantity) * 100, 0) : '–'}</td>
    </tr>
  ))

  const header = (
    <thead><tr>
      {head('symbol', 'Stock')}
      <th className={`${th} ${desk}`}>Price</th><th className={`${th} ${desk}`}>Invested</th>
      {head('value', 'Value')}{head('pnl', 'P&L')}{head('pnlPct', 'P&L %')}{head('weight', 'Weight')}
      <th className={`${th} ${desk}`}>Dividends</th><th className={`${th} ${desk}`}>Long-term</th>
    </tr></thead>
  )

  if (combined.length === 0) return <AppChrome title="Holdings" controls><p className="rounded-lg border border-gray-300 p-6 text-center text-sm text-gray-500">No holdings yet. Add a holdings XLSX on the Import page.</p></AppChrome>

  return (
    <AppChrome title="Holdings" controls>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Kpi label="Holdings" value={String(combined.length)} hint={`Market value ${inr(value)}`} />
        <Kpi label="Unrealised P&L" value={inrSigned(value - invested)} hint={invested ? pctSigned((value / invested - 1) * 100, 0) + ' on cost' : undefined} tone={value >= invested ? 'good' : 'bad'} />
        <Kpi label="Top 5 weight" value={pct(top5, 0)} hint="Share of market value in the five biggest holdings" />
        <Kpi label="Long-term share" value={pct(value ? (ltValue / value) * 100 : 0, 0)} hint="Share of value held for more than a year" />
      </div>

      {views.length > 1 && (
        <div className="flex gap-2">
          <SlicerButton selected={mode === 'combined'} onClick={() => setMode('combined')}>Combined</SlicerButton>
          <SlicerButton selected={mode === 'accounts'} onClick={() => setMode('accounts')}>By account</SlicerButton>
        </div>
      )}

      <Panel title={mode === 'combined' || views.length === 1 ? 'Holdings' : 'Holdings by account'}>
        <div className="max-h-[70vh] overflow-auto">
          <table className="w-full border-collapse">
            {header}
            <tbody>
              {mode === 'combined' || views.length === 1 ? rowsFor(combined) : views.map(v => (
                <Fragment key={v.clientId}>
                  <tr><td colSpan={8} className={`${td} bg-gray-100 font-semibold text-primary`}>{v.name}</td></tr>
                  {rowsFor(v.holdings)}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </AppChrome>
  )
}
