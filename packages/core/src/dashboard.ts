import type { Holding } from './holdings.ts'
import { xirr, type CashFlow } from './metrics.ts'
import { cashBalanceAsOf, flowsFromLedger, fySchedule, type ScheduleRow } from './summary.ts'
import type { ExtraCapital } from './accounts.ts'
import type { Dividend, ISODate, LedgerEntry } from './types.ts'

export interface AccountData {
  clientId: string
  name: string
  ledger: LedgerEntry[]
  holdings: Holding[]          // equity only, mutual funds are not tracked
  holdingsAsOn: ISODate | null
  extraCapital?: ExtraCapital[]
  dividends?: Dividend[]       // Console dividends report; paid to the bank, not in the ledger; counted in gain, hurdle gap and XIRR
}

export interface HoldingRow {
  symbol: string
  quantity: number
  longTermQty: number
  avgPrice: number
  price: number        // previous close
  invested: number     // quantity * average price
  value: number        // quantity * price
  pnl: number
  pnlPct: number       // vs invested, 0 when invested is 0
  weight: number       // share of this account's market value, 0..100
  dividends: number    // dividends received on this symbol up to the as-of date (all years)
}

export interface AccountView {
  clientId: string
  name: string
  schedule: ScheduleRow[]      // yearly compounding schedule
  totalInvestment: number      // net pay-ins minus payouts, plus any other capital you added
  totalInterest: number
  netInvestment: number        // closing balance of the schedule
  otherCapital: number         // manual / accepted off-ledger capital included in totalInvestment
  mfOutflow: number            // mutual fund purchases taken out of totalInvestment (0 unless excludeMutualFunds)
  dividends: number            // total dividends received up to the as-of date, added to gain, hurdle gap and XIRR
  cash: number
  market: number
  hurdleGap: number            // value - netInvestment: how far ahead of (+) or behind (-) the hurdle rate
  value: number                // market + cash
  gain: number                 // value + dividends - totalInvestment
  gainPct: number              // gain / totalInvestment * 100
  xirr: number | null          // annualised return on pay-ins/payouts plus today's value
  fnoNet: number               // net F&O obligations booked in the ledger
  cashPct: number              // cash as % of value
  cashflows: CashFlow[]        // investor view incl. today's value, for combining accounts
  holdings: HoldingRow[]
}

export interface ViewOptions {
  /** Treat mutual fund purchases paid from the ledger as money leaving, so only equity and F&O money is counted. */
  excludeMutualFunds?: boolean
}

export function accountView(a: AccountData, asOf: ISODate, rate: number, opts: ViewOptions = {}): AccountView {
  const extra = (a.extraCapital ?? []).filter(x => x.date <= asOf)
  const flows = [
    ...flowsFromLedger(a.ledger, asOf, opts),
    ...extra.map(x => ({ date: x.date, amount: x.amount })),
  ].sort((x, y) => x.date.localeCompare(y.date))
  const schedule = fySchedule(flows, asOf, rate)
  const totalInvestment = schedule.reduce((t, r) => t + r.flows, 0)
  const totalInterest = schedule.reduce((t, r) => t + r.interest, 0)
  const netInvestment = schedule.at(-1)?.closing ?? 0
  const divs = (a.dividends ?? []).filter(x => x.date <= asOf)
  const divBySymbol = new Map<string, number>()
  for (const x of divs) divBySymbol.set(x.symbol.split('-')[0], (divBySymbol.get(x.symbol.split('-')[0]) ?? 0) + x.amount)
  const base = a.holdings.filter(h => h.quantity > 0)
  const market = base.reduce((t, h) => t + h.quantity * h.prevClose, 0)
  const holdings: HoldingRow[] = base
    .map(h => {
      const invested = h.quantity * h.avgPrice, value = h.quantity * h.prevClose
      return {
        symbol: h.symbol, quantity: h.quantity, longTermQty: h.longTermQty, avgPrice: h.avgPrice, price: h.prevClose,
        invested, value, pnl: value - invested, pnlPct: invested ? (value / invested - 1) * 100 : 0,
        weight: market ? (value / market) * 100 : 0,
        dividends: divBySymbol.get(h.symbol.split('-')[0]) ?? 0,
      }
    })
    .sort((x, y) => y.value - x.value)
  const cash = cashBalanceAsOf(a.ledger, asOf)
  const value = market + cash
  const dividends = divs.reduce((t, x) => t + x.amount, 0)
  const cashflows: CashFlow[] = [...flows.map(f => ({ date: f.date, amount: -f.amount })), { date: asOf, amount: value },
    ...divs.map(x => ({ date: x.date, amount: x.amount }))]   // dividends are cash received by the investor
  const fnoNet = a.ledger
    .filter(e => e.kind === 'fno' && e.date && e.date <= asOf && /net obligation/i.test(e.particulars))
    .reduce((t, e) => t + e.credit - e.debit, 0)
  return {
    clientId: a.clientId, name: a.name, schedule, totalInvestment, totalInterest, netInvestment,
    otherCapital: extra.reduce((t, x) => t + x.amount, 0),
    mfOutflow: opts.excludeMutualFunds ? 0 - a.ledger.filter(e => e.kind === 'mf' && e.date && e.date <= asOf).reduce((t, e) => t + e.credit - e.debit, 0) : 0,
    dividends,
    cash, market, hurdleGap: value + dividends - netInvestment, value,
    gain: value + dividends - totalInvestment, gainPct: totalInvestment ? ((value + dividends) / totalInvestment - 1) * 100 : 0,
    xirr: xirr(cashflows), fnoNet, cashPct: value ? (cash / value) * 100 : 0, cashflows, holdings,
  }
}

