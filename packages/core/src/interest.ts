import { daysBetween, fyDays, fyLabel, fyStart, fyStartYear } from './fy.ts'
import type { ISODate } from './types.ts'

export interface FYInterest {
  fy: string
  from: ISODate
  to: ISODate
  days: number
  simple: number
  compound: number
}

export interface OpportunityCost {
  byFY: FYInterest[]
  simple: number
  compound: number
}

/**
 * Opportunity cost of `principal` held over [from, to) at `rate` (0.12 = 12%).
 * - simple:   principal * rate * days / daysInFY, per FY segment.
 * - compound: same, but the base grows by prior FYs' interest (yearly compounding at 31 Mar).
 * Day count: from day counted, `to` day not counted (sell day stops the clock).
 */
export function opportunityCost(principal: number, from: ISODate, to: ISODate, rate: number): OpportunityCost {
  const byFY: FYInterest[] = []
  if (!(principal > 0) || daysBetween(from, to) <= 0) return { byFY, simple: 0, compound: 0 }
  let cursor = from
  let accrued = 0
  let simpleTotal = 0
  while (daysBetween(cursor, to) > 0) {
    const y = fyStartYear(cursor)
    const fyEnd = fyStart(y + 1)
    const segEnd = daysBetween(fyEnd, to) < 0 ? to : fyEnd
    const days = daysBetween(cursor, segEnd)
    const frac = days / fyDays(y)
    const simple = principal * rate * frac
    const compound = (principal + accrued) * rate * frac
    byFY.push({ fy: fyLabel(y), from: cursor, to: segEnd, days, simple, compound })
    simpleTotal += simple
    accrued += compound
    cursor = segEnd
  }
  return { byFY, simple: simpleTotal, compound: accrued }
}

/** Merge several per-lot FY breakdowns into one per-FY table. */
export function sumByFY(items: OpportunityCost[]): FYInterest[] {
  const map = new Map<string, FYInterest>()
  for (const it of items) {
    for (const r of it.byFY) {
      const cur = map.get(r.fy)
      if (cur) { cur.simple += r.simple; cur.compound += r.compound; cur.days += r.days }
      else map.set(r.fy, { ...r })
    }
  }
  return [...map.values()].sort((a, b) => a.fy.localeCompare(b.fy))
}
