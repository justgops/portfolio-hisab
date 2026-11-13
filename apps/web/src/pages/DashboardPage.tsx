import { Fragment, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { checkLedger } from '@zp/core'
import { AppChrome } from '../AppChrome.tsx'
import { useData } from '../data.tsx'
import { inr, inrSigned, pct, pctSigned } from '../fmt.ts'
import { Kpi, Metric, Panel, td, tdTotal, th } from '../ui.tsx'

const notice = 'rounded-lg border border-amber-400 bg-amber-50 px-3 py-2 text-sm text-amber-900'
const tone = (n: number) => (n < 0 ? 'text-red-600' : '')

export default function DashboardPage() {
  const { accounts, chosen, views, total, filters, setFilters } = useData()
  const navigate = useNavigate()
  const ratePct = filters.ratePct
  const rate = ratePct / 100

  const noHoldings = useMemo(() => chosen.filter(a => a.holdingsAsOn === null).map(a => a.name), [chosen])
  const badLedgers = useMemo(() => chosen.filter(a => !checkLedger(a.ledger).ok).map(a => a.name), [chosen])

  const xirrCell = (x: number | null) => (x === null ? '–' : pct(x * 100))
  const xirrClass = (x: number | null) => (x === null ? '' : x >= rate ? 'text-green-700' : 'text-red-600')
  const open = (id: string) => { setFilters({ ...filters, selected: id }); navigate('/schedule') }

  if (accounts.length === 0) {
    return (
      <AppChrome title="Dashboard">
        <p className="rounded-lg border border-gray-300 p-6 text-center text-sm text-gray-600">
          No accounts yet. Go to <a href="/import" className="font-semibold text-primary underline" onClick={e => { e.preventDefault(); navigate('/import') }}>Import & backup</a> and add your Console ledger and holdings files.
        </p>
      </AppChrome>
    )
  }

  return (
    <AppChrome title="Dashboard" controls>
      {noHoldings.length > 0 && <p className={notice}>No holdings file for {noHoldings.join(', ')}, so its market value counts as 0 and the gain is understated. Add its holdings XLSX on the Import page.</p>}
      {badLedgers.length > 0 && <p className={notice}>Ledger for {badLedgers.join(', ')} has missing rows, so the investment figures may be wrong. See the Accounts page.</p>}

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <Kpi label="Invested" value={inr(total.totalInvestment)} hint="Pay-ins minus payouts, plus other capital you added, less mutual fund purchases when Equity & F&O only is on" />
        <Kpi label="Value now" value={inr(total.value)} hint={`Holdings ${inr(total.market)} + cash ${inr(total.cash)}`} />
        <Kpi label="Total gain" value={inrSigned(total.gain)} hint={`${pctSigned(total.gainPct, 0)} on invested. Value now + dividends − invested`} tone={total.gain >= 0 ? 'good' : 'bad'} />
        <Kpi label="XIRR" value={xirrCell(total.xirr)} hint={`Annualised return, compared with the ${ratePct}% hurdle`} tone={total.xirr === null ? undefined : total.xirr >= rate ? 'good' : 'bad'} />
        <Kpi label="Dividends" value={inr(total.dividends)} hint="Received; included in gain, hurdle gap and XIRR" />
        <Kpi label={`Over ${ratePct}% hurdle`} value={inrSigned(total.hurdleGap)} hint="Value now + dividends − what your invested money would be worth at the hurdle rate" tone={total.hurdleGap >= 0 ? 'good' : 'bad'} />
      </div>

      <Panel title="Accounts">
        {/* phones: one card per account */}
        <div className="divide-y divide-gray-200 sm:hidden">
          {views.map(v => (
            <button key={v.clientId} type="button" onClick={() => open(v.clientId)} className="block w-full px-3 py-2 text-left">
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
                  <tr className="cursor-pointer border-t border-gray-200 hover:bg-gray-50" onClick={() => open(v.clientId)}>
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
      </Panel>

      <details className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-600">
        <summary className="cursor-pointer select-none font-semibold text-gray-800">How these are calculated</summary>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li><b>Invested</b>: money moved between your bank and Zerodha (pay-ins minus payouts) from the ledger, plus any other capital you added on the Accounts page. With <b>Equity &amp; F&amp;O only</b> on, mutual fund purchases paid from the Zerodha account are taken out, because mutual funds are never counted in Value now. Switch it off to see every bank transfer counted (the old Power BI style).</li>
          <li><b>Value now</b>: holdings at previous close plus the ledger cash balance. Mutual funds are not included.</li>
          <li><b>Total gain</b>: value now + dividends received − invested. It mixes realised results (profits already taken out as cash or sitting in the account) and unrealised ones (holdings above cost). The unrealised part alone is on the Holdings page.</li>
          <li><b>XIRR</b>: annualised return on every pay-in and payout, with dividends as money received, ending with value now. Green when it beats the hurdle.</li>
          <li><b>Over hurdle</b>: total gain minus the {ratePct}% a year your invested money would have earned elsewhere. In other words value now + dividends − what the same pay-ins and payouts would be worth at {ratePct}% (see Investment schedule). Realised and unrealised results both count; it is not an unrealised figure.</li>
          <li><b>F&amp;O net</b>: net F&amp;O obligations booked in the ledger, before charges.</li>
          <li><b>Cash share</b>: cash as a share of value now. Idle cash earns nothing against the hurdle.</li>
        </ul>
      </details>
    </AppChrome>
  )
}
