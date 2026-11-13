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
 *  - a current holding with no matching buy: counted at average cost, dated at the holdings date.
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

  const open = new Map<string, number>()
  for (const s of slices) if (!s.sellDate) open.set(base(s.symbol), (open.get(base(s.symbol)) ?? 0) + s.quantity)
  if (a.holdingsAsOn) {
    for (const h of a.holdings) {
      const undated = h.quantity - Math.min(open.get(base(h.symbol)) ?? 0, h.quantity)
      if (undated > 1e-9 && h.avgPrice > 0) {
        const key = `hold:${h.symbol}`
        out.set(key, { key, date: a.holdingsAsOn, amount: undated * h.avgPrice, note: `Holding ${undated.toLocaleString('en-IN')} ${h.symbol} with no purchase on record, at average cost` })
      }
    }
  }

  const accepted = new Set((a.extraCapital ?? []).map(x => x.key).filter(Boolean))
  return { suggestions: [...out.values()].filter(s => !accepted.has(s.key)).sort((x, y) => x.date.localeCompare(y.date)), blockedBy }
}
