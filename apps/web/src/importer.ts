import { blankAccount, type ImportKind, dedupeTrades, identifyFile, mergeAccount, mergeLedger, dedupeDividends, parseBackup, parseDividends, parseHoldingsXlsx, parseLedger, parseTradebook } from '@zp/core'
import type { AccountRecord } from './db.ts'
import { ACCOUNT_DEFAULTS } from './accountDefaults.ts'

export interface ImportResult { file: string; ok: boolean; message: string; clientId?: string }

/** Reads files (any filename), identifies them by contents, and merges them into account records (mutates `accounts`). */
export async function importFiles(files: File[], accounts: Map<string, AccountRecord>): Promise<ImportResult[]> {
  const results: ImportResult[] = []
  const get = (id: string) => { let a = accounts.get(id); if (!a) accounts.set(id, a = { ...blankAccount(id, ACCOUNT_DEFAULTS[id]?.name ?? id) }); return a }

  // Backup files (.json) carry whole accounts; handle them first, the rest are Console exports.
  const consoleFiles: File[] = []
  for (const f of files) {
    if (!/\.json$/i.test(f.name)) { consoleFiles.push(f); continue }
    try {
      const b = parseBackup(await f.text())
      for (const acc of b.accounts) accounts.set(acc.clientId, mergeAccount(accounts.get(acc.clientId), acc))
      results.push({ file: f.name, ok: true, message: `Backup from ${b.exportedAt.slice(0, 10)}: ${b.accounts.length} account${b.accounts.length === 1 ? '' : 's'} merged` })
    } catch (e) {
      results.push({ file: f.name, ok: false, message: e instanceof Error ? e.message : String(e) })
    }
  }
  const loaded = await Promise.all(consoleFiles.map(async f => ({ f, bytes: new Uint8Array(await f.arrayBuffer()) })))

  // Files that don't name their client (e.g. a tradebook called "download (3).csv") go to the only known account.
  const known = new Set(accounts.keys())
  for (const { f, bytes } of loaded) {
    try { const id = identifyFile(f.name, bytes).clientId; if (id) known.add(id) } catch { /* reported below */ }
  }
  const fallback = known.size === 1 ? [...known][0] : null

  for (const { f, bytes } of loaded) {
    try {
      const idn = identifyFile(f.name, bytes, fallback)
      if (!idn.clientId) throw new Error('Cannot tell which account this belongs to. Import it together with a file that names the client (holdings or ledger), or rename it ClientID_...')
      const a = get(idn.clientId)
      const stamp = (k: ImportKind) => { a.importedAt = { ...a.importedAt, [k]: new Date().toISOString() } }
      const saved = idn.canonical ? ` → ${idn.canonical}` : ''
      const text = idn.kind === 'holdings' ? '' : new TextDecoder().decode(bytes)
      if (idn.kind === 'holdings') {
        const h = parseHoldingsXlsx(bytes)
        stamp('holdings')
        const equity = h.holdings.filter(x => x.kind === 'equity')
        if (!a.holdingsAsOn || h.asOn >= a.holdingsAsOn) { a.holdings = equity; a.holdingsAsOn = h.asOn }
        results.push({ file: f.name, ok: true, clientId: idn.clientId, message: `Holdings as on ${h.asOn}: ${equity.length} equity (mutual funds ignored)${saved}` })
      } else if (idn.kind === 'ledger') {
        const rows = parseLedger(text)
        stamp('ledger')
        const before = a.ledger.length
        a.ledger = mergeLedger(a.ledger, rows)
        results.push({ file: f.name, ok: true, clientId: idn.clientId, message: `Ledger: ${rows.length} rows, ${a.ledger.length - before} new${saved}` })
      } else if (idn.kind === 'dividends') {
        const rows = parseDividends(text)
        stamp('dividends')
        const before = a.dividends.length
        a.dividends = dedupeDividends([...a.dividends, ...rows])
        results.push({ file: f.name, ok: true, clientId: idn.clientId, message: `Dividends: ${rows.length} rows, ${a.dividends.length - before} new${saved}` })
      } else {
        const fo = idn.kind === 'tradebook-fo'
        const rows = parseTradebook(text)
        stamp('tradebook')
        const before = (fo ? a.foTrades : a.eqTrades).length
        const merged = dedupeTrades([...(fo ? a.foTrades : a.eqTrades), ...rows])
        if (fo) a.foTrades = merged; else a.eqTrades = merged
        results.push({ file: f.name, ok: true, clientId: idn.clientId, message: `${fo ? 'F&O' : 'Equity'} tradebook: ${rows.length} rows, ${merged.length - before} new${saved}` })
      }
    } catch (e) {
      results.push({ file: f.name, ok: false, message: e instanceof Error ? e.message : String(e) })
    }
  }
  return results
}
