import { openDB, type DBSchema } from 'idb'
import { dedupeTrades, upgradeLedgerKinds, type AccountRecord } from '@zp/core'

export type { AccountRecord }

interface Schema extends DBSchema {
  accounts: { key: string; value: AccountRecord }
}

const dbp = openDB<Schema>('zp-accounts', 1, {
  upgrade(db) { db.createObjectStore('accounts', { keyPath: 'clientId' }) },
})

/** Loads accounts, repairing any duplicated trades left by an older import (and saving the repair). */
export const loadAccounts = async () => {
  const db = await dbp
  const all = await db.getAll('accounts')
  for (const a of all) {
    const up = upgradeLedgerKinds(a.ledger)   // rows saved before newer labels (mutual fund, settlement value) existed
    if (up.changed) { a.ledger = up.entries; await db.put('accounts', a) }
    if (!a.dividends || !a.extraCapital) { a.dividends ??= []; a.extraCapital ??= []; await db.put('accounts', a) }   // records saved before these fields existed
    const eq = dedupeTrades(a.eqTrades), fo = dedupeTrades(a.foTrades)
    if (eq.length !== a.eqTrades.length || fo.length !== a.foTrades.length) {
      a.eqTrades = eq; a.foTrades = fo
      await db.put('accounts', a)
    }
  }
  return all
}
export const saveAccount = async (a: AccountRecord) => { await (await dbp).put('accounts', a) }
export const deleteAccount = async (id: string) => { await (await dbp).delete('accounts', id) }
