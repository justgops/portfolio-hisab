import type { ISODate, LotSlice, Trade, UnmatchedSell } from './types.ts'

export interface LotResult {
  slices: LotSlice[]
  unmatchedSells: UnmatchedSell[]
}

interface OpenLot { quantity: number; date: ISODate; price: number }

/**
 * FIFO match. `opening` lots (bought before the first tradebook) can be supplied
 * to resolve sells that have no buy in the data.
 * Same-day buys are matched before sells on that date only via input order (trades are sorted by execution time).
 */
export function buildLots(trades: Trade[], opening: { symbol: string; quantity: number; date: ISODate; price: number }[] = []): LotResult {
  const open = new Map<string, OpenLot[]>()
  const slices: LotSlice[] = []
  const unmatchedSells: UnmatchedSell[] = []
  const push = (s: string, l: OpenLot) => { (open.get(s) ?? open.set(s, []).get(s)!).push(l) }

  for (const o of opening) push(o.symbol, { quantity: o.quantity, date: o.date, price: o.price })

  for (const t of trades) {
    if (t.side === 'buy') { push(t.symbol, { quantity: t.quantity, date: t.date, price: t.price }); continue }
    let remaining = t.quantity
    const q = open.get(t.symbol) ?? []
    while (remaining > 1e-9 && q.length) {
      const lot = q[0]
      const take = Math.min(lot.quantity, remaining)
      slices.push({ symbol: t.symbol, quantity: take, buyDate: lot.date, buyPrice: lot.price, sellDate: t.date, sellPrice: t.price })
      lot.quantity -= take
      remaining -= take
      if (lot.quantity <= 1e-9) q.shift()
    }
    if (remaining > 1e-9) unmatchedSells.push({ symbol: t.symbol, date: t.date, quantity: remaining, price: t.price })
  }

  for (const [symbol, q] of open) {
    for (const lot of q) slices.push({ symbol, quantity: lot.quantity, buyDate: lot.date, buyPrice: lot.price })
  }
  return { slices, unmatchedSells }
}
