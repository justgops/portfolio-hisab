import { useMemo } from 'react'
import { insights, type Mover } from '@zp/core'
import { AppChrome } from '../AppChrome.tsx'
import { useData } from '../data.tsx'
import { fyFull, inr, inrSigned, pct, pctSigned } from '../fmt.ts'
import { Kpi, Panel, td, tdTotal, th } from '../ui.tsx'

const tone = (n: number) => (n < 0 ? 'text-red-600' : n > 0 ? 'text-green-700' : '')
const note = 'px-3 py-2 text-xs text-gray-500'

function Movers({ title, rows }: { title: string; rows: Mover[] }) {
  return (
    <div className="px-3 py-2">
      <div className="mb-1 text-xs font-semibold text-primary">{title}</div>
      {rows.map(m => (
        <div key={m.symbol} className="flex items-baseline justify-between gap-2 py-0.5 text-sm tabular-nums">
          <span className="font-medium">{m.symbol}</span>
          <span className={tone(m.pnl)}>{inrSigned(m.pnl)} <span className="text-xs">({pctSigned(m.pnlPct, 0)})</span>
            {m.contribution !== null && <span className="text-xs text-gray-500"> · {pct(m.contribution, 0)} of net</span>}</span>
        </div>
      ))}
    </div>
  )
}

