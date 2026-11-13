import { AppChrome } from '../AppChrome.tsx'
import { useData } from '../data.tsx'
import { fyFull, inr } from '../fmt.ts'
import { Panel, th } from '../ui.tsx'

const cell = 'whitespace-nowrap px-1.5 py-2 text-right text-xs tabular-nums text-gray-800 first:text-left sm:px-2 sm:py-1 sm:text-sm'
const opening = 'hidden sm:table-cell'   // Opening equals the previous closing; dropped on phones to fit

function Schedule({ rows, flows, interest, closing }: {
  rows: { fy: string; opening: number; flows: number; interest: number; closing: number }[]
  flows: number; interest: number; closing: number
}) {
  return (
    <table className="w-full border-collapse">
      <thead><tr>
        <th className={th}>FY</th><th className={`${th} ${opening}`}>Opening</th>
        <th className={th}>Flows</th><th className={th}>Interest</th><th className={th}>Closing</th>
      </tr></thead>
      <tbody>
        {rows.map(r => (
          <tr key={r.fy} className="odd:bg-gray-50">
            <td className={cell}>{fyFull(r.fy)}</td><td className={`${cell} ${opening}`}>{inr(r.opening)}</td>
            <td className={cell}>{inr(r.flows)}</td><td className={cell}>{inr(r.interest)}</td><td className={cell}>{inr(r.closing)}</td>
          </tr>
        ))}
        <tr className="border-t-2 border-primary/40 font-bold">
          <td className={cell}>Total</td><td className={`${cell} ${opening}`} />
          <td className={cell}>{inr(flows)}</td><td className={cell}>{inr(interest)}</td><td className={cell}>{inr(closing)}</td>
        </tr>
      </tbody>
    </table>
  )
}

export default function SchedulePage() {
  const { views, total, filters } = useData()
  return (
    <AppChrome title="Investment schedule" controls>
      <p className="text-sm text-gray-600">
        What your pay-ins and payouts would be worth if they had earned {filters.ratePct}% a year. Each FY: opening + net pay-ins/payouts + interest earned inside that FY
        (pro-rated by days, compounded at 31 Mar) = closing, which opens the next FY. The last closing is the amount your holdings and cash are compared with.
      </p>
      {views.length > 1 && (
        <Panel title="All accounts">
          <div className="overflow-x-auto"><Schedule rows={total.schedule} flows={total.totalInvestment} interest={total.totalInterest} closing={total.netInvestment} /></div>
        </Panel>
      )}
      {views.map(v => (
        <Panel key={v.clientId} title={v.name}>
          <div className="overflow-x-auto"><Schedule rows={v.schedule} flows={v.totalInvestment} interest={v.totalInterest} closing={v.netInvestment} /></div>
        </Panel>
      ))}
      {views.length === 0 && <p className="rounded-lg border border-gray-300 p-6 text-center text-sm text-gray-500">No accounts yet. Import a ledger first.</p>}
    </AppChrome>
  )
}
