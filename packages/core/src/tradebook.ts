import { num, parseCsv } from './csv.ts'
import type { Trade } from './types.ts'

const REQUIRED = ['symbol', 'trade_date', 'trade_type', 'quantity', 'price']

export function parseTradebook(csv: string): Trade[] {
  const rows = parseCsv(csv)
  if (rows.length) {
    const missing = REQUIRED.filter(k => !(k in rows[0]))
    if (missing.length) throw new Error(`Not a tradebook CSV, missing columns: ${missing.join(', ')}`)
  }
  return rows
    .map(r => ({
      symbol: r.symbol,
      isin: r.isin ?? '',
      date: r.trade_date,
      exchange: r.exchange ?? '',
      side: (r.trade_type.toLowerCase() === 'sell' ? 'sell' : 'buy') as Trade['side'],
      quantity: num(r.quantity),
      price: num(r.price),
      tradeId: r.trade_id ?? '',
      orderId: r.order_id ?? '',
      executedAt: r.order_execution_time ?? r.trade_date,
    }))
    .sort((a, b) => a.executedAt.localeCompare(b.executedAt))
}

/**
 * The same fill appears in overlapping downloads. Exchange trade numbers are only unique within a
 * day, so the key also carries date, quantity and price; two real fills never match on all of it.
 * Order id is deliberately not part of the key: trades saved before it was parsed do not have one.
 */
export function dedupeTrades(trades: Trade[]): Trade[] {
  const seen = new Set<string>()
  return trades.filter(t => {
    if (!t.tradeId) return true
    const k = [t.exchange, t.date, t.tradeId, t.symbol, t.side, t.quantity, t.price].join('|')
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })
}
