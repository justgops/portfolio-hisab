import { num, parseCsv } from './csv.ts'
import type { LedgerEntry, LedgerKind } from './types.ts'

function classify(r: { particulars: string; voucher: string; cost: string; debit: number; credit: number }): LedgerKind {
  const p = r.particulars.toLowerCase()
  const v = r.voucher.toLowerCase()
  if (p === 'opening balance') return 'opening'
  if (p === 'closing balance') return 'closing'
  if (v.includes('bank receipt') || p.includes('funds added') || p.includes('payment received')) return 'payin'
  if (v.includes('bank payment') || p.includes('funds transferred back') || p.includes('auto-settled')) return 'payout'
  if (/^investment in .* dp\b/.test(p)) return 'mf'   // mutual fund bought with ledger funds
  if (p.includes('f&o') || r.cost.toLowerCase().includes('f&o')) return 'fno'
  if (p.startsWith('net settlement') || p.startsWith('settlement value')) return 'settlement'
  if (/amc|dp charges|delayed payment|brokerage|stt|gst|charges/.test(p)) return 'charge'
  return 'other'
}

export function parseLedger(csv: string): LedgerEntry[] {
  const rows = parseCsv(csv)
  if (rows.length && !('particulars' in rows[0] && 'net_balance' in rows[0])) {
    throw new Error('Not a ledger CSV, missing particulars/net_balance columns')
  }
  return rows.map(r => {
    const debit = num(r.debit)
    const credit = num(r.credit)
    return {
      particulars: r.particulars,
      date: r.posting_date || null,
      voucherType: r.voucher_type ?? '',
      debit,
      credit,
      balance: num(r.net_balance),
      kind: classify({ particulars: r.particulars, voucher: r.voucher_type ?? '', cost: r.cost_center ?? '', debit, credit }),
    }
  })
}

/**
 * Zerodha client ids are 2-3 letters followed by 3-4 digits (YK2142, SMJ193, ZKC952). Anchored so it
 * never matches inside longer tokens such as ISINs (INE002A01018) or order numbers.
 */
export const CLIENT_ID_SOURCE = '(?<![A-Z0-9])([A-Z]{2,3}\\d{3,4})(?![A-Z0-9])'

/**
 * Client id from a filename: anywhere in the name, so it works for Console names
 * (tradebook-YK2142-EQ.csv, ledger-SMJ193.csv), ours (YK2142_2021-22_EQ.csv) and hand-made ones
 * ("my YK2142 ledger.csv"). Names without one ("ledger-final.csv") give null.
 */
export function clientIdFromFilename(name: string): string | null {
  const m = name.match(new RegExp(CLIENT_ID_SOURCE, 'i'))
  return m ? m[1].toUpperCase() : null
}

/**
 * Ledger rows keep the label they got when imported, so data saved by an older build misses labels added later.
 * This applies those later text rules to stored rows (the cost centre is not stored, so only text rules can be re-run).
 * Returns the same array when nothing changed.
 */
export function upgradeLedgerKinds(entries: LedgerEntry[]): { entries: LedgerEntry[]; changed: boolean } {
  let changed = false
  const out = entries.map(e => {
    if (e.kind !== 'other') return e
    const p = e.particulars.toLowerCase()
    const kind: LedgerKind | null = /^investment in .* dp\b/.test(p) ? 'mf' : p.startsWith('settlement value') ? 'settlement' : null
    if (!kind) return e
    changed = true
    return { ...e, kind }
  })
  return { entries: changed ? out : entries, changed }
}
