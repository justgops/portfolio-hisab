import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Switch } from '@onyantra-in/ui-kit/base'
import { ChevronDownIcon, PlusCircleIcon, Squares2X2Icon } from '@heroicons/react/24/outline'
import { useData } from './data.tsx'

const input = 'h-10 rounded-lg border border-gray-300 bg-white px-2 text-base text-gray-800 sm:h-9 sm:text-sm'

const tail = (id: string) => `**${id.slice(-4)}`

/** Account selector as a dropdown on the right: All accounts or one account, plus a shortcut to add another. */
function AccountPicker() {
  const { accounts, filters, setFilters } = useData()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const away = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false) }
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', away); document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('mousedown', away); document.removeEventListener('keydown', esc) }
  }, [open])
  const current = accounts.find(a => a.clientId === filters.selected)
  const pick = (id: string | null) => { setFilters({ ...filters, selected: id }); setOpen(false) }
  const item = (id: string | null, label: string, icon: React.ReactNode) => {
    const on = filters.selected === id
    return (
      <button key={id ?? 'all'} type="button" role="radio" aria-checked={on} onClick={() => pick(id)}
        className="flex w-full items-center gap-3 rounded-lg px-2 py-3 text-left hover:bg-gray-50">
        {icon}
        <span className="min-w-0 flex-1 truncate text-base text-gray-800">{label}</span>
        <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 ${on ? 'border-gray-900' : 'border-gray-300'}`}>
          {on && <span className="h-3 w-3 rounded-full bg-gray-900" />}
        </span>
      </button>
    )
  }
  return (
    <div ref={box} className="relative">
      <button type="button" onClick={() => setOpen(o => !o)} aria-haspopup="listbox" aria-expanded={open}
        className="flex h-10 items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 text-sm font-semibold text-gray-800 shadow-sm">
        {current ? tail(current.clientId) : <><Squares2X2Icon className="h-4 w-4" />All</>}
        <ChevronDownIcon className="h-4 w-4" />
      </button>
      {open && (
        <div className="absolute right-0 z-30 mt-2 w-80 max-w-[calc(100vw-1rem)] rounded-xl border border-gray-300 bg-white p-4 shadow-xl">
          <h2 className="text-lg font-bold text-gray-800">Connected Accounts</h2>
          <p className="mb-2 text-sm text-gray-500">{accounts.length} account{accounts.length === 1 ? '' : 's'} imported</p>
          <div role="radiogroup" className="max-h-72 overflow-y-auto">
            {item(null, 'All accounts', <Squares2X2Icon className="h-6 w-6 shrink-0 text-gray-700" />)}
            {accounts.map(a => item(a.clientId, `${a.name} · ${tail(a.clientId)}`,
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">{a.name.charAt(0).toUpperCase()}</span>))}
          </div>
          <button type="button" onClick={() => { setOpen(false); navigate('/import') }}
            className="mt-3 flex h-11 w-full items-center justify-center gap-2 rounded-lg border border-gray-300 text-base font-semibold text-gray-800 hover:bg-gray-50">
            <PlusCircleIcon className="h-5 w-5" />Add another account
          </button>
        </div>
      )}
    </div>
  )
}

/** Account picker + as-of date + hurdle rate, shown at the top of the pages that use them. */
export default function Controls() {
  const { accounts, filters, setFilters, date } = useData()
  if (accounts.length === 0) return null
  return (
    <div className="space-y-3">
      <div className="flex justify-end"><AccountPicker /></div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-gray-800 sm:justify-end">
        <label className="flex items-center gap-2" title="Leaves mutual fund purchases paid from the Zerodha account out of Invested, since mutual funds are never counted in Value now">
          <Switch checked={filters.equityFnoOnly} onCheckedChange={c => setFilters({ ...filters, equityFnoOnly: c })} />
          Equity &amp; F&amp;O only
        </label>
        <label className="flex items-center gap-2">As of
          <input type="date" value={date} onChange={e => setFilters({ ...filters, asOf: e.target.value || null })} className={input} />
        </label>
        <label className="flex items-center gap-2">Hurdle %
          <input type="number" inputMode="decimal" min={0} step={0.5} value={filters.ratePct} onChange={e => setFilters({ ...filters, ratePct: Number(e.target.value) })} className={`${input} w-20`} />
        </label>
      </div>
    </div>
  )
}
