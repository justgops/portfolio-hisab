import { Fragment, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { MagnifyingGlassIcon } from '@heroicons/react/24/outline'
import { aggregateHoldings, checkLedger, termSplit, type HoldingRow } from '@zp/core'
import { AppChrome } from '../AppChrome.tsx'
import { useData } from '../data.tsx'
import { FreshnessReminder } from '../Freshness.tsx'
import { compact, compactSigned, inr, inrSigned, pct, pctSigned } from '../fmt.ts'
import { Kpi, Metric, SlicerButton, td, tdTotal, th } from '../ui.tsx'

type SortKey = 'value' | 'pnl' | 'pnlPct' | 'weight' | 'symbol'
const SORTS: { key: SortKey; label: string }[] = [
  { key: 'value', label: 'Current value' }, { key: 'pnl', label: 'P&L amount' }, { key: 'pnlPct', label: 'P&L %' },
  { key: 'weight', label: 'Weight' }, { key: 'symbol', label: 'Name A-Z' },
]
const tone = (n: number) => (n < 0 ? 'text-red-600' : n > 0 ? 'text-green-700' : 'text-gray-800')
const select = 'h-10 rounded-lg border border-gray-300 bg-white px-2 text-base text-gray-800 sm:h-9 sm:text-sm'
const notice = 'rounded-lg border border-amber-400 bg-amber-50 px-3 py-2 text-sm text-amber-900'

/** Home page: portfolio headline, XIRR and hurdle, then Holdings / Accounts / Diversification tabs. */
export default function PortfolioPage() {
  const { accounts, chosen, views, total, filters, setFilters } = useData()
  const navigate = useNavigate()
  const [tab, setTab] = useState<'holdings' | 'accounts' | 'diversification'>('holdings')
  const [group, setGroup] = useState<'all' | 'account'>('all')
  const [sort, setSort] = useState<SortKey>('value')
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState<string | null>(null)
  const ratePct = filters.ratePct
  const rate = ratePct / 100

  const combined = useMemo(() => aggregateHoldings(views), [views])
  const cost = combined.reduce((t, r) => t + r.invested, 0)
  const unrealised = total.market - cost
  const terms = useMemo(() => termSplit(combined), [combined])
  const asOn = useMemo(() => chosen.map(a => a.holdingsAsOn).filter((d): d is string => !!d).sort(), [chosen])
  const noHoldings = useMemo(() => chosen.filter(a => a.holdingsAsOn === null).map(a => a.name), [chosen])
  const badLedgers = useMemo(() => chosen.filter(a => !checkLedger(a.ledger).ok).map(a => a.name), [chosen])

  const xirrCell = (x: number | null) => (x === null ? '–' : pct(x * 100))
  const xirrClass = (x: number | null) => (x === null ? '' : x >= rate ? 'text-green-700' : 'text-red-600')
  const openSchedule = (id: string) => { setFilters({ ...filters, selected: id }); navigate('/schedule') }

  const order = (rows: HoldingRow[]) => {
    const q = query.trim().toLowerCase()
    return rows.filter(r => !q || r.symbol.toLowerCase().includes(q))
      .sort((a, b) => sort === 'symbol' ? a.symbol.localeCompare(b.symbol) : b[sort] - a[sort])
  }
  const perAccount = (symbol: string) => views.flatMap(v => { const h = v.holdings.find(x => x.symbol === symbol); return h ? [{ name: v.name, h }] : [] })

  if (accounts.length === 0) {
    return (
      <AppChrome title="Portfolio">
        <p className="rounded-lg border border-gray-300 p-6 text-center text-sm text-gray-600">
          No accounts yet. Go to <a href="/import" className="font-semibold text-primary underline" onClick={e => { e.preventDefault(); navigate('/import') }}>Import & backup</a> and add your Console ledger and holdings files.
        </p>
      </AppChrome>
    )
  }

  const row = (h: HoldingRow, key: string) => {
    const isOpen = open === key
    return (
      <div key={key} className="border-b border-gray-200">
        <button type="button" onClick={() => setOpen(isOpen ? null : key)} className="block w-full px-3 py-3 text-left" aria-expanded={isOpen}>
          <div className="flex items-center justify-between">
            <span className="text-base font-bold uppercase text-gray-800">{h.symbol}</span>
            <span className="text-gray-400">{isOpen ? '⌃' : '⌄'}</span>
          </div>
          <div className="mt-1 grid grid-cols-3 gap-2 text-sm">
            <div><div className="text-xs text-gray-500">Qty.</div><div className="tabular-nums">{inr(h.quantity)}</div></div>
            <div><div className="text-xs text-gray-500">Current Value</div><div className="tabular-nums">₹{compact(h.value)}</div></div>
            <div className="text-right"><div className="text-xs text-gray-500">P&L</div>
              <div className={`font-semibold tabular-nums ${tone(h.pnl)}`}>{compactSigned(h.pnl)} ({pctSigned(h.pnlPct, 2)})</div></div>
          </div>
        </button>
        {isOpen && (
          <div className="space-y-2 bg-gray-50 px-3 pb-3 text-sm">
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-4">
              <Detail label="Avg. price" value={h.avgPrice.toFixed(2)} />
              <Detail label="Last close" value={h.price.toFixed(2)} />
              <Detail label="Cost" value={`₹${inr(h.invested)}`} />
              <Detail label="Weight" value={pct(h.weight)} />
              <Detail label="Dividends" value={h.dividends ? `₹${inr(h.dividends)}` : '–'} />
              <Detail label="Long-term" value={h.quantity ? pct((h.longTermQty / h.quantity) * 100, 0) : '–'} />
            </div>
            {views.length > 1 && (
              <div>
                <div className="text-xs font-semibold text-primary">By account</div>
                {perAccount(h.symbol).map(({ name, h: x }) => (
                  <div key={name} className="flex justify-between tabular-nums"><span>{name} · {inr(x.quantity)}</span><span className={tone(x.pnl)}>₹{compact(x.value)} ({compactSigned(x.pnl)})</span></div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    )
  }

  const list = group === 'all' || views.length === 1
    ? order([...combined]).map(h => row(h, h.symbol))
    : views.map(v => (
      <div key={v.clientId}>
        <div className="bg-gray-100 px-3 py-2 text-sm font-semibold text-primary">{v.name} · ₹{compact(v.holdings.reduce((t, h) => t + h.value, 0))}</div>
        {order([...v.holdings]).map(h => row(h, `${v.clientId}:${h.symbol}`))}
      </div>
    ))

  const top = combined.slice(0, 10)
  const top1 = combined[0]?.weight ?? 0
  const top5 = combined.slice(0, 5).reduce((t, r) => t + r.weight, 0)
  const effective = combined.length ? 1 / combined.reduce((t, r) => t + (r.weight / 100) ** 2, 0) : 0

  return (
    <AppChrome title="Portfolio" controls>
      <FreshnessReminder />
      {noHoldings.length > 0 && <p className={notice}>No holdings file for {noHoldings.join(', ')}, so its market value counts as 0 and the gain is understated. Add its holdings XLSX on the Import page.</p>}
      {badLedgers.length > 0 && <p className={notice}>Ledger for {badLedgers.join(', ')} has missing rows, so the investment figures may be wrong. See the Accounts page.</p>}

      <section className="overflow-hidden rounded-xl border border-gray-300 bg-white">
        <div className="border-b border-gray-200 px-3 py-4 text-center">
          <div className="text-sm text-gray-600">Current Value</div>
          <div className="text-3xl font-bold tabular-nums text-gray-800">₹{inr(total.value)}</div>
          <div className="text-xs text-gray-500">Holdings ₹{inr(total.market)} + cash ₹{inr(total.cash)}</div>
        </div>
        <div className="flex items-center justify-between px-4 py-3">
          <div>
            <div className="text-sm text-gray-600">Invested Amount</div>
            <div className="text-lg font-bold tabular-nums">₹{inr(total.totalInvestment)}</div>
            <div className="text-xs text-gray-500" title="What the same pay-ins and payouts would be worth today if they had earned the hurdle rate a year, compounded each 31 March (see Investment schedule)">
              ₹{inr(total.netInvestment)} with {ratePct}% interest
            </div>
          </div>
          <div className="text-right"><div className="text-sm text-gray-600">Total P&L</div>
            <div className={`text-lg font-bold tabular-nums ${tone(total.gain)}`}>{compactSigned(total.gain)} ({pctSigned(total.gainPct, 2)})</div></div>
        </div>
      </section>

      <div className="grid grid-cols-3 gap-2">
        <Kpi label="XIRR" value={xirrCell(total.xirr)} hint={`Annualised return, compared with the ${ratePct}% hurdle`} tone={total.xirr === null ? undefined : total.xirr >= rate ? 'good' : 'bad'} />
        <Kpi label="Dividends" value={inr(total.dividends)} hint="Received; included in total P&L, hurdle gap and XIRR" />
        <Kpi label={`Over ${ratePct}% hurdle`} value={inrSigned(total.hurdleGap)} hint="Value now + dividends − what your invested money would be worth at the hurdle rate" tone={total.hurdleGap >= 0 ? 'good' : 'bad'} />
      </div>

      <section className="rounded-lg border border-gray-300 bg-white px-3 py-3" title="Quantities Zerodha marks as held over a year (taxed as long-term when sold) versus the rest">
        <div className="mb-1 flex items-baseline justify-between">
          <h2 className="text-sm font-semibold text-primary">Holding period</h2>
          <span className="text-xs text-gray-500">{pct(terms.ltShare, 0)} long-term by value</span>
        </div>
        <div className="flex h-2.5 overflow-hidden rounded bg-gray-100" role="img" aria-label={`${pct(terms.ltShare, 0)} long-term, ${pct(100 - terms.ltShare, 0)} short-term`}>
          <div className="bg-green-600" style={{ width: `${terms.ltShare}%` }} />
          <div className="bg-amber-500" style={{ width: `${100 - terms.ltShare}%` }} />
        </div>
        <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4">
          <Metric label="Long-term value" value={`₹${compact(terms.ltValue)}`} />
          <Metric label="Short-term value" value={`₹${compact(terms.stValue)}`} />
          <Metric label="Long-term gain" value={compactSigned(terms.ltGain)} negative={terms.ltGain < 0} />
          <Metric label="Short-term gain" value={compactSigned(terms.stGain)} negative={terms.stGain < 0} />
        </div>
      </section>

      <div className="flex gap-2 overflow-x-auto">
        <SlicerButton selected={tab === 'holdings'} onClick={() => setTab('holdings')}>Holdings</SlicerButton>
        <SlicerButton selected={tab === 'accounts'} onClick={() => setTab('accounts')}>Accounts</SlicerButton>
        <SlicerButton selected={tab === 'diversification'} onClick={() => setTab('diversification')}>Diversification</SlicerButton>
      </div>

      {tab === 'holdings' && (
        <section className="overflow-hidden rounded-lg border border-gray-300 bg-white">
          <div className="border-b border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-600">
            Holdings as of {asOn.length ? (asOn[0] === asOn.at(-1) ? asOn[0] : `${asOn[0]} to ${asOn.at(-1)}`) : 'no file'}, valued at the last close.
            Cost of the shares you hold: ₹{inr(cost)}, unrealised <span className={tone(unrealised)}>{inrSigned(unrealised)}</span>.
            P&L on each stock below is against its cost, not against your invested amount.
          </div>
          <div className="flex flex-wrap items-center gap-2 border-b border-gray-200 px-3 py-2">
            {views.length > 1 && (
              <label className="flex items-center gap-1 text-sm text-gray-600">Group by
                <select className={select} value={group} onChange={e => setGroup(e.target.value as 'all' | 'account')}>
                  <option value="all">All</option><option value="account">Account</option>
                </select>
              </label>
            )}
            <label className="flex items-center gap-1 text-sm text-gray-600">Sort
              <select className={select} value={sort} onChange={e => setSort(e.target.value as SortKey)}>
                {SORTS.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
              </select>
            </label>
            <div className="relative ml-auto min-w-32 flex-1 sm:max-w-56">
              <MagnifyingGlassIcon className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Search" aria-label="Search holdings" className={`${select} w-full pl-8`} />
            </div>
          </div>
          {combined.length === 0 ? <p className="p-6 text-center text-sm text-gray-500">No holdings yet. Add a holdings XLSX on the Import page.</p> : list}
        </section>
      )}

      {tab === 'accounts' && (
      <section className="overflow-hidden rounded-lg border border-gray-300 bg-white">
        {/* phones: one card per account */}
        <div className="divide-y divide-gray-200 sm:hidden">
          {views.map(v => (
            <button key={v.clientId} type="button" onClick={() => openSchedule(v.clientId)} className="block w-full px-3 py-2 text-left">
              <div className="mb-1 flex items-center justify-between">
                <span className="text-sm font-bold text-primary">{v.name} ›</span>
                <span className={`text-sm font-bold ${xirrClass(v.xirr)}`}>XIRR {xirrCell(v.xirr)}</span>
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                <Metric label="Invested" value={inr(v.totalInvestment)} /><Metric label="Value now" value={inr(v.value)} />
                <Metric label="Total gain" value={inrSigned(v.gain)} negative={v.gain < 0} /><Metric label={`Over ${ratePct}% hurdle`} value={inrSigned(v.hurdleGap)} negative={v.hurdleGap < 0} />
                <Metric label="F&O net" value={inrSigned(v.fnoNet)} negative={v.fnoNet < 0} /><Metric label="Cash share" value={pct(v.cashPct)} />
              </div>
            </button>
          ))}
        </div>

        {/* larger screens: table; a row opens that account's year-by-year schedule */}
        <div className="hidden overflow-x-auto sm:block">
          <table className="w-full border-collapse">
            <thead><tr>
              <th className={th}>Account</th><th className={th}>Invested</th><th className={th}>Value now</th><th className={th}>Total gain</th>
              <th className={th}>XIRR</th><th className={th}>Over {ratePct}% hurdle</th><th className={th}>F&amp;O net</th><th className={th}>Cash share</th>
            </tr></thead>
            <tbody>
              {views.map(v => (
                <Fragment key={v.clientId}>
                  <tr className="cursor-pointer border-t border-gray-200 hover:bg-gray-50" onClick={() => openSchedule(v.clientId)}>
                    <td className={`${td} font-semibold text-primary`}>{v.name} ›</td>
                    <td className={td}>{inr(v.totalInvestment)}</td><td className={td}>{inr(v.value)}</td>
                    <td className={`${td} ${tone(v.gain)}`}>{inrSigned(v.gain)} <span className="text-xs text-gray-500">{pctSigned(v.gainPct, 0)}</span></td>
                    <td className={`${td} font-semibold ${xirrClass(v.xirr)}`}>{xirrCell(v.xirr)}</td>
                    <td className={`${td} ${tone(v.hurdleGap)}`}>{inrSigned(v.hurdleGap)}</td>
                    <td className={`${td} ${tone(v.fnoNet)}`}>{inrSigned(v.fnoNet)}</td><td className={td}>{pct(v.cashPct)}</td>
                  </tr>
                </Fragment>
              ))}
              {views.length > 1 && (
                <tr>
                  <td className={tdTotal}>All accounts</td><td className={tdTotal}>{inr(total.totalInvestment)}</td><td className={tdTotal}>{inr(total.value)}</td>
                  <td className={`${tdTotal} ${tone(total.gain)}`}>{inrSigned(total.gain)} <span className="text-xs font-normal text-gray-500">{pctSigned(total.gainPct, 0)}</span></td>
                  <td className={`${tdTotal} ${xirrClass(total.xirr)}`}>{xirrCell(total.xirr)}</td>
                  <td className={`${tdTotal} ${tone(total.hurdleGap)}`}>{inrSigned(total.hurdleGap)}</td>
                  <td className={`${tdTotal} ${tone(total.fnoNet)}`}>{inrSigned(total.fnoNet)}</td><td className={tdTotal}>{pct(total.cashPct)}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
      )}

      {tab === 'diversification' && (
        <section className="space-y-3 rounded-lg border border-gray-300 bg-white p-3">
          <div className="grid grid-cols-3 gap-2 text-center">
            <Detail label="Holdings" value={String(combined.length)} center />
            <Detail label="Biggest holding" value={pct(top1, 0)} center />
            <Detail label="Top 5 weight" value={pct(top5, 0)} center />
          </div>
          <p className="text-sm text-gray-600">Equivalent to about <b>{effective.toFixed(1)}</b> equally sized holdings. The closer to {combined.length}, the more evenly spread.</p>
          <div className="space-y-2">
            {top.map(h => (
              <div key={h.symbol}>
                <div className="flex justify-between text-sm"><span className="font-medium">{h.symbol}</span><span className="tabular-nums">{pct(h.weight)}</span></div>
                <div className="h-2 rounded bg-gray-100"><div className="h-2 rounded bg-primary" style={{ width: `${Math.min(100, h.weight)}%` }} /></div>
              </div>
            ))}
          </div>
        </section>
      )}

      <details className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-600">
        <summary className="cursor-pointer select-none font-semibold text-gray-800">How these are calculated</summary>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li><b>Invested</b>: money moved between your bank and Zerodha (pay-ins minus payouts) from the ledger, plus any other capital you added on the Accounts page. With <b>Equity &amp; F&amp;O only</b> on, mutual fund purchases paid from the Zerodha account are taken out, because mutual funds are never counted in Value now. Switch it off to see every bank transfer counted (the old Power BI style).</li>
          <li><b>Value now</b>: holdings at previous close plus the ledger cash balance. Mutual funds are not included.</li>
          <li><b>Total gain</b>: value now + dividends received − invested. It mixes realised results (profits already taken out as cash or sitting in the account) and unrealised ones (holdings above cost). The unrealised part alone is shown on the Holdings tab.</li>
          <li><b>XIRR</b>: annualised return on every pay-in and payout, with dividends as money received, ending with value now. Green when it beats the hurdle.</li>
          <li><b>Over hurdle</b>: total gain minus the {ratePct}% a year your invested money would have earned elsewhere. In other words value now + dividends − what the same pay-ins and payouts would be worth at {ratePct}% (see Investment schedule). Realised and unrealised results both count; it is not an unrealised figure.</li>
          <li><b>F&amp;O net</b>: net F&amp;O obligations booked in the ledger, before charges.</li>
          <li><b>Cash share</b>: cash as a share of value now. Idle cash earns nothing against the hurdle.</li>
        </ul>
      </details>
    </AppChrome>
  )
}

function Detail({ label, value, center }: { label: string; value: string; center?: boolean }) {
  return <div className={center ? 'text-center' : ''}><div className="text-xs text-gray-500">{label}</div><div className="font-semibold tabular-nums text-gray-800">{value}</div></div>
}
