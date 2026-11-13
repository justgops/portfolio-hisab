import { useMemo, useRef, useState } from 'react'
import { Button } from '@onyantra-in/ui-kit/base'
import { coverageByFY, parseBackup } from '@zp/core'
import { AppChrome } from '../AppChrome.tsx'
import { FreshnessPanel } from '../Freshness.tsx'
import { exportBackup } from '../backup.ts'
import { useData } from '../data.tsx'
import type { AccountRecord } from '../db.ts'
import { readInputFolder } from '../devInput.ts'
import { importFiles, type ImportResult } from '../importer.ts'
import { Panel, td, th } from '../ui.tsx'

export default function ImportPage() {
  const { accounts, save } = useData()
  const [results, setResults] = useState<ImportResult[]>([])
  const [busy, setBusy] = useState(false)
  const [backupMsg, setBackupMsg] = useState('')
  const files = useRef<HTMLInputElement>(null)
  const backup = useRef<HTMLInputElement>(null)

  async function handle(list: File[]) {
    if (!list.length) return
    // A backup replaces the accounts it contains, so say which ones before anything is overwritten.
    const replaced = new Set<string>()
    for (const f of list.filter(x => /\.json$/i.test(x.name))) {
      try { for (const b of parseBackup(await f.text()).accounts) if (accounts.some(a => a.clientId === b.clientId)) replaced.add(b.name || b.clientId) } catch { /* reported by the import itself */ }
    }
    if (replaced.size && !confirm(`Importing this backup replaces the data of ${[...replaced].join(', ')} with the backup's (names are kept). Anything added since the backup was taken is lost. Continue?`)) return
    setBusy(true)
    const map = new Map(accounts.map(a => [a.clientId, structuredClone(a)]))
    const res = await importFiles(list, map)
    await save([...map.values()])
    setResults(res)
    setBusy(false)
  }

  async function reloadInput() {
    setBusy(true)
    try {
      const { accounts: next, results: res } = await readInputFolder(accounts)
      await save(next)
      setResults(res)
    } catch (e) {
      setResults([{ file: 'Input folder', ok: false, message: e instanceof Error ? e.message : String(e) }])
    }
    setBusy(false)
  }

  async function doExport() {
    if (!accounts.length) { setBackupMsg('Nothing to back up yet.'); return }
    const how = await exportBackup(accounts)
    setBackupMsg(how === 'shared' ? 'Backup shared.' : 'Backup downloaded. Move it to your other device and import it there.')
  }

  return (
    <AppChrome title="Import & backup">
      <Panel title="Import Console files">
        <div className="space-y-2 p-4" onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); void handle([...e.dataTransfer.files]) }}>
          <p className="text-sm text-gray-600">
            Choose ledger CSV, tradebook CSV (equity or F&amp;O), holdings XLSX or a backup file, with any file name. Each file is identified by its contents (segment, FY, client).
            Re-importing overlapping files is safe; duplicates are skipped. For the dashboard you only need each account's <b>ledger</b> and <b>holdings</b>.
          </p>
          <input ref={files} type="file" multiple accept=".csv,.xlsx,.json" hidden onChange={e => { void handle([...(e.target.files ?? [])]); e.target.value = '' }} />
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => files.current?.click()} disabled={busy}>{busy ? 'Importing…' : 'Choose files'}</Button>
            {import.meta.env.DEV && <Button variant="outline" onClick={() => void reloadInput()} disabled={busy}>Reload from Input folder</Button>}
          </div>
          {results.length > 0 && (
            <ul className="space-y-0.5 text-sm">
              {results.map((r, i) => (
                <li key={i} className={r.ok ? 'text-green-700' : 'text-red-600'}>{r.ok ? '✓' : '✗'} {r.file}: {r.message}</li>
              ))}
            </ul>
          )}
        </div>
      </Panel>

      {accounts.length > 0 && <FreshnessPanel />}

      <Panel title="Backup & move to another device">
        <div className="space-y-2 p-4">
          <p className="text-sm text-gray-600">
            Your data lives only in this browser. Export one backup file (all accounts), send it to your phone or another computer, and import it there with <b>Choose files</b> above.
            Importing a backup replaces the data of the accounts in it and keeps their names (you are asked first); accounts not in the backup are left alone. Console files are merged as usual.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={() => void doExport()}>Export backup</Button>
            <Button variant="outline" onClick={() => backup.current?.click()}>Import backup</Button>
            <input ref={backup} type="file" accept=".json,application/json" hidden onChange={e => { void handle([...(e.target.files ?? [])]); e.target.value = '' }} />
          </div>
          {backupMsg && <p className="text-sm text-green-700">{backupMsg}</p>}
        </div>
      </Panel>

      {accounts.length > 0 && <TradebookStatus accounts={accounts} />}
    </AppChrome>
  )
}

type State = 'done' | 'missing' | 'none'
const stateOf = (have: number, needed: number): State => (have > 0 ? 'done' : needed > 0 ? 'missing' : 'none')

function Cell({ state }: { state: State }) {
  if (state === 'done') return <td className={`${td} font-semibold text-green-700`}>✓ Done</td>
  if (state === 'missing') return <td className={`${td} font-semibold text-red-600`}>✗ Missing</td>
  return <td className={`${td} text-gray-400`}>–</td>
}

/** One row per account and FY: is the equity / F&O tradebook there? */
function TradebookStatus({ accounts }: { accounts: AccountRecord[] }) {
  const rows = useMemo(() => accounts.flatMap(a =>
    coverageByFY(a.ledger, a.eqTrades, a.foTrades)
      .filter(c => c.eqSettlements > 0 || c.fnoEntries > 0 || c.eqTrades > 0 || c.foTrades > 0)
      .map(c => ({ a, fy: c.fy, eq: stateOf(c.eqTrades, c.eqSettlements), fo: stateOf(c.foTrades, c.fnoEntries) }))
  ), [accounts])
  const missing = rows.reduce((n, r) => n + (r.eq === 'missing' ? 1 : 0) + (r.fo === 'missing' ? 1 : 0), 0)

  return (
    <details className="overflow-hidden rounded-lg border border-gray-300 bg-white">
      <summary className="cursor-pointer select-none bg-gray-100 px-3 py-2 text-sm font-semibold text-gray-700">
        Optional: tradebooks for per-stock analysis{missing ? ` (${missing} FY file${missing > 1 ? 's' : ''} not added)` : ' (all added)'}
      </summary>
      <p className="px-3 py-2 text-xs text-gray-600">
        The dashboard does not need these. They are only for per-stock cost and gain. To add one, download the FY (1 Apr to 31 Mar) from Console → Reports → Tradebook and drop it above with any file name. – means nothing traded that year.
      </p>
      <div className="overflow-auto">
        <table className="w-full border-collapse">
          <thead><tr><th className={th}>Account</th><th className={th}>FY</th><th className={th}>Equity</th><th className={th}>F&amp;O</th></tr></thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.a.clientId + r.fy} className="odd:bg-gray-50">
                <td className={`${td} font-semibold text-primary`}>{r.a.name}</td>
                <td className={td}>{r.fy}</td>
                <Cell state={r.eq} /><Cell state={r.fo} />
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  )
}

