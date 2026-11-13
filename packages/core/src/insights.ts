import { aggregateHoldings, type AccountData, type AccountView, type Combined, type HoldingRow } from './dashboard.ts'
import { daysBetween, fyLabel, fyStartYear } from './fy.ts'
import { buildLots } from './lots.ts'
import type { ISODate, LedgerEntry, Trade } from './types.ts'

/** What `insights` needs from an account: the dashboard inputs plus the equity tradebook. */
export type InsightAccount = AccountData & { eqTrades?: Trade[] }

/* ---------- charges ---------- */

/** Fees the ledger shows as their own rows. Brokerage, STT and exchange fees are netted inside settlements and never appear here. */
export function chargeLabel(e: LedgerEntry): string | null {
  const p = e.particulars.toLowerCase()
  if (/^dp charges/.test(p)) return 'DP charges'
  if (/annual maintenance|\bamc\b/.test(p)) return 'Demat AMC'
  if (/delayed payment/.test(p)) return 'Delayed payment'
  if (/sebi turnover/.test(p)) return 'SEBI turnover fees'
  if (/smallcase/.test(p)) return 'Smallcase fee'
  if (e.kind === 'charge') return 'Other charges'
  return null
}

export interface ChargeSummary {
  total: number
  byFY: { fy: string; amount: number }[]
  byType: { label: string; amount: number }[]
}

export function chargeSummary(accounts: InsightAccount[], asOf: ISODate): ChargeSummary {
  const fy = new Map<string, number>(), type = new Map<string, number>()
  let total = 0
  for (const a of accounts) for (const e of a.ledger) {
    if (!e.date || e.date > asOf) continue
    const label = chargeLabel(e)
    if (!label) continue
    const amt = e.debit - e.credit
    total += amt
    fy.set(fyLabel(fyStartYear(e.date)), (fy.get(fyLabel(fyStartYear(e.date))) ?? 0) + amt)
    type.set(label, (type.get(label) ?? 0) + amt)
  }
  return {
    total,
    byFY: [...fy].map(([f, amount]) => ({ fy: f, amount })).sort((x, y) => x.fy.localeCompare(y.fy)),
    byType: [...type].map(([label, amount]) => ({ label, amount })).sort((x, y) => y.amount - x.amount),
  }
}

/* ---------- realised gains and tax ---------- */

/** Budget 2024: rates changed for sales on or after this date. */
export const TAX_CHANGE_DATE: ISODate = '2024-07-23'
/** Sales before this FY's start had no tax on long-term equity gains. */
const LTCG_TAX_FROM_FY = 2018

export interface RealizedFY {
  fy: string
  stcg: number         // delivery, held up to a year
  ltcg: number         // delivery, held more than a year
  intraday: number     // bought and sold the same day: business income, taxed at slab, left out of the tax estimate
  tax: number          // rough estimate on stcg + ltcg
}

export interface Realized {
  total: number
  stcg: number
  ltcg: number
  intraday: number
  byFY: RealizedFY[]
  tax: number
  unmatchedSells: number           // sell quantities with no buy in the imported tradebooks, so their gain is unknown
  firstTrade: ISODate | null
}

const sumPos = (...xs: number[]) => xs.reduce((t, x) => t + Math.max(x, 0), 0)
const blend = (pre: number, post: number, preRate: number, postRate: number) => {
  const d = sumPos(pre, post)
  return d ? (Math.max(pre, 0) * preRate + Math.max(post, 0) * postRate) / d : postRate
}

/**
 * Rough capital gains tax for one FY from its realised gains. Sales before 23 Jul 2024: STCG 15%, LTCG 10% above 1L.
 * From then: 20% and 12.5% above 1.25L. Short-term losses offset long-term gains, long-term losses offset only long-term gains.
 * Ignores cess, surcharge, grandfathering of pre-2018 purchases and losses carried between years.
 */
