import { Switch } from '@onyantra-in/ui-kit/base'
import { useData } from './data.tsx'
import { SlicerButton } from './ui.tsx'

const input = 'h-10 rounded-lg border border-gray-300 bg-white px-2 text-base text-gray-800 sm:h-9 sm:text-sm'

/** Account selector + as-of date + hurdle rate, shown at the top of the pages that use them. */
export default function Controls() {
  const { accounts, filters, setFilters, date } = useData()
  if (accounts.length === 0) return null
  return (
    <div className="space-y-3">
      {/* one scrolling row on phones, wraps on desktop */}
      <div className="-mx-2 flex gap-2 overflow-x-auto px-2 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 sm:pb-0">
        <SlicerButton selected={filters.selected === null} onClick={() => setFilters({ ...filters, selected: null })}>All accounts</SlicerButton>
        {accounts.map(a => (
          <SlicerButton key={a.clientId} selected={filters.selected === a.clientId} onClick={() => setFilters({ ...filters, selected: a.clientId })}>{a.name}</SlicerButton>
        ))}
      </div>
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
