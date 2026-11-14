import { useMemo } from 'react'
import { accountFreshness, type AccountFreshness } from '@zp/core'
import { useNavigate } from 'react-router-dom'
import { useData } from './data.tsx'
import { ago, Panel, td, th } from './ui.tsx'

const today = () => new Date().toLocaleDateString('en-CA')   // local calendar date as YYYY-MM-DD

export function useFreshness(): AccountFreshness[] {
  const { accounts } = useData()
  return useMemo(() => accounts.map(a => accountFreshness(a, today())), [accounts])
}

/** Amber reminder on the Portfolio page when holdings or the ledger are out of date. Renders nothing when all is current. */
export function FreshnessReminder() {
  const reminders = useFreshness().flatMap(f => f.reminders)
  const navigate = useNavigate()
  if (reminders.length === 0) return null
  return (
    <div className="rounded-lg border border-amber-400 bg-amber-50 px-3 py-2 text-sm text-amber-900">
      <ul className="list-disc space-y-0.5 pl-5">{reminders.map(r => <li key={r}>{r}</li>)}</ul>
      <a href="/import" className="mt-1 inline-block font-semibold underline" onClick={e => { e.preventDefault(); navigate('/import') }}>
        Download fresh files from Console and import them
      </a>
    </div>
  )
}

/** Per account: how current each kind of data is and when it was last imported. */
export function FreshnessPanel() {
  const rows = useFreshness()
  const when = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : 'not recorded')
  return (
    <Panel title="Last imported">
      <div className="overflow-auto">
        <table className="w-full border-collapse">
          <thead><tr>
            <th className={th}>Account</th><th className={th}>Data</th><th className={th}>Runs up to</th><th className={th}>Age</th><th className={th}>Last imported</th>
          </tr></thead>
          <tbody>
            {rows.flatMap(f => f.items.map((i, n) => (
              <tr key={f.clientId + i.kind} className={`odd:bg-gray-50 ${n === 0 ? 'border-t border-gray-300' : ''}`}>
                <td className={`${td} font-semibold text-primary`}>{n === 0 ? f.name : ''}</td>
                <td className={td}>{i.label}</td>
                <td className={td}>{i.missing ? '–' : i.dataDate ?? '–'}</td>
                <td className={`${td} font-semibold ${i.missing || i.stale ? 'text-red-600' : i.staleAfter === null ? 'text-gray-500' : 'text-green-700'}`}>
                  {i.missing ? 'Missing' : i.staleAfter === null ? '' : `${i.stale ? '✗' : '✓'} ${ago(i.ageDays)}`}
                </td>
                <td className={`${td} text-gray-500`}>{when(i.importedAt)}</td>
              </tr>
            )))}
          </tbody>
        </table>
      </div>
      <p className="px-3 py-2 text-xs text-gray-500">
        Holdings are flagged after 7 days, the ledger after 30 days without a new import. Tradebooks and dividends are optional, so they are never flagged.
        "Not recorded" means the data was saved before import times were tracked.
      </p>
    </Panel>
  )
}
