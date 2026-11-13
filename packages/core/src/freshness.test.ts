import { describe, expect, it } from 'vitest'
import { accountFreshness, blankAccount, mergeAccount, type LedgerEntry } from './index.ts'

const row = (date: string): LedgerEntry => ({ particulars: 'x', date, voucherType: '', debit: 0, credit: 0, balance: 0, kind: 'other' })

describe('accountFreshness', () => {
  it('flags holdings older than a week and a ledger idle for a month', () => {
    const a = { ...blankAccount('A1'), holdingsAsOn: '2026-10-01', ledger: [row('2026-09-01')] }
    const f = accountFreshness(a, '2026-11-14')
    expect(f.items.find(i => i.kind === 'holdings')).toMatchObject({ ageDays: 44, stale: true })
    expect(f.items.find(i => i.kind === 'ledger')).toMatchObject({ stale: true })
    expect(f.reminders).toHaveLength(2)
  })
  it('fresh holdings and a recent import keep a quiet ledger fresh', () => {
    const a = { ...blankAccount('A1'), holdingsAsOn: '2026-11-12', ledger: [row('2026-08-01')], importedAt: { ledger: '2026-11-10T09:00:00.000Z' } }
    const f = accountFreshness(a, '2026-11-14')
    expect(f.reminders).toEqual([])
    expect(f.items.find(i => i.kind === 'ledger')!.ageDays).toBe(4)
  })
  it('missing files are reminded, optional ones are not', () => {
    const f = accountFreshness(blankAccount('A1', 'Alpha'), '2026-11-14')
    expect(f.reminders).toEqual(['Alpha: no ledger file yet'])
    expect(f.items.filter(i => i.staleAfter === null).every(i => !i.stale)).toBe(true)
  })
})

describe('mergeAccount importedAt', () => {
  it('keeps the later time per kind', () => {
    const l = { ...blankAccount('A1'), importedAt: { ledger: '2026-01-01T00:00:00Z', holdings: '2026-05-01T00:00:00Z' } }
    const i = { ...blankAccount('A1'), importedAt: { ledger: '2026-03-01T00:00:00Z' } }
    expect(mergeAccount(l, i).importedAt).toEqual({ ledger: '2026-03-01T00:00:00Z', holdings: '2026-05-01T00:00:00Z' })
  })
})
