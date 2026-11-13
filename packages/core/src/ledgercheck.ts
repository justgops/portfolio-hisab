import type { LedgerEntry } from './types.ts'

export interface LedgerBreak {
  date: string | null
  particulars: string
  expected: number   // previous balance + credit - debit
  actual: number     // balance printed on the row
}

export interface LedgerCheck {
  ok: boolean
  rows: number
  from: string | null
  to: string | null
  /** Balance the ledger implied before its first row; non-zero means earlier history is missing. */
  openingBalance: number
  startsMidway: boolean
  breaks: LedgerBreak[]
}

const TOL = 0.05

/**
 * Console ledgers carry a running net_balance. If every row equals previous balance + credit - debit,
 * no row is missing; a break means rows (or a whole FY) are missing between those two dates.
 */
export function checkLedger(entries: LedgerEntry[]): LedgerCheck {
  const rows = entries.filter(e => e.kind !== 'opening' && e.kind !== 'closing' && e.date)
  const breaks: LedgerBreak[] = []
  let opening = 0
  rows.forEach((e, i) => {
    if (i === 0) { opening = e.balance - e.credit + e.debit; return }
    const prev = rows[i - 1].balance
    const expected = prev + e.credit - e.debit
    if (Math.abs(expected - e.balance) > TOL) breaks.push({ date: e.date, particulars: e.particulars, expected, actual: e.balance })
  })
  const startsMidway = rows.length > 0 && Math.abs(opening) > 1
  return {
    ok: rows.length > 0 && breaks.length === 0 && !startsMidway,
    rows: rows.length,
    from: rows[0]?.date ?? null,
    to: rows.at(-1)?.date ?? null,
    openingBalance: opening,
    startsMidway,
    breaks,
  }
}
