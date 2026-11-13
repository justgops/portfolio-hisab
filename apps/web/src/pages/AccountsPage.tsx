import { useMemo, useState } from 'react'
import { inr, inrSigned } from '../fmt.ts'
import { checkLedger, suggestOffLedgerCapital, type CapitalSuggestion, type ExtraCapital } from '@zp/core'
import { AppChrome } from '../AppChrome.tsx'
import { useData } from '../data.tsx'
import type { AccountRecord } from '../db.ts'
import { Panel, td, th } from '../ui.tsx'

/** One row per account: who it is (editable) and whether its ledger, which drives the dashboard, is complete. */
function AccountsTable() {
  const { accounts, save: onChange, remove: onDelete } = useData()
  const update = (a: AccountRecord, patch: Partial<AccountRecord>) => onChange([{ ...a, ...patch }])
  const rows = useMemo(() => accounts.map(a => ({ a, c: checkLedger(a.ledger) })), [accounts])
  const input = 'h-9 w-28 rounded-lg border border-gray-300 bg-white px-2 text-base text-gray-800 sm:w-full sm:min-w-40 sm:text-sm'
  return (
    <Panel title="Accounts">
      <div className="overflow-auto">
        <table className="w-full border-collapse">
          <thead><tr>
            <th className={th}>Client ID</th><th className={`${th} !text-left`}>Name</th>
            <th className={th}>Rows</th><th className={`${th} !text-left`}>Ledger status</th><th className={th} />
          </tr></thead>
          <tbody>
            {rows.map(({ a, c }) => (
              <tr key={a.clientId} className="odd:bg-gray-50 align-middle">
                <td className={`${td} font-semibold`}>{a.clientId}</td>
                <td className={td}>
                  <input defaultValue={a.name} aria-label={`Name for ${a.clientId}`} className={input}
                    onBlur={e => e.target.value !== a.name && update(a, { name: e.target.value.trim() || a.clientId })} />
                </td>
                <td className={td}>{c.rows}</td>
                <td className={`${td} whitespace-normal text-left font-semibold ${c.ok ? 'text-green-700' : 'text-red-600'}`}>
                  {c.rows === 0 ? '✗ No ledger' : c.ok ? '✓ Complete' : (
                    <>
                      {c.startsMidway && <div>✗ Earlier ledger missing (starts with {Math.round(c.openingBalance).toLocaleString('en-IN')})</div>}
                      {c.breaks.length > 0 && <div>✗ Rows missing before {c.breaks[0].date}{c.breaks.length > 1 ? ` (+${c.breaks.length - 1} more)` : ''}</div>}
                    </>
                  )}
                  {a.holdingsAsOn === null && <div className="font-normal text-amber-700">No holdings file yet</div>}
                </td>
                <td className={td}>
                  <button type="button" aria-label={`Delete ${a.name}`} className="p-2 text-sm text-red-600 hover:underline"
                    onClick={() => { if (confirm(`Delete ${a.name} (${a.clientId}) and all its data from this device?`)) void onDelete(a.clientId) }}>
                    <span className="sm:hidden">✕</span><span className="hidden sm:inline">Delete</span>
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  )
}

const field = 'h-10 rounded-lg border border-gray-300 bg-white px-2 text-base text-gray-800 sm:h-9 sm:text-sm'
const btn = 'h-10 rounded-lg border border-primary bg-primary px-3 text-sm font-semibold text-primary-foreground disabled:opacity-50 sm:h-9'
const btnOutline = 'h-10 rounded-lg border border-gray-300 bg-white px-3 text-sm font-semibold text-gray-800 hover:bg-gray-100 sm:h-9'

/**
 * Capital that reached the account without a bank transfer (IPO paid by UPI, shares moved in from another demat).
 * Entries count like pay-ins, so Invested, XIRR and the hurdle all include them.
 */
function OtherCapital({ account }: { account: AccountRecord }) {
  const { save } = useData()
  const [date, setDate] = useState('')
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [edits, setEdits] = useState<Record<string, string>>({})   // suggestion key -> amount typed by the user
  const entries = [...(account.extraCapital ?? [])].sort((x, y) => x.date.localeCompare(y.date))
  const { suggestions, blockedBy } = useMemo(() => suggestOffLedgerCapital(account), [account])
  const total = entries.reduce((t, x) => t + x.amount, 0)

  const amountOf = (s: CapitalSuggestion) => { const n = Number(edits[s.key]); return edits[s.key] !== undefined && Number.isFinite(n) ? n : Math.round(s.amount) }
  const put = (next: ExtraCapital[]) => save([{ ...account, extraCapital: next }])
  const accept = (list: CapitalSuggestion[]) => put([
    ...entries,
    ...list.map(s => ({ id: crypto.randomUUID(), date: s.date, amount: amountOf(s), note: s.note, key: s.key })),
  ])
  const add = () => {
    const n = Number(amount)
    if (!date || !Number.isFinite(n) || n === 0) return
    void put([...entries, { id: crypto.randomUUID(), date, amount: n, note: note.trim() }])
    setDate(''); setAmount(''); setNote('')
  }

  return (
    <details className="overflow-hidden rounded-lg border border-gray-300 bg-white" open={entries.length > 0 || suggestions.length > 0}>
      <summary className="cursor-pointer select-none bg-gray-100 px-3 py-2 text-sm font-semibold text-gray-800">
        {account.name}: other capital {entries.length > 0 ? `(${inr(total)} added)` : ''}{suggestions.length > 0 ? ` · ${suggestions.length} suggested` : ''}
      </summary>
      <div className="space-y-3 p-3 text-sm text-gray-800">
        <p className="text-xs text-gray-600">
          Money that came in as shares or from outside the Zerodha ledger, such as an IPO paid by UPI or shares moved in from another demat.
          Each entry counts like a pay-in on its date. Use a negative amount for capital taken out.
        </p>

        {entries.length > 0 && (
          <table className="w-full border-collapse">
            <thead><tr><th className={th}>Date</th><th className={th}>Amount</th><th className={`${th} !text-left`}>Note</th><th className={th} /></tr></thead>
            <tbody>
              {entries.map(e => (
                <tr key={e.id} className="odd:bg-gray-50">
                  <td className={td}>{e.date}</td><td className={td}>{inrSigned(e.amount)}</td>
                  <td className={`${td} whitespace-normal text-left`}>{e.note || '–'}</td>
                  <td className={td}><button type="button" aria-label="Remove entry" className="p-2 text-red-600" onClick={() => void put(entries.filter(x => x.id !== e.id))}>✕</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <div className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1 text-xs text-gray-600">Date<input type="date" value={date} onChange={e => setDate(e.target.value)} className={field} /></label>
          <label className="flex flex-col gap-1 text-xs text-gray-600">Amount (₹)<input type="number" inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} className={`${field} w-32`} /></label>
          <label className="flex min-w-40 flex-1 flex-col gap-1 text-xs text-gray-600">Note<input value={note} onChange={e => setNote(e.target.value)} placeholder="e.g. IPO allotment" className={field} /></label>
          <button type="button" className={btn} disabled={!date || !Number(amount)} onClick={add}>Add</button>
        </div>

        {blockedBy.length > 0 && (
          <p className="rounded-lg border border-amber-400 bg-amber-50 px-3 py-2 text-amber-900">
            Suggestions from tradebooks need every equity FY added first. Missing: {blockedBy.join(', ')}.
          </p>
        )}
        {suggestions.length > 0 && (
          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-semibold">{suggestions.length} suggestion{suggestions.length > 1 ? 's' : ''} from your tradebooks, {inr(suggestions.reduce((t, x) => t + amountOf(x), 0))} in total</p>
              <button type="button" className={btnOutline} onClick={() => void accept(suggestions)}>Add all</button>
            </div>
            <p className="text-xs text-gray-600">
              Shares sold, or still held, with no purchase on record. The amount is pre-filled with the <b>sale proceeds</b> (holdings: average cost), which assumes the shares earned nothing before the sale.
              That is the worst case for returns: if you know what these shares really cost (IPO price, value when transferred in), type that amount instead. Leaving them out is the best case.
            </p>
            <div className="max-h-64 overflow-auto">
              <table className="w-full border-collapse">
                <tbody>
                  {suggestions.map(s => (
                    <tr key={s.key} className="odd:bg-gray-50">
                      <td className={td}>{s.date}</td>
                      <td className={td}>
                        <input type="number" inputMode="decimal" aria-label={`Amount for ${s.note}`} className={`${field} w-28 text-right`}
                          value={edits[s.key] ?? String(Math.round(s.amount))} onChange={e => setEdits(x => ({ ...x, [s.key]: e.target.value }))} />
                      </td>
                      <td className={`${td} whitespace-normal text-left`}>{s.note}</td>
                      <td className={td}><button type="button" className="px-2 py-1 text-primary hover:underline" onClick={() => void accept([s])}>Add</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
        {suggestions.length === 0 && blockedBy.length === 0 && account.eqTrades.length > 0 && (
          <p className="text-xs text-green-700">Every share in the tradebooks has a matching purchase, nothing more to suggest.</p>
        )}
        {account.eqTrades.length === 0 && <p className="text-xs text-gray-500">Add this account's equity tradebooks to get suggestions.</p>}
      </div>
    </details>
  )
}

export default function AccountsPage() {
  const { accounts } = useData()
  return (
    <AppChrome title="Accounts">
      {accounts.length === 0
        ? <p className="rounded-lg border border-gray-300 p-6 text-center text-sm text-gray-500">No accounts yet. Add files on the Import page.</p>
        : <AccountsTable />}
      {accounts.map(a => <OtherCapital key={a.clientId} account={a} />)}
      <p className="text-xs text-gray-500">Rename an account here; the name appears on every page. A complete ledger has no missing rows, which is what the investment figures depend on.</p>
    </AppChrome>
  )
}
