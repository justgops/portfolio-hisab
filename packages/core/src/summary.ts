import { fyLabel, fyStartYear } from './fy.ts'
import { opportunityCost } from './interest.ts'
import type { ISODate, LedgerEntry } from './types.ts'

export interface Flow { date: ISODate; amount: number }   // +pay-in, -payout

/**
 * Pay-ins and payouts from the ledger as signed flows: money into Zerodha is positive, out is negative.
 * With `excludeMutualFunds`, mutual fund purchases paid from the ledger count as money leaving (and redemptions as
 * money returning), so the figures describe the equity and F&O money only.
 */
export function flowsFromLedger(entries: LedgerEntry[], asOf: ISODate, opts: { excludeMutualFunds?: boolean } = {}): Flow[] {
  return entries
    .filter(e => e.date && e.date <= asOf && (e.kind === 'payin' || e.kind === 'payout' || (opts.excludeMutualFunds && e.kind === 'mf')))
    .map(e => ({ date: e.date!, amount: e.kind === 'payout' ? -e.debit : e.kind === 'payin' ? e.credit : e.credit - e.debit }))
}

/** Ledger balance as of date (last row on/before the date). */
export function cashBalanceAsOf(entries: LedgerEntry[], asOf: ISODate): number {
  let bal = 0
  for (const e of entries) if (e.date && e.date <= asOf && e.kind !== 'closing') bal = e.balance
  return bal
}

export interface ScheduleRow {
  fy: string
  opening: number
  flows: number      // net pay-ins minus payouts dated in this FY
  interest: number   // interest earned inside this FY on the whole balance
  closing: number    // opening + flows + interest; next FY opens with this
}

/**
 * Year-by-year balance as if every pay-in/payout sat in an account earning `rate`
 * (pro-rated by days within each FY, compounded at 31 Mar). A payout removes its
 * amount and the interest that amount would have earned from its date onward.
 */
export function fySchedule(flows: Flow[], asOf: ISODate, rate: number): ScheduleRow[] {
  const inv = new Map<string, number>()
  const intr = new Map<string, number>()
  for (const f of flows) {
    const k = fyLabel(fyStartYear(f.date))
    inv.set(k, (inv.get(k) ?? 0) + f.amount)
    for (const r of opportunityCost(Math.abs(f.amount), f.date, asOf, rate).byFY) {
      intr.set(r.fy, (intr.get(r.fy) ?? 0) + Math.sign(f.amount) * r.compound)
    }
  }
  const fys = [...new Set([...inv.keys(), ...intr.keys()])].sort()
  let opening = 0
  return fys.map(fy => {
    const f = inv.get(fy) ?? 0, i = intr.get(fy) ?? 0
    const row = { fy, opening, flows: f, interest: i, closing: opening + f + i }
    opening = row.closing
    return row
  })
}
