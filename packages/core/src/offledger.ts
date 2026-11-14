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
 *  - a sell with no matching buy (IPO paid by UPI, shares moved in from another demat): counted as capital
 *    added on the sell date at the sale proceeds, i.e. assuming no gain before the sale;
 *  - a current holding whose cost the tradebooks do not explain: the missing cost is counted, dated at the holdings date.
 *    Compared by ISIN and by cost, so renames, bonus issues and splits do not create capital.
 * Entries already accepted (matched by key) are not suggested again.
 */
export function suggestOffLedgerCapital(a: AccountRecord): SuggestionResult {
  const blockedBy = coverageByFY(a.ledger, a.eqTrades, a.foTrades).filter(c => c.missingEq).map(c => c.fy)
  if (blockedBy.length || a.eqTrades.length === 0) return { suggestions: [], blockedBy }

  const { slices, unmatchedSells } = buildLots(a.eqTrades)
  const out = new Map<string, CapitalSuggestion>()

  for (const u of unmatchedSells) {
    const key = `sell:${u.date}:${u.symbol}`
    const cur = out.get(key)
    const amount = u.quantity * u.price
    if (cur) { cur.amount += amount; cur.note = cur.note.replace(/^Sold [\d,.]+/, m => `Sold ${(Number(m.slice(5).replace(/,/g, '')) + u.quantity).toLocaleString('en-IN')}`) }
    else out.set(key, { key, date: u.date, amount, note: `Sold ${u.quantity.toLocaleString('en-IN')} ${u.symbol} with no purchase on record` })
  }

  // Cost of the lots the tradebooks leave open, per stock. Stocks are keyed by ISIN so a rename (CREATIVE -> CNL) still matches.
  const isinOf = new Map(a.eqTrades.map(t => [t.symbol, t.isin || t.symbol]))
  const keyOf = (symbol: string, isin?: string) => isin && !/^SCREENSHOT/i.test(isin) ? isin : isinOf.get(symbol) ?? base(symbol)
  const openCost = new Map<string, number>()
  for (const s of slices) if (!s.sellDate) openCost.set(keyOf(s.symbol), (openCost.get(keyOf(s.symbol)) ?? 0) + s.quantity * s.buyPrice)
  if (a.holdingsAsOn) {
    for (const h of a.holdings) {
      // Compare cost, not quantity: a bonus or split gives more shares for the same money, so it is not new capital.
      const cost = h.quantity * h.avgPrice
      const missing = cost - Math.min(openCost.get(keyOf(h.symbol, h.isin)) ?? openCost.get(base(h.symbol)) ?? 0, cost)
      if (missing > Math.max(500, cost * 0.02) && h.avgPrice > 0) {
        const key = `hold:${h.symbol}`
        out.set(key, { key, date: a.holdingsAsOn, amount: missing, note: `Holding ${h.symbol} cost not found in the tradebooks (about ${Math.round(missing / h.avgPrice).toLocaleString('en-IN')} shares at average cost)` })
      }
    }
  }

  const accepted = new Set((a.extraCapital ?? []).map(x => x.key).filter(Boolean))
  return { suggestions: [...out.values()].filter(s => !accepted.has(s.key)).sort((x, y) => x.date.localeCompare(y.date)), blockedBy }
}