export interface Combined {
  schedule: ScheduleRow[]      // merged by FY
  otherCapital: number
  mfOutflow: number
  totalInvestment: number
  totalInterest: number
  netInvestment: number
  dividends: number
  cash: number
  market: number
  hurdleGap: number
  value: number
  gain: number
  gainPct: number
  xirr: number | null
  fnoNet: number
  cashPct: number
}

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0)

export function combine(views: AccountView[]): Combined {
  const sched = new Map<string, ScheduleRow>()
  for (const v of views) for (const r of v.schedule) {
    const c = sched.get(r.fy)
    if (!c) sched.set(r.fy, { ...r })
    else { c.opening += r.opening; c.flows += r.flows; c.interest += r.interest; c.closing += r.closing }
  }
  return {
    schedule: [...sched.values()].sort((a, b) => a.fy.localeCompare(b.fy)),
    otherCapital: sum(views.map(v => v.otherCapital)),
    mfOutflow: sum(views.map(v => v.mfOutflow)),
    totalInvestment: sum(views.map(v => v.totalInvestment)),
    totalInterest: sum(views.map(v => v.totalInterest)),
    netInvestment: sum(views.map(v => v.netInvestment)),
    dividends: sum(views.map(v => v.dividends)),
    cash: sum(views.map(v => v.cash)),
    market: sum(views.map(v => v.market)),
    hurdleGap: sum(views.map(v => v.hurdleGap)),
    value: sum(views.map(v => v.value)),
    gain: sum(views.map(v => v.gain)),
    gainPct: sum(views.map(v => v.totalInvestment)) ? ((sum(views.map(v => v.value)) + sum(views.map(v => v.dividends))) / sum(views.map(v => v.totalInvestment)) - 1) * 100 : 0,
    xirr: xirr(views.flatMap(v => v.cashflows)),
    fnoNet: sum(views.map(v => v.fnoNet)),
    cashPct: sum(views.map(v => v.value)) ? (sum(views.map(v => v.cash)) / sum(views.map(v => v.value))) * 100 : 0,
  }
}

/** One row per symbol across the given accounts: quantities and amounts summed, weights re-based on the combined market value. */
export function aggregateHoldings(views: AccountView[]): HoldingRow[] {
  const bySymbol = new Map<string, HoldingRow>()
  for (const v of views) for (const h of v.holdings) {
    const c = bySymbol.get(h.symbol)
    if (!c) bySymbol.set(h.symbol, { ...h })
    else {
      c.quantity += h.quantity; c.longTermQty += h.longTermQty; c.invested += h.invested; c.value += h.value; c.price = h.price; c.dividends += h.dividends
    }
  }
  const rows = [...bySymbol.values()]
  const market = rows.reduce((t, r) => t + r.value, 0)
  for (const r of rows) {
    r.avgPrice = r.quantity ? r.invested / r.quantity : 0
    r.pnl = r.value - r.invested
    r.pnlPct = r.invested ? (r.value / r.invested - 1) * 100 : 0
    r.weight = market ? (r.value / market) * 100 : 0
  }
  return rows.sort((a, b) => b.value - a.value)
}