export function estimateTax(fyStart: number, stcgPre: number, stcgPost: number, ltcgPre: number, ltcgPost: number): number {
  let stcg = stcgPre + stcgPost, ltcg = ltcgPre + ltcgPost
  if (stcg < 0 && ltcg > 0) { ltcg += stcg; stcg = 0 }
  const stcgTax = Math.max(stcg, 0) * blend(stcgPre, stcgPost, 0.15, 0.20)
  if (fyStart < LTCG_TAX_FROM_FY) return stcgTax
  const exempt = fyStart >= 2024 ? 125_000 : 100_000
  const ltcgTax = Math.max(ltcg - exempt, 0) * blend(ltcgPre, ltcgPost, 0.10, 0.125)
  return stcgTax + ltcgTax
}

export function realizedGains(accounts: InsightAccount[], asOf: ISODate): Realized {
  const fys = new Map<string, { sp: number; sq: number; lp: number; lq: number; intraday: number }>()
  let unmatched = 0
  let first: ISODate | null = null
  for (const a of accounts) {
    const trades = (a.eqTrades ?? []).filter(t => t.date <= asOf).sort((x, y) => x.executedAt.localeCompare(y.executedAt))
    if (!trades.length) continue
    if (first === null || trades[0].date < first) first = trades[0].date
    const { slices, unmatchedSells } = buildLots(trades)
    unmatched += unmatchedSells.reduce((t, s) => t + s.quantity, 0)
    for (const s of slices) {
      if (!s.sellDate) continue
      const gain = s.quantity * (s.sellPrice! - s.buyPrice)
      const k = fyLabel(fyStartYear(s.sellDate))
      const r = fys.get(k) ?? fys.set(k, { sp: 0, sq: 0, lp: 0, lq: 0, intraday: 0 }).get(k)!
      const post = s.sellDate >= TAX_CHANGE_DATE
      if (s.buyDate === s.sellDate) r.intraday += gain
      else if (daysBetween(s.buyDate, s.sellDate) > 365) { if (post) r.lq += gain; else r.lp += gain }
      else { if (post) r.sq += gain; else r.sp += gain }
    }
  }
  const byFY: RealizedFY[] = [...fys].sort(([x], [y]) => x.localeCompare(y)).map(([fy, r]) => ({
    fy, stcg: r.sp + r.sq, ltcg: r.lp + r.lq, intraday: r.intraday,
    tax: estimateTax(Number(fy.slice(0, 4)), r.sp, r.sq, r.lp, r.lq),
  }))
  const sum = (f: (r: RealizedFY) => number) => byFY.reduce((t, r) => t + f(r), 0)
  return {
    total: sum(r => r.stcg + r.ltcg + r.intraday), stcg: sum(r => r.stcg), ltcg: sum(r => r.ltcg), intraday: sum(r => r.intraday),
    byFY, tax: sum(r => r.tax), unmatchedSells: unmatched, firstTrade: first,
  }
}

/* ---------- dividends ---------- */

export interface DividendStats {
  total: number
  ttm: number                  // received in the 12 months up to the as-of date
  yieldOnInvested: number | null   // total / invested * 100
  ttmYieldOnValue: number | null   // ttm / market value of holdings * 100
  ttmYieldOnCost: number | null    // ttm / cost of holdings * 100
  byFY: { fy: string; amount: number }[]
}

function dividendStats(accounts: InsightAccount[], holdings: HoldingRow[], invested: number, asOf: ISODate): DividendStats {
  const from = new Date(Date.parse(asOf) - 365 * 86_400_000).toISOString().slice(0, 10)
  const fy = new Map<string, number>()
  let total = 0, ttm = 0
  for (const a of accounts) for (const d of a.dividends ?? []) {
    if (d.date > asOf) continue
    total += d.amount
    if (d.date > from) ttm += d.amount
    const k = fyLabel(fyStartYear(d.date))
    fy.set(k, (fy.get(k) ?? 0) + d.amount)
  }
  const value = holdings.reduce((t, h) => t + h.value, 0), cost = holdings.reduce((t, h) => t + h.invested, 0)
  return {
    total, ttm,
    yieldOnInvested: invested > 0 ? (total / invested) * 100 : null,
    ttmYieldOnValue: value > 0 ? (ttm / value) * 100 : null,
    ttmYieldOnCost: cost > 0 ? (ttm / cost) * 100 : null,
    byFY: [...fy].map(([f, amount]) => ({ fy: f, amount })).sort((x, y) => x.fy.localeCompare(y.fy)),
  }
}

