import type { AccountRecord, ExtraCapital } from './accounts.ts'
import { parseCsv } from './csv.ts'

/**
 * Other capital as a file: Input/<ClientID>/capital/<ClientID>_OTHER_CAPITAL.csv
 *   date,amount,note,key
 *   2025-12-17,207840,ICICIAMC IPO 96 sh at 2165,sell:2025-12-19:ICICIAMC
 * `date` is when the money left your bank (IPO allotment, transfer-in); `amount` is positive for capital added.
 * `key` is optional and matches the app's suggestions (sell:DATE:SYMBOL or hold:SYMBOL, several separated by ;)
 * so an entry you have supplied is not suggested again.
 */
export const OTHER_CAPITAL_HEADER = 'date,amount,note,key'

export function isOtherCapitalCsv(head: string): boolean {
  return /^date,\s*amount\b/i.test(head.replace(/^﻿/, ''))
}

export function parseOtherCapital(text: string): ExtraCapital[] {
  return parseCsv(text).map((r, i) => {
    const date = (r.date ?? '').trim(), amount = Number(r.amount)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error(`Other capital row ${i + 2}: date must be YYYY-MM-DD, got "${r.date ?? ''}"`)
    if (!Number.isFinite(amount) || amount === 0) throw new Error(`Other capital row ${i + 2}: amount must be a non-zero number, got "${r.amount ?? ''}"`)
    const key = (r.key ?? '').trim()
    return { id: `file:${i}`, date, amount, note: (r.note ?? '').trim(), ...(key ? { key } : {}), source: 'file' as const }
  })
}

/** Replaces the entries that came from a file with `rows`; entries you typed in the app are kept. */
export function applyOtherCapital(a: AccountRecord, rows: ExtraCapital[]): void {
  a.extraCapital = [...(a.extraCapital ?? []).filter(x => x.source !== 'file'), ...rows]
}
