import type { AccountRecord, ImportKind } from './accounts.ts'
import { daysBetween } from './fy.ts'
import type { ISODate } from './types.ts'

/** Holdings are priced at the previous close, so a week-old file already misstates Value now. */
export const HOLDINGS_STALE_DAYS = 7
/** The ledger carries cash and every pay-in/payout; a month without a re-import is long enough to remind. */
export const LEDGER_STALE_DAYS = 30

export interface FreshnessItem {
  kind: ImportKind
  label: string
  dataDate: ISODate | null      // what the data runs up to (holdings as-on date, last ledger row, last trade or dividend)
  importedAt: string | null     // when a file of this kind was last imported, null for data saved before this was tracked
  ageDays: number | null        // days from `dataDate`, or for the ledger from the last import when that is newer
  staleAfter: number | null     // reminder threshold in days; null = never reminded (tradebooks and dividends are optional)
  stale: boolean
  missing: boolean
}

export interface AccountFreshness {
  clientId: string
  name: string
  items: FreshnessItem[]
  reminders: string[]           // one line per problem, ready to show (a missing holdings file is left to the Dashboard's own notice)
}

const lastDate = (xs: (string | null | undefined)[]): ISODate | null => xs.reduce<string | null>((m, x) => (x && (!m || x > m) ? x : m), null)

/**
 * How current each kind of data is, and what to remind the user about. `today` is the real date, not the as-of filter.
 * Holdings go stale by their as-on date. The ledger's last row only moves when something happens in the account,
 * so it goes stale by the later of its last row and the last time a ledger file was imported.
 */
export function accountFreshness(a: AccountRecord, today: ISODate): AccountFreshness {
  const ledgerRow = lastDate(a.ledger.filter(e => e.kind !== 'closing').map(e => e.date))
  const importedDay = (k: ImportKind) => a.importedAt?.[k]?.slice(0, 10) ?? null
  const age = (d: ISODate | null) => (d === null ? null : Math.max(0, daysBetween(d, today)))

  const holdingsAge = age(a.holdingsAsOn)
  const ledgerRef = lastDate([ledgerRow, importedDay('ledger')])
  const ledgerAge = age(ledgerRef)
  const make = (kind: ImportKind, label: string, dataDate: ISODate | null, ageDays: number | null, staleAfter: number | null, missing: boolean): FreshnessItem => ({
    kind, label, dataDate, importedAt: a.importedAt?.[kind] ?? null, ageDays, staleAfter,
    stale: staleAfter !== null && ageDays !== null && ageDays > staleAfter, missing,
  })
  const items = [
    make('holdings', 'Holdings', a.holdingsAsOn, holdingsAge, HOLDINGS_STALE_DAYS, a.holdingsAsOn === null),
    make('ledger', 'Ledger', ledgerRow, ledgerAge, LEDGER_STALE_DAYS, a.ledger.length === 0),
    make('tradebook', 'Tradebooks', lastDate([...a.eqTrades, ...a.foTrades].map(t => t.date)), null, null, false),
    make('dividends', 'Dividends', lastDate(a.dividends.map(d => d.date)), null, null, false),
  ]
  const reminders: string[] = []
  for (const i of items) {
    if (i.missing) { if (i.kind === 'ledger') reminders.push(`${a.name}: no ${i.label.toLowerCase()} file yet`) }
    else if (i.stale) reminders.push(i.kind === 'holdings'
      ? `${a.name}: holdings are from ${i.dataDate} (${i.ageDays} days old), so Value now uses old prices`
      : `${a.name}: ledger last updated ${ledgerRef} (${i.ageDays} days ago), so cash and pay-ins may be behind`)
  }
  return { clientId: a.clientId, name: a.name, items, reminders }
}
