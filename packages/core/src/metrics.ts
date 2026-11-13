import { daysBetween } from './fy.ts'
import type { ISODate } from './types.ts'

/** Investor's view: money put in is negative, money taken out (and today's value) is positive. */
export interface CashFlow { date: ISODate; amount: number }

/**
 * Annualised return (XIRR) of dated cash flows, by bisection. Returns null when it is undefined:
 * fewer than two flows, or all flows have the same sign.
 */
export function xirr(flows: CashFlow[]): number | null {
  const f = flows.filter(x => x.amount !== 0).sort((a, b) => a.date.localeCompare(b.date))
  if (f.length < 2 || !f.some(x => x.amount < 0) || !f.some(x => x.amount > 0)) return null
  const t0 = f[0].date
  const npv = (r: number) => f.reduce((s, x) => s + x.amount / Math.pow(1 + r, daysBetween(t0, x.date) / 365), 0)
  let lo = -0.99, hi = 100
  if (npv(lo) * npv(hi) > 0) return null
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2
    if (npv(lo) * npv(mid) <= 0) hi = mid; else lo = mid
  }
  return (lo + hi) / 2
}
