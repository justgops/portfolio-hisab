import type { ReactNode } from 'react'

// Colours come from the ui-kit theme (primary, gray scale), same as fabric-costing-lite. No hex values here.
const HEAD = 'bg-primary text-primary-foreground'

export function Panel({ title, children, className = '' }: { title: string; children: ReactNode; className?: string }) {
  return (
    <section className={`overflow-hidden rounded-lg border border-gray-300 bg-white ${className}`}>
      <h2 className={`${HEAD} px-3 py-2 text-center text-base font-semibold`}>{title}</h2>
      {children}
    </section>
  )
}

/** Table cells: roomy tap targets on phones, denser on desktop. */
export const th = `${HEAD} sticky top-0 px-2 py-1.5 text-right align-bottom text-xs font-semibold leading-tight first:text-left`
export const td = 'whitespace-nowrap px-2 py-2 text-right text-sm tabular-nums text-gray-800 first:text-left sm:py-1'
export const tdTotal = `${td} border-t-2 border-primary/40 font-bold`

export function Stat({ label, value, negative }: { label: string; value: string; negative?: boolean }) {
  return (
    <div className="px-2 py-3 text-center sm:px-4">
      <div className="text-sm font-semibold text-primary sm:text-base">{label}</div>
      <div className={`text-xl font-bold tabular-nums sm:text-2xl lg:text-3xl ${negative ? 'text-red-600' : 'text-gray-800'}`}>{value}</div>
    </div>
  )
}

/** Account / tab selector button. */
export function SlicerButton({ selected, onClick, children }: { selected: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={selected}
      className={`h-10 shrink-0 rounded-lg border px-3 text-sm font-semibold sm:px-4 ${selected ? 'border-primary bg-primary text-primary-foreground' : 'border-gray-300 bg-white text-gray-800 hover:bg-gray-100'}`}>
      {children}
    </button>
  )
}

/** Small label/value pair used by the phone card layouts. */
export function Metric({ label, value, negative }: { label: string; value: string; negative?: boolean }) {
  return (
    <div>
      <div className="text-xs text-gray-500">{label}</div>
      <div className={`text-sm font-semibold tabular-nums ${negative ? 'text-red-600' : 'text-gray-800'}`}>{value}</div>
    </div>
  )
}

/** Headline number card. `tone` colours the value: good = green, bad = red. */
export function Kpi({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: 'good' | 'bad' }) {
  const color = tone === 'good' ? 'text-green-700' : tone === 'bad' ? 'text-red-600' : 'text-gray-800'
  return (
    <div className="rounded-lg border border-gray-300 bg-white px-3 py-2" title={hint}>
      <div className="text-xs font-semibold text-primary sm:text-sm">{label}</div>
      <div className={`text-xl font-bold tabular-nums sm:text-2xl ${color}`}>{value}</div>
    </div>
  )
}
