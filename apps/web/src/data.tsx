import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { accountView, combine, type AccountView, type Combined } from '@zp/core'
import { readInputFolder } from './devInput.ts'
import { deleteAccount, loadAccounts, saveAccount, type AccountRecord } from './db.ts'

export interface Filters {
  selected: string | null      // client id, null = all accounts
  asOf: string | null          // null = latest data date
  ratePct: number
  equityFnoOnly: boolean       // leave mutual fund purchases out of Invested (mutual funds are never in Value)
}

interface DataContext {
  ready: boolean
  accounts: AccountRecord[]
  filters: Filters
  setFilters: (f: Filters) => void
  date: string                 // effective as-of date
  chosen: AccountRecord[]      // accounts matching the selection
  views: AccountView[]
  total: Combined
  save: (next: AccountRecord[]) => Promise<void>
  remove: (clientId: string) => Promise<void>
}

const Ctx = createContext<DataContext | null>(null)

export const useData = () => {
  const c = useContext(Ctx)
  if (!c) throw new Error('useData must be used inside DataProvider')
  return c
}

async function loadInputFolder() {
  try {
    const { accounts } = await readInputFolder()
    for (const acc of accounts) await saveAccount(acc)
    return await loadAccounts()
  } catch { return [] }
}

/** Accounts, selection filters and the computed per-account views, shared by every page. */
export function DataProvider({ children }: { children: ReactNode }) {
  const [accounts, setAccounts] = useState<AccountRecord[] | null>(null)
  const [filters, setFilters] = useState<Filters>({ selected: null, asOf: null, ratePct: 12, equityFnoOnly: true })

  useEffect(() => {
    void (async () => {
      let a = await loadAccounts()
      if (!a.length && import.meta.env.DEV) a = await loadInputFolder()   // dev convenience: load Input/ on first run
      setAccounts(a)
    })()
  }, [])

  const save = useCallback(async (next: AccountRecord[]) => {
    for (const a of next) await saveAccount(a)
    setAccounts(await loadAccounts())
  }, [])
  const remove = useCallback(async (id: string) => {
    await deleteAccount(id)
    setAccounts(await loadAccounts())
    setFilters(f => (f.selected === id ? { ...f, selected: null } : f))
  }, [])

  const list = useMemo(() => accounts ?? [], [accounts])
  const date = useMemo(() => {
    if (filters.asOf) return filters.asOf
    const dates = list.flatMap(a => [a.holdingsAsOn ?? '', a.ledger.at(-1)?.date ?? '']).filter(Boolean)
    return dates.sort().at(-1) ?? new Date().toISOString().slice(0, 10)
  }, [list, filters.asOf])
  const chosen = useMemo(() => list.filter(a => filters.selected === null || a.clientId === filters.selected), [list, filters.selected])
  const views = useMemo(() => chosen.map(a => accountView(a, date, filters.ratePct / 100, { excludeMutualFunds: filters.equityFnoOnly })), [chosen, date, filters.ratePct, filters.equityFnoOnly])
  const total = useMemo(() => combine(views), [views])

  const value = useMemo<DataContext>(() => ({
    ready: accounts !== null, accounts: list, filters, setFilters, date, chosen, views, total, save, remove,
  }), [accounts, list, filters, date, chosen, views, total, save, remove])

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
