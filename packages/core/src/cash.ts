import type { LedgerEntry, LotSlice } from './types.ts'

/**
 * Alternative capital definition: net money moved between bank and Zerodha.
 * Pay-ins act as "buy lots" of cash, payouts consume them FIFO. Reuses the
 * same slice shape so opportunity cost code is shared.
 * Payout beyond tracked pay-ins (money that predates the ledger) is returned as `excessPayout`.
 */
export function cashSlices(entries: LedgerEntry[]): { slices: LotSlice[]; excessPayout: number } {
  const slices: LotSlice[] = []
  const open: { qty: number; date: string }[] = []
  let excessPayout = 0
  for (const e of entries) {
    if (!e.date) continue
    if (e.kind === 'payin') open.push({ qty: e.credit || e.debit, date: e.date })
    else if (e.kind === 'payout') {
      let rem = e.debit || e.credit
      while (rem > 1e-6 && open.length) {
        const lot = open[0]
        const take = Math.min(lot.qty, rem)
        slices.push({ symbol: 'CASH', quantity: take, buyDate: lot.date, buyPrice: 1, sellDate: e.date, sellPrice: 1 })
        lot.qty -= take; rem -= take
        if (lot.qty <= 1e-6) open.shift()
      }
      excessPayout += Math.max(rem, 0)
    }
  }
  for (const l of open) slices.push({ symbol: 'CASH', quantity: l.qty, buyDate: l.date, buyPrice: 1 })
  return { slices, excessPayout }
}