export default function InsightsPage() {
  const { chosen, views, total, date, filters } = useData()
  const rate = filters.ratePct / 100
  const ins = useMemo(() => insights(chosen, views, total, date, rate), [chosen, views, total, date, rate])
  const { realized: r, charges: c, dividends: d, concentration: k, term: t } = ins

  if (chosen.length === 0) return <AppChrome title="Insights" controls><p className="rounded-lg border border-gray-300 p-6 text-center text-sm text-gray-500">No accounts yet. Add files on the Import page.</p></AppChrome>

  const vs = ins.xirrVsHurdle
  return (
    <AppChrome title="Insights" controls>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
        <Kpi label={`XIRR vs ${filters.ratePct}% hurdle`} value={vs === null ? '–' : `${vs > 0 ? '+' : ''}${vs.toFixed(1)} pts`}
          hint="Your XIRR minus the hurdle rate, in percentage points" tone={vs === null ? undefined : vs >= 0 ? 'good' : 'bad'} />
        <Kpi label="Realised gain" value={inrSigned(r.total)} hint="Profit booked on equity sales found in the imported tradebooks (FIFO)" tone={r.total >= 0 ? 'good' : 'bad'} />
        <Kpi label="Unrealised gain" value={inrSigned(ins.unrealized)} hint="Holdings value minus cost" tone={ins.unrealized >= 0 ? 'good' : 'bad'} />
        <Kpi label="Charges paid" value={inr(c.total)} hint={ins.chargesPctOfGross === null ? 'Fees shown as their own ledger rows' : `${pct(ins.chargesPctOfGross)} of the profit made before these fees`} />
        <Kpi label="Dividend yield" value={d.yieldOnInvested === null ? '–' : pct(d.yieldOnInvested, 2)} hint="All dividends received ÷ invested" />
        <Kpi label="Dividends, last 12m" value={inr(d.ttm)} hint={`${pct(d.ttmYieldOnValue, 2)} of holdings value · ${pct(d.ttmYieldOnCost, 2)} of cost`} />
        <Kpi label="Top 5 weight" value={pct(k.top5, 0)} hint={`${k.count} holdings. Top 1: ${k.top1Symbol} ${pct(k.top1, 0)}. Top 10: ${pct(k.top10, 0)}`} />
        <Kpi label="Long-term share" value={pct(t.ltShare, 0)} hint="Share of holdings value held more than a year" />
      </div>
      {(ins.tradebook.mismatches.length > 0 || ins.tradebook.unmatchedSales.length > 0) && (
        <details className="overflow-hidden rounded-lg border border-amber-400 bg-amber-50 text-sm text-amber-900">
          <summary className="cursor-pointer select-none px-3 py-2 font-semibold">
            Tradebooks do not fully match: {ins.tradebook.unmatchedSales.length} sale{ins.tradebook.unmatchedSales.length === 1 ? '' : 's'} with no purchase, {ins.tradebook.mismatches.length} holding{ins.tradebook.mismatches.length === 1 ? '' : 's'} off
          </summary>
          <div className="space-y-3 bg-white px-3 py-2 text-gray-800">
            <p className="text-xs text-gray-600">Sales with no purchase are left out of realised gain and tax. What remains here is what a tradebook cannot show: IPO allotments, transfers, bonus, splits, mergers, or years not imported yet. Add the missing years on the Import page, or record the capital on the Accounts page.</p>
            {ins.tradebook.unmatchedSales.length > 0 && (
              <table className="w-full border-collapse"><thead><tr><th className={th}>Account</th><th className={th}>Sold, no purchase</th><th className={th}>Qty</th><th className={th}>First sale</th></tr></thead>
                <tbody>{ins.tradebook.unmatchedSales.map(u => <tr key={u.account + u.symbol} className="odd:bg-gray-50"><td className={td}>{u.account}</td><td className={td}>{u.symbol}</td><td className={td}>{inr(u.quantity)}</td><td className={td}>{u.firstDate}</td></tr>)}</tbody></table>
            )}
            {ins.tradebook.mismatches.length > 0 && (
              <table className="w-full border-collapse"><thead><tr><th className={th}>Account</th><th className={th}>Stock</th><th className={th}>Held</th><th className={th}>Tradebooks</th><th className={th}>Difference</th></tr></thead>
                <tbody>{ins.tradebook.mismatches.map(m => <tr key={m.account + m.symbol} className="odd:bg-gray-50" title={m.hint}><td className={td}>{m.account}</td><td className={td}>{m.symbol}</td><td className={td}>{inr(m.held)}</td><td className={td}>{inr(m.tradebookOpen)}</td><td className={`${td} ${tone(m.diff)}`}>{inrSigned(m.diff)}</td></tr>)}</tbody></table>
            )}
            <p className="text-xs text-gray-500">Hold or tap a row for the likely reason: positive difference means held more than the tradebooks explain, negative means the tradebooks show more than is held.</p>
          </div>
        </details>
      )}

      <Panel title="Realised gains and estimated tax by year">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead><tr><th className={th}>FY</th><th className={th}>Short-term</th><th className={th}>Long-term</th><th className={th}>Intraday</th><th className={th}>Est. tax</th></tr></thead>
            <tbody>
              {r.byFY.map(x => (
                <tr key={x.fy} className="odd:bg-gray-50">
                  <td className={td}>{fyFull(x.fy)}</td>
                  <td className={`${td} ${tone(x.stcg)}`}>{inrSigned(x.stcg)}</td><td className={`${td} ${tone(x.ltcg)}`}>{inrSigned(x.ltcg)}</td>
                  <td className={`${td} ${tone(x.intraday)}`}>{inrSigned(x.intraday)}</td><td className={td}>{inr(x.tax)}</td>
                </tr>
              ))}
              {r.byFY.length === 0 && <tr><td colSpan={5} className={`${td} text-center text-gray-500`}>No equity sales in the imported tradebooks.</td></tr>}
              {r.byFY.length > 0 && (
                <tr><td className={tdTotal}>Total</td><td className={`${tdTotal} ${tone(r.stcg)}`}>{inrSigned(r.stcg)}</td><td className={`${tdTotal} ${tone(r.ltcg)}`}>{inrSigned(r.ltcg)}</td>
                  <td className={`${tdTotal} ${tone(r.intraday)}`}>{inrSigned(r.intraday)}</td><td className={tdTotal}>{inr(r.tax)}</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <p className={note}>Rough estimate only: short-term 15% / 20% and long-term 10% / 12.5% above ₹1L / ₹1.25L (rates change for sales from 23 Jul 2024), long-term gains before FY 2018-19 untaxed. Ignores cess, surcharge, grandfathering and losses carried forward. Intraday is business income at your slab and is left out of the tax. Not tax advice.</p>
      </Panel>

      <Panel title="Charges paid">
        <div className="grid sm:grid-cols-2">
          <table className="w-full border-collapse">
            <thead><tr><th className={th}>Type</th><th className={th}>Amount</th></tr></thead>
            <tbody>
              {c.byType.map(x => <tr key={x.label} className="odd:bg-gray-50"><td className={td}>{x.label}</td><td className={td}>{inr(x.amount)}</td></tr>)}
              <tr><td className={tdTotal}>Total</td><td className={tdTotal}>{inr(c.total)}</td></tr>
            </tbody>
          </table>
          <table className="w-full border-collapse">
            <thead><tr><th className={th}>FY</th><th className={th}>Amount</th></tr></thead>
            <tbody>{c.byFY.map(x => <tr key={x.fy} className="odd:bg-gray-50"><td className={td}>{fyFull(x.fy)}</td><td className={td}>{inr(x.amount)}</td></tr>)}</tbody>
          </table>
        </div>
        <p className={note}>Only fees the ledger lists as separate rows (DP charges, AMC, SEBI fees, delayed payment, smallcase). Brokerage, STT and exchange fees are netted inside settlements and are not visible here. Total gain is already after all of these.</p>
      </Panel>

      <Panel title="Dividends by year">
        <table className="w-full border-collapse">
          <thead><tr><th className={th}>FY</th><th className={th}>Received</th></tr></thead>
          <tbody>
            {d.byFY.map(x => <tr key={x.fy} className="odd:bg-gray-50"><td className={td}>{fyFull(x.fy)}</td><td className={td}>{inr(x.amount)}</td></tr>)}
            {d.byFY.length === 0 && <tr><td colSpan={2} className={`${td} text-center text-gray-500`}>No dividends imported.</td></tr>}
          </tbody>
        </table>
      </Panel>

      <Panel title="Current holdings: holding period">
        <div className="grid grid-cols-2 gap-x-4 gap-y-2 px-3 py-2 sm:grid-cols-4">
          {[['Long-term value', t.ltValue, false], ['Short-term value', t.stValue, false], ['Long-term gain', t.ltGain, true], ['Short-term gain', t.stGain, true]].map(([l, v, signed]) => (
            <div key={l as string}><div className="text-xs text-gray-500">{l as string}</div>
              <div className={`text-sm font-semibold tabular-nums ${signed ? tone(v as number) : ''}`}>{signed ? inrSigned(v as number) : inr(v as number)}</div></div>
          ))}
        </div>
        <p className={note}>Unrealised gain on quantities Zerodha marks as held over a year (taxed as long-term when sold) and the rest.</p>
      </Panel>

      <Panel title="Best and worst holdings">
        <div className="grid sm:grid-cols-2">
          <Movers title="Biggest gains (₹)" rows={ins.movers.bestPnl} /><Movers title="Biggest losses (₹)" rows={ins.movers.worstPnl} />
          <Movers title="Best return (%)" rows={ins.movers.bestPct} /><Movers title="Worst return (%)" rows={ins.movers.worstPct} />
        </div>
        <p className={note}>"of net" is the holding's share of the total unrealised P&L.</p>
      </Panel>
    </AppChrome>
  )
}
