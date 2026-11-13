import type { ISODate, LotSlice, Trade, UnmatchedSell } from './types.ts'

export interface LotResult {
  slices: LotSlice[]
  unmatchedSells: UnmatchedSell[]
}

interface OpenLot { quantity: number; date: ISODate; price: number }
interface Short { quantity: number; date: ISODate; price: number }

/**
 * FIFO match of buys against sells, per stock.
 *
 * - A stock is identified by its ISIN when the trade has one, so a rename (IDFCBANK to IDFCFIRSTB, NILA to NILAINFRA)
 *   stays one stock; slices carry the most recent symbol seen. Trades without an ISIN fall back to the symbol.
 * - Some older Console rows give a sell a negative quantity; the sign carries no meaning, so quantities are absolute.
 * - A sell with nothing in stock is an intraday short: it is paired with a buy later the same day (a slice that opens
 *   and closes on that date). Only a short that no same-day buy covers is reported in `unmatchedSells`.
 * - Trades are processed in execution order whatever order they come in.
 * `opening` lots (bought before the first tradebook) can be supplied to resolve sells that have no buy in the data.
 */
export function buildLots(
  trades: Trade[],
  opening: { symbol: string; quantity: number; date: ISODate; price: number }[] = [],
): LotResult {
  const open = new Map<string, OpenLot[]>()
  const shorts = new Map<string, Short[]>()
  const latest = new Map<string, string>()            // stock key -> latest symbol
  const raw: (LotSlice & { key: string })[] = []
  const unmatched: (UnmatchedSell & { key: string })[] = []
  const list = <T>(m: Map<string, T[]>, k: string) => m.get(k) ?? m.set(k, []).get(k)!

  // opening lots name a symbol; attach them to the stock (ISIN) that symbol trades as
  const keyOfSymbol = new Map(trades.map(t => [t.symbol, t.isin || t.symbol]))
  for (const o of opening) {
    const key = keyOfSymbol.get(o.symbol) ?? o.symbol
    list(open, key).push({ quantity: o.quantity, date: o.date, price: o.price })
    latest.set(key, latest.get(key) ?? o.symbol)
  }

  const ordered = trades.map((t, i) => ({ t, i })).sort((a, b) => a.t.executedAt.localeCompare(b.t.executedAt) || a.i - b.i).map(x => x.t)
  for (const t of ordered) {
    const key = t.isin || t.symbol
    latest.set(key, t.symbol)
    const qty = Math.abs(t.quantity)
    if (!(qty > 1e-9)) continue
    const stock = list(open, key)
    const pending = list(shorts, key)

    if (t.side === 'buy') {
      let remaining = qty
      // shorts from an earlier day can no longer be covered
      while (pending.length && pending[0].date < t.date) { const s = pending.shift()!; unmatched.push({ key, symbol: t.symbol, date: s.date, quantity: s.quantity, price: s.price }) }
      while (remaining > 1e-9 && pending.length) {
        const s = pending[0]
        const take = Math.min(s.quantity, remaining)
        raw.push({ key, symbol: t.symbol, quantity: take, buyDate: t.date, buyPrice: t.price, sellDate: s.date, sellPrice: s.price })
        s.quantity -= take; remaining -= take
        if (s.quantity <= 1e-9) pending.shift()
      }
      if (remaining > 1e-9) stock.push({ quantity: remaining, date: t.date, price: t.price })
      continue
    }

    let remaining = qty
    while (remaining > 1e-9 && stock.length) {
      const lot = stock[0]
      const take = Math.min(lot.quantity, remaining)
      raw.push({ key, symbol: t.symbol, quantity: take, buyDate: lot.date, buyPrice: lot.price, sellDate: t.date, sellPrice: t.price })
      lot.quantity -= take; remaining -= take
      if (lot.quantity <= 1e-9) stock.shift()
    }
    if (remaining > 1e-9) pending.push({ quantity: remaining, date: t.date, price: t.price })
  }

  for (const [key, q] of shorts) for (const s of q) unmatched.push({ key, symbol: latest.get(key) ?? key, date: s.date, quantity: s.quantity, price: s.price })
  for (const [key, q] of open) for (const lot of q) raw.push({ key, symbol: key, quantity: lot.quantity, buyDate: lot.date, buyPrice: lot.price })

  const sym = (key: string) => latest.get(key) ?? key
  return {
    slices: raw.map(({ key, ...s }) => ({ ...s, symbol: sym(key) })),
    unmatchedSells: unmatched.map(({ key, ...u }) => ({ ...u, symbol: sym(key) })).sort((a, b) => a.date.localeCompare(b.date)),
  }
}
