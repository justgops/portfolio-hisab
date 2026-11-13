import { fyLabel, fyStartYear } from './fy.ts'
import type { LedgerEntry, Trade } from './types.ts'

export interface FYCoverage {
  fy: string
  ledgerRows: number
  eqSettlements: number   // equity settlements in ledger
  eqTrades: number
  fnoEntries: number      // F&O obligations in ledger
  foTrades: number
  missingEq: boolean      // ledger shows equity activity but no tradebook rows
  missingFo: boolean
}

/** Compare ledger activity with tradebook rows per Indian FY to show which tradebooks still need downloading. */
export function coverageByFY(ledger: LedgerEntry[], eqTrades: Trade[], foTrades: Trade[]): FYCoverage[] {
  const fy = (d: string) => fyLabel(fyStartYear(d))
  const map = new Map<string, FYCoverage>()
  const get = (k: string) => {
    let c = map.get(k)
    if (!c) map.set(k, c = { fy: k, ledgerRows: 0, eqSettlements: 0, eqTrades: 0, fnoEntries: 0, foTrades: 0, missingEq: false, missingFo: false })
    return c
  }
  for (const e of ledger) {
    if (!e.date) continue
    const c = get(fy(e.date))
    c.ledgerRows++
    if (e.kind === 'settlement') c.eqSettlements++
    if (e.kind === 'fno' && /net obligation/i.test(e.particulars)) c.fnoEntries++
  }
  for (const t of eqTrades) get(fy(t.date)).eqTrades++
  for (const t of foTrades) get(fy(t.date)).foTrades++
  const out = [...map.values()].sort((a, b) => a.fy.localeCompare(b.fy))
  for (const c of out) {
    c.missingEq = c.eqSettlements > 0 && c.eqTrades === 0
    c.missingFo = c.fnoEntries > 0 && c.foTrades === 0
  }
  return out
}