/* ---------- holdings: concentration, holding period, movers ---------- */

export interface Concentration {
  count: number
  top1: number; top1Symbol: string
  top5: number
  top10: number
}

export function concentration(holdings: HoldingRow[]): Concentration {
  const rows = [...holdings].sort((a, b) => b.weight - a.weight)
  const top = (n: number) => rows.slice(0, n).reduce((t, r) => t + r.weight, 0)
  return { count: rows.length, top1: top(1), top1Symbol: rows[0]?.symbol ?? '', top5: top(5), top10: top(10) }
}

export interface TermSplit {
  ltValue: number; stValue: number
  ltGain: number; stGain: number     // unrealised gain on the long-term and short-term quantities
  ltShare: number                    // long-term value as % of holdings value
}

export function termSplit(holdings: HoldingRow[]): TermSplit {
  let ltValue = 0, stValue = 0, ltGain = 0, stGain = 0
  for (const h of holdings) {
    const lt = Math.min(h.longTermQty, h.quantity), st = h.quantity - lt
    ltValue += lt * h.price; stValue += st * h.price
    ltGain += lt * (h.price - h.avgPrice); stGain += st * (h.price - h.avgPrice)
  }
  const value = ltValue + stValue
  return { ltValue, stValue, ltGain, stGain, ltShare: value ? (ltValue / value) * 100 : 0 }
}

export interface Mover { symbol: string; pnl: number; pnlPct: number; contribution: number | null }   // contribution = share of the net unrealised P&L, % (null when that is 0)

export interface Movers { bestPnl: Mover[]; worstPnl: Mover[]; bestPct: Mover[]; worstPct: Mover[] }

export function movers(holdings: HoldingRow[], n = 3): Movers {
  const net = holdings.reduce((t, h) => t + h.pnl, 0)
  const m = (h: HoldingRow): Mover => ({ symbol: h.symbol, pnl: h.pnl, pnlPct: h.pnlPct, contribution: net ? (h.pnl / net) * 100 : null })
  const by = (f: (h: HoldingRow) => number) => [...holdings].sort((a, b) => f(b) - f(a))
  return {
    bestPnl: by(h => h.pnl).slice(0, n).map(m),
    worstPnl: by(h => -h.pnl).slice(0, n).map(m),
    bestPct: by(h => h.pnlPct).slice(0, n).map(m),
    worstPct: by(h => -h.pnlPct).slice(0, n).map(m),
  }
}

/* ---------- everything together ---------- */

export interface PortfolioInsights {
  holdings: HoldingRow[]               // combined across the chosen accounts, biggest first
  unrealized: number                   // market value - cost of current holdings
  realized: Realized
  charges: ChargeSummary
  chargesPctOfGross: number | null     // charges / (gain + charges) * 100: the share of the profit made that fees took
  dividends: DividendStats
  xirrVsHurdle: number | null          // percentage points
  concentration: Concentration
  term: TermSplit
  movers: Movers
}

export function insights(accounts: InsightAccount[], views: AccountView[], total: Combined, asOf: ISODate, rate: number): PortfolioInsights {
  const holdings = aggregateHoldings(views)
  const charges = chargeSummary(accounts, asOf)
  const gross = total.gain + charges.total
  return {
    holdings,
    unrealized: holdings.reduce((t, h) => t + h.pnl, 0),
    realized: realizedGains(accounts, asOf),
    charges,
    chargesPctOfGross: gross > 0 ? (charges.total / gross) * 100 : null,
    dividends: dividendStats(accounts, holdings, total.totalInvestment, asOf),
    xirrVsHurdle: total.xirr === null ? null : (total.xirr - rate) * 100,
    concentration: concentration(holdings),
    term: termSplit(holdings),
    movers: movers(holdings),
  }
}
