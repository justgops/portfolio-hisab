import { dedupeTrades } from './tradebook.ts'
import { dedupeDividends } from './dividends.ts'
import type { Holding } from './holdings.ts'
import type { Dividend, ISODate, LedgerEntry, Trade } from './types.ts'

/**
 * Money that reached the account as shares or from outside the Zerodha ledger (IPO paid by UPI,
 * shares transferred in). Positive = capital added, negative = taken out. Counts like a pay-in.
 */
export interface ExtraCapital {
  id: string
  date: ISODate
  amount: number
  note: string
  /** Set for entries accepted from a suggestion, so the same suggestion is not offered twice. */
  key?: string
}

export type ImportKind = 'ledger' | 'holdings' | 'tradebook' | 'dividends'

/** Everything stored for one account. */
export interface AccountRecord {
  clientId: string
  name: string
  ledger: LedgerEntry[]
  holdings: Holding[]          // equity only
  holdingsAsOn: ISODate | null
  eqTrades: Trade[]
  foTrades: Trade[]
  dividends: Dividend[]
  extraCapital: ExtraCapital[]
  /** When a file of each kind was last imported (ISO date-time). Missing on records saved before this was tracked. */
  importedAt?: Partial<Record<ImportKind, string>>
}

export const blankAccount = (clientId: string, name = clientId): AccountRecord => ({
  clientId, name, ledger: [], holdings: [], holdingsAsOn: null, eqTrades: [], foTrades: [], extraCapital: [], dividends: [],
})

const ledgerKey = (e: LedgerEntry) => `${e.date}|${e.particulars}|${e.debit}|${e.credit}|${e.balance}`

/** Merges overlapping ledgers; opening/closing marker rows are dropped, order is by date (stable). */
export function mergeLedger(a: LedgerEntry[], b: LedgerEntry[]): LedgerEntry[] {
  const seen = new Set<string>()
  const out: LedgerEntry[] = []
  for (const e of [...a, ...b]) {
    if (e.kind === 'opening' || e.kind === 'closing') continue
    const k = ledgerKey(e)
    if (seen.has(k)) continue
    seen.add(k)
    out.push(e)
  }
  return out.sort((x, y) => (x.date ?? '').localeCompare(y.date ?? ''))
}

const laterOf = (a: string | undefined, b: string | undefined) => (a && b ? (a > b ? a : b) : a ?? b)

function mergeImportedAt(a: AccountRecord['importedAt'], b: AccountRecord['importedAt']): AccountRecord['importedAt'] {
  const out: NonNullable<AccountRecord['importedAt']> = {}
  for (const k of ['ledger', 'holdings', 'tradebook', 'dividends'] as const) {
    const v = laterOf(a?.[k], b?.[k])
    if (v) out[k] = v
  }
  return out
}

/** Folds `incoming` into `local`: union of ledger/trades, newer holdings win, a custom local name is kept. */
export function mergeAccount(local: AccountRecord | undefined, incoming: AccountRecord): AccountRecord {
  if (!local) return structuredClone(incoming)
  const useIncomingHoldings = !local.holdingsAsOn || (incoming.holdingsAsOn !== null && incoming.holdingsAsOn >= local.holdingsAsOn)
  return {
    clientId: local.clientId,
    name: local.name && local.name !== local.clientId ? local.name : incoming.name || local.name,
    ledger: mergeLedger(local.ledger, incoming.ledger),
    holdings: useIncomingHoldings ? incoming.holdings : local.holdings,
    holdingsAsOn: useIncomingHoldings ? incoming.holdingsAsOn : local.holdingsAsOn,
    eqTrades: dedupeTrades([...local.eqTrades, ...incoming.eqTrades]),
    foTrades: dedupeTrades([...local.foTrades, ...incoming.foTrades]),
    dividends: dedupeDividends([...(local.dividends ?? []), ...(incoming.dividends ?? [])]),
    extraCapital: [...(local.extraCapital ?? []), ...(incoming.extraCapital ?? []).filter(x => !(local.extraCapital ?? []).some(y => y.id === x.id))],
    importedAt: mergeImportedAt(local.importedAt, incoming.importedAt),
  }
}

export interface BackupFile {
  app: 'portfolio-hisab'
  version: 1
  exportedAt: string
  accounts: AccountRecord[]
}

export const serializeBackup = (accounts: AccountRecord[], now = new Date()): string =>
  JSON.stringify({ app: 'portfolio-hisab', version: 1, exportedAt: now.toISOString(), accounts } satisfies BackupFile)

export function parseBackup(text: string): BackupFile {
  let data: unknown
  try { data = JSON.parse(text) } catch { throw new Error('Not a valid backup file (cannot read JSON)') }
  const b = data as Partial<BackupFile>
  // 'zerodha-portfolio' is what backups were called before the app was renamed; they stay readable
  const app: unknown = b?.app
  if ((app !== 'portfolio-hisab' && app !== 'zerodha-portfolio') || !Array.isArray(b.accounts)) throw new Error('Not a Portfolio Hisab backup file')
  if (b.version !== 1) throw new Error(`Unsupported backup version ${String(b.version)}`)
  for (const a of b.accounts) {
    if (typeof a?.clientId !== 'string' || !Array.isArray(a.ledger) || !Array.isArray(a.holdings)) throw new Error('Backup file is damaged (bad account record)')
    a.eqTrades ??= []; a.foTrades ??= []; a.dividends ??= []; a.extraCapital ??= []; a.holdingsAsOn ??= null; a.name ||= a.clientId
  }
  return b as BackupFile
}
