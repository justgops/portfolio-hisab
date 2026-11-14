import type { AccountRecord } from './accounts.ts'
import { coverageByFY } from './coverage.ts'
import { buildLots } from './lots.ts'
import type { ISODate } from './types.ts'

export interface CapitalSuggestion {
  key: string
  date: ISODate
  amount: number
  note: string
}

export interface SuggestionResult {
  suggestions: CapitalSuggestion[]
  /** FYs whose equity tradebook is missing; suggestions are unreliable until they are added, so none are made. */
  blockedBy: string[]
}

const base = (s: string) => s.split('-')[0]

/**
 * Finds shares that came into the account without a bank transfer, from the tradebooks:
 *  - a sell with no matching buy (IPO paid by UPI, shares moved in from another demat) of a stock never bought before:
 *    counted as capital added on the sell date at the sale proceeds, i.e. assuming no gain before the sale;
 *  - a current holding whose cost the tradebooks do not explain: the missing cost is counted, dated at the holdings date.
 *    Compared by ISIN, symbol and cost, so renames, bonus issues, splits and mergers do not create capital.
 * Entries already accepted (matched by key) are not suggested again.
 */
export function suggestOffLedgerCapital(a: AccountRecord): SuggestionResult {
  const blockedBy = coverageByFY(a.ledger, a.eqTrades, a.foTrades).filter(c => c.missingEq).map(c => c.fy)
  if (blockedBy.length || a.eqTrades.length === 0) return { suggestions: [], blockedBy }

  const { slices, unmatchedSells } = buildLots(a.eqTrades)
  const out = new Map<string, CapitalSuggestion>()

  const isinOf = new Map(a.eqTrades.map(t => [t.symbol, t.isin || t.symbol]))
  const keyOf = (symbol: string, isin?: string) => isin && !/^SCREENSHOT/i.test(isin) ? isin : isinOf.get(symbol) ?? base(symbol)

  // A sell with no matching buy is capital only if the stock was never bought before: if it was, the extra shares came
  // from a bonus issue or split, which cost nothing.
  for (const u of unmatchedSells) {
    const stock = keyOf(u.symbol)
    if (a.eqTrades.some(t => t.side === 'buy' && t.date <= u.date && (keyOf(t.symbol, t.isin) === stock || base(t.symbol) === base(u.symbol)))) continue
    const key = `sell:${u.date}:${u.symbol}`
    const cur = out.get(key)
    const amount = u.quantity * u.price
    if (cur) { cur.amount += amount; cur.note = cur.note.replace(/^Sold [\d,.]+/, m => `Sold ${(Number(m.slice(5).replace(/,/g, '')) + u.quantity).toLocaleString('en-IN')}`) }
    else out.set(key, { key, date: u.date, amount, note: `Sold ${u.quantity.toLocaleString('en-IN')} ${u.symbol} with no purchase on record` })
  }

  // Cost of the lots the tradebooks leave open, per stock (keyed by ISIN, so a rename such as CREATIVE -> CNL still matches).
  const open = new Map<string, { cost: number; bases: Set<string> }>()
  for (const sl of slices) if (!sl.sellDate) {
    const k = keyOf(sl.symbol), o = open.get(k) ?? open.set(k, { cost: 0, bases: new Set() }).get(k)!
    o.cost += sl.quantity * sl.buyPrice; o.bases.add(base(sl.symbol))
  }
  if (a.holdingsAsOn) {
    const used = new Set<string>()
    const surplus: { h: (typeof a.holdings)[number]; missing: number }[] = []
    for (const h of a.holdings) {
      // Compare cost, not quantity: a bonus or split gives more shares for the same money, so it is not new capital.
      // Lots bought under another ISIN but the same symbol (a split changes the ISIN) count towards the same holding.
      const hk = keyOf(h.symbol, h.isin)
      let explained = 0
      for (const [k, o] of open) if (k === hk || o.bases.has(base(h.symbol))) { explained += o.cost; used.add(k) }
      const cost = h.quantity * h.avgPrice
      const missing = cost - Math.min(explained, cost)
      // Only stocks the tradebooks barely explain: when most of the cost is explained, the rest is just a different lot
      // matching or rounding between Zerodha's average price and ours, not shares that arrived without a purchase.
      if (missing > Math.max(5000, cost * 0.02) && explained < cost * 0.5 && h.avgPrice > 0) surplus.push({ h, missing })
    }
    // Open lots that no holding claims (a merger or demerger moved them to a new symbol): pair them with holdings of the same cost.
    const orphans = [...open].filter(([k]) => !used.has(k)).map(([k, o]) => ({ k, cost: o.cost }))
    for (const { h, missing } of surplus.sort((x, y) => y.missing - x.missing)) {
      const i = orphans.findIndex(o => Math.abs(o.cost - missing) <= Math.max(1000, missing * 0.05))
      if (i >= 0) { orphans.splice(i, 1); continue }
      const key = `hold:${h.symbol}`
      out.set(key, { key, date: a.holdingsAsOn, amount: missing, note: `Holding ${h.symbol} cost not found in the tradebooks (about ${Math.round(missing / h.avgPrice).toLocaleString('en-IN')} shares at average cost)` })
    }
  }

  const accepted = new Set((a.extraCapital ?? []).flatMap(x => (x.key ?? '').split(';')).map(k => k.trim()).filter(Boolean))
  return { suggestions: [...out.values()].filter(s => !accepted.has(s.key)).sort((x, y) => x.date.localeCompare(y.date)), blockedBy }
}
