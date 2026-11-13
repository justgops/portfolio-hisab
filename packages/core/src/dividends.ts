import { num, parseCsv } from './csv.ts'
import type { Dividend } from './types.ts'

/**
 * Console dividends report: "Symbol,Ex-date,Qty,Dividend per share,Total dividend$".
 * Amounts may carry a trailing "$" (a currency-format artefact, the values are rupees); symbols may carry a
 * "#" marker (e.g. APLAPOLLO#), which is dropped so they match holdings/tradebook symbols.
 */
export function parseDividends(csv: string): Dividend[] {
  const rows = parseCsv(csv)
  if (rows.length && !('Symbol' in rows[0] && 'Ex-date' in rows[0])) throw new Error('Not a dividends CSV, missing Symbol/Ex-date columns')
  const money = (s: string | undefined) => num((s ?? '').replace(/[$₹,\s]/g, ''))
  const totalKey = rows.length ? Object.keys(rows[0]).find(k => /^total dividend/i.test(k)) : undefined
  return rows
    .filter(r => r.Symbol && r['Ex-date'])
    .map(r => ({
      symbol: r.Symbol.replace(/#/g, '').trim(),
      date: r['Ex-date'],
      quantity: money(r.Qty),
      perShare: money(r['Dividend per share']),
      amount: money(totalKey ? r[totalKey] : undefined),
    }))
}

const key = (d: Dividend) => `${d.date}|${d.symbol}|${d.quantity}|${d.amount}`

/** Drops repeats (same ex-date, symbol, quantity and amount), keeps date order. */
export function dedupeDividends(ds: Dividend[]): Dividend[] {
  const seen = new Set<string>()
  const out: Dividend[] = []
  for (const d of ds) { const k = key(d); if (!seen.has(k)) { seen.add(k); out.push(d) } }
  return out.sort((a, b) => a.date.localeCompare(b.date))
}
