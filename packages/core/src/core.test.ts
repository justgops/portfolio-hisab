import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { buildLots, buildReport, cashSlices, opportunityCost, parseLedger, parseTradebook, fyLabel, fyStartYear } from './index.ts'

// Input/<ClientID>/<kind>/<file>, see scripts/inputLayout.ts
const kindDir = (f: string) => (/_LEDGER\./.test(f) ? 'ledger' : /_HOLDINGS\./.test(f) ? 'holdings' : /_DIVIDENDS\./.test(f) ? 'dividends' : 'tradebook')
const inputUrl = (f: string) => new URL(`../../../Input/${f.split('_')[0]}/${kindDir(f)}/${f}`, import.meta.url)
const input = (f: string) => readFileSync(inputUrl(f), 'utf8')

describe('opportunityCost', () => {
  it('2500 from 1 Oct: partial FY1 (182d), full FY2, FY3', () => {
    const r = opportunityCost(2500, '2026-10-01', '2029-04-01', 0.12)
    expect(r.byFY.map(x => x.fy)).toEqual(['2026-27', '2027-28', '2028-29'])
    expect(r.byFY[0].days).toBe(182)
    expect(r.byFY[0].simple).toBeCloseTo(149.59, 2)
    expect(r.byFY[1].simple).toBeCloseTo(300, 2)
    expect(r.byFY[1].compound).toBeCloseTo(317.95, 2)
    expect(r.byFY[2].compound).toBeCloseTo(356.10, 2)
    expect(r.simple).toBeCloseTo(749.59, 2)
    expect(r.compound).toBeCloseTo(823.64, 2)
  })
  it('sell mid-year stops clock; same-day is zero', () => {
    expect(opportunityCost(1000, '2026-10-01', '2026-10-01', 0.12).simple).toBe(0)
    const r = opportunityCost(1000, '2026-04-01', '2026-10-01', 0.12)
    expect(r.byFY).toHaveLength(1)
    expect(r.simple).toBeCloseTo(1000 * 0.12 * 183 / 365, 6)
  })
  it('leap FY uses 366 denominator, full year = exactly rate', () => {
    expect(opportunityCost(1000, '2023-04-01', '2024-04-01', 0.12).simple).toBeCloseTo(120, 9)
  })
  it('FY helpers', () => {
    expect(fyStartYear('2027-03-31')).toBe(2026)
    expect(fyStartYear('2027-04-01')).toBe(2027)
    expect(fyLabel(2026)).toBe('2026-27')
  })
})

describe('sample files', () => {
  const trades = parseTradebook(input('YK2142_2026-27_EQ.csv'))
  it('parses tradebook', () => {
    expect(trades).toHaveLength(3)
    expect(trades[1]).toMatchObject({ symbol: 'RELIANCE', side: 'buy', quantity: 1, date: '2026-10-07' })
  })
  it('flags sells with no buy history', () => {
    const { unmatchedSells, slices } = buildLots(trades)
    expect(unmatchedSells.map(u => [u.symbol, u.quantity])).toEqual([['SSRETAIL', 35], ['JPL', 192]])
    expect(slices).toHaveLength(1)
  })
  it('opening lots resolve sells', () => {
    const { unmatchedSells, slices } = buildLots(trades, [{ symbol: 'JPL', quantity: 192, date: '2025-04-10', price: 1000 }])
    expect(unmatchedSells).toHaveLength(1)
    const jpl = slices.find(s => s.symbol === 'JPL')!
    expect(jpl.sellDate).toBe('2026-10-28')
  })
  it('report: open lot needs price for value', () => {
    const { slices } = buildLots(trades)
    const noPx = buildReport(slices, { rate: 0.12, asOf: '2026-11-14' })
    expect(noPx.totals.openValue).toBeNull()
    const px = buildReport(slices, { rate: 0.12, asOf: '2026-11-14', prices: { RELIANCE: 1300 } })
    expect(px.totals.unrealizedGain).toBeCloseTo(87.3, 1)
    expect(px.totals.oppSimple).toBeGreaterThan(0)
  })
  it('classifies ledger', () => {
    const l = parseLedger(input('YK2142_2026-27_LEDGER.csv'))
    const kinds = l.map(e => e.kind)
    expect(kinds[0]).toBe('opening')
    expect(kinds).toContain('payout')
    expect(kinds).toContain('settlement')
    expect(kinds).toContain('fno')
    expect(kinds.filter(k => k === 'charge')).toHaveLength(6)
    expect(kinds.at(-1)).toBe('closing')
  })
  it('cash slices: payouts with no tracked payin are excess', () => {
    const { slices, excessPayout } = cashSlices(parseLedger(input('YK2142_2026-27_LEDGER.csv')))
    expect(slices).toHaveLength(0)
    expect(excessPayout).toBeCloseTo(4479.7 + 20409.71, 2)
  })
})

import { parseHoldingsXlsx, pricesFromHoldings, reconcile } from './index.ts'

describe('holdings xlsx', () => {
  const h = parseHoldingsXlsx(new Uint8Array(readFileSync(inputUrl('YK2142_2026-11-14_HOLDINGS.xlsx'))))
  it('parses equity + mf, ignores combined', () => {
    expect(h.clientId).toBe('YK2142')
    expect(h.asOn).toBe('2026-11-14')
    expect(h.holdings.filter(x => x.kind === 'equity')).toHaveLength(22)
    expect(h.holdings.filter(x => x.kind === 'mf')).toHaveLength(3)
    const sbc = h.holdings.find(x => x.symbol === 'SBC')!
    expect(sbc).toMatchObject({ quantity: 1500, avgPrice: 19.4533, prevClose: 70.3 })
  })
  it('invested/present value match statement summary', () => {
    const eq = h.holdings.filter(x => x.kind === 'equity')
    expect(eq.reduce((a, x) => a + x.quantity * x.avgPrice, 0)).toBeCloseTo(665542.7759, 0)
    expect(eq.reduce((a, x) => a + x.quantity * x.prevClose, 0)).toBeCloseTo(798275.24, 0)
    const mf = h.holdings.filter(x => x.kind === 'mf')
    expect(mf.reduce((a, x) => a + x.quantity * x.avgPrice, 0)).toBeCloseTo(579971.0521, 0)
  })
  it('prices + reconcile with tradebook', () => {
    expect(pricesFromHoldings(h).RELIANCE).toBe(1339.7)
    const { slices } = buildLots(parseTradebook(input('YK2142_2026-27_EQ.csv')))
    const rel = reconcile(h, slices).find(x => x.symbol === 'RELIANCE')!
    expect(rel).toMatchObject({ datedQty: 1, undatedQty: 0 })
    expect(reconcile(h, slices).find(x => x.symbol === 'SBC')!.undatedQty).toBe(1500)
  })
})

import { cashBalanceAsOf, flowsFromLedger } from './index.ts'

describe('ledger cash balance', () => {
  const led = parseLedger(input('YK2142_2017-18_to_2026-27_LEDGER.csv'))
  it('cash balance on 2025-12-31', () => {
    expect(cashBalanceAsOf(led, '2025-12-31')).toBeCloseTo(48716.49, 1)
  })
})

import { accountView, combine } from './index.ts'

describe('dashboard view-model', () => {
  const led = parseLedger(input('YK2142_2017-18_to_2026-27_LEDGER.csv'))
  const hs = parseHoldingsXlsx(new Uint8Array(readFileSync(inputUrl('YK2142_2026-11-14_HOLDINGS.xlsx'))))
  const acc = { clientId: 'YK2142', name: 'Test Owner', ledger: led, holdings: hs.holdings.filter(h => h.kind === 'equity'), holdingsAsOn: hs.asOn }
  const v = accountView(acc, '2026-11-14', 0.12)
  it('equity-only market value, long-term qty parsed', () => {
    expect(v.market).toBeCloseTo(798275.24, 0)
    expect(v.holdings.find(h => h.symbol === 'APLAPOLLO')).toMatchObject({ quantity: 20, longTermQty: 20 })
    expect(v.holdings.find(h => h.symbol === 'RELIANCE')!.longTermQty).toBe(0)
  })
  it('net pnl = market + cash - net investment', () => {
    expect(v.hurdleGap).toBeCloseTo(v.market + v.cash - v.netInvestment, 6)
  })
  it('combine of one account equals account; two accounts double', () => {
    const one = combine([v]); expect(one.netInvestment).toBeCloseTo(v.netInvestment, 6)
    const two = combine([v, v]); expect(two.schedule.length).toBe(v.schedule.length)
    expect(two.totalInvestment).toBeCloseTo(2 * v.totalInvestment, 6)
    expect(two.schedule[3].closing).toBeCloseTo(2 * v.schedule[3].closing, 6)
  })
})

import { coverageByFY, dedupeTrades } from './index.ts'

describe('coverage', () => {
  const ledger = parseLedger(input('YK2142_2017-18_to_2026-27_LEDGER.csv'))
  const trade = (date: string) => ({ ...parseTradebook(input('YK2142_2026-27_EQ.csv'))[0], date })
  it('with no tradebooks, every FY the ledger shows trading is missing', () => {
    const cov = coverageByFY(ledger, [], [])
    expect(cov.filter(c => c.missingEq).map(c => c.fy)).toEqual(['2017-18', '2018-19', '2020-21', '2021-22', '2022-23', '2023-24', '2024-25', '2025-26', '2026-27'])
    expect(cov.filter(c => c.missingFo).map(c => c.fy)).toEqual(['2020-21', '2021-22', '2022-23', '2023-24', '2024-25', '2026-27'])
  })
  it('a tradebook row in an FY clears that FY only', () => {
    const cov = coverageByFY(ledger, [trade('2021-06-01')], [])
    const miss = cov.filter(c => c.missingEq).map(c => c.fy)
    expect(miss).not.toContain('2021-22')
    expect(miss).toContain('2022-23')
  })
})

import { clientIdFromFilename } from './index.ts'
describe('clientIdFromFilename', () => {
  it('handles console and renamed files', () => {
    expect(clientIdFromFilename('tradebook-YK2142-EQ (3).csv')).toBe('YK2142')
    expect(clientIdFromFilename('YK2142_2026-27_LEDGER.csv')).toBe('YK2142')
    expect(clientIdFromFilename('YK2142_2026-11-14_HOLDINGS.xlsx')).toBe('YK2142')
    expect(clientIdFromFilename('YK2142_2021-22_EQ.csv')).toBe('YK2142')
    expect(clientIdFromFilename('random.csv')).toBeNull()
    expect(clientIdFromFilename('ledger-final.csv')).toBeNull()
    expect(clientIdFromFilename('tradebook-eq-2021.csv')).toBeNull()
    expect(clientIdFromFilename('tradebook-2021-22.csv')).toBeNull()
    expect(clientIdFromFilename('my YK2142 ledger.csv')).toBe('YK2142')
    expect(clientIdFromFilename('yk2142-eq.csv')).toBe('YK2142')
    expect(clientIdFromFilename('ledger-SMJ193.csv')).toBe('SMJ193')
    expect(clientIdFromFilename('ledger-ZKC952.csv')).toBe('ZKC952')
    expect(clientIdFromFilename('tradebook-SMJ193-FO.csv')).toBe('SMJ193')
    expect(clientIdFromFilename('INE002A01018.csv')).toBeNull()      // an ISIN is not a client id
    expect(clientIdFromFilename('holdings-ABC12.xlsx')).toBeNull()   // too few digits
  })
})

import { identifyFile } from './index.ts'
describe('identifyFile (any filename)', () => {
  const bytes = (f: string) => new Uint8Array(readFileSync(inputUrl(f)))
  it('tradebook: segment + FY from contents, client from fallback', () => {
    const eq = identifyFile('download (7).csv', bytes('YK2142_2020-21_EQ.csv'), 'YK2142')
    expect(eq).toMatchObject({ kind: 'tradebook-eq', clientId: 'YK2142', canonical: 'YK2142_2020-21_EQ.csv', source: 'fallback' })
    expect(identifyFile('x.csv', bytes('YK2142_2024-25_FO.csv'), 'YK2142').canonical).toBe('YK2142_2024-25_FO.csv')
  })
  it('tradebook without any client id gives no canonical name', () => {
    const r = identifyFile('x.csv', bytes('YK2142_2020-21_EQ.csv'))
    expect(r.clientId).toBeNull(); expect(r.canonical).toBeNull()
  })
  it('ledger: client id from contents, FY range from dates', () => {
    const r = identifyFile('Statement.csv', bytes('YK2142_2017-18_to_2026-27_LEDGER.csv'))
    expect(r).toMatchObject({ kind: 'ledger', clientId: 'YK2142', source: 'contents', canonical: 'YK2142_2017-18_to_2026-27_LEDGER.csv' })
    // a short ledger with no pay-ins never mentions the client id, so it needs a fallback
    expect(identifyFile('s.csv', bytes('YK2142_2026-27_LEDGER.csv')).canonical).toBeNull()
    expect(identifyFile('s.csv', bytes('YK2142_2026-27_LEDGER.csv'), 'YK2142').canonical).toBe('YK2142_2026-27_LEDGER.csv')
  })
  it('holdings: client + as-on date from contents', () => {
    expect(identifyFile('holdings (2).xlsx', bytes('YK2142_2026-11-14_HOLDINGS.xlsx')).canonical).toBe('YK2142_2026-11-14_HOLDINGS.xlsx')
  })
  it('rejects unknown files', () => {
    expect(() => identifyFile('a.csv', new TextEncoder().encode('a,b\n1,2'))).toThrow(/Unrecognised/)
  })
})


describe('matching edge cases', () => {
  const eq = new Uint8Array(readFileSync(inputUrl('YK2142_2020-21_EQ.csv')))
  it('a name like ledger-final.csv does not invent an account', () => {
    expect(identifyFile('tradebook-eq-2021.csv', eq, 'YK2142')).toMatchObject({ clientId: 'YK2142', source: 'fallback' })
  })
  it('currency / commodity tradebooks are rejected, not filed as F&O', () => {
    const cds = 'symbol,isin,trade_date,exchange,segment,series,trade_type,auction,quantity,price,trade_id,order_id,order_execution_time,expiry_date\nUSDINR26NOVFUT,,2026-11-02,CDS,CDS,,buy,false,1000,83,1,2,2026-11-02T10:00:00,2026-11-27'
    expect(() => identifyFile('x.csv', new TextEncoder().encode(cds), 'YK2142')).toThrow(/Unsupported tradebook segment "CDS"/)
  })
  it('dedupe keeps different fills that share a trade number', () => {
    const t = parseTradebook(readFileSync(inputUrl('YK2142_2020-21_EQ.csv'), 'utf8'))
    const other = { ...t[0], date: '2021-03-01', quantity: 7 }
    expect(dedupeTrades([t[0], other])).toHaveLength(2)
    expect(dedupeTrades([t[0], { ...t[0] }])).toHaveLength(1)
    // a row saved before orderId existed must still match its re-imported twin
    expect(dedupeTrades([{ ...t[0], orderId: undefined as unknown as string }, t[0]])).toHaveLength(1)
  })
})

import { checkLedger } from './index.ts'
describe('checkLedger', () => {
  const full = parseLedger(input('YK2142_2017-18_to_2026-27_LEDGER.csv'))
  it('full ledger reconciles from zero opening', () => {
    const c = checkLedger(full)
    expect(c).toMatchObject({ ok: true, startsMidway: false, from: '2017-10-10', to: '2026-11-11' })
    expect(c.breaks).toHaveLength(0)
  })
  it('a missing row is a break at the next row', () => {
    const cut = full.filter((_, i) => i !== 300)
    const c = checkLedger(cut)
    expect(c.ok).toBe(false)
    expect(c.breaks.length).toBeGreaterThan(0)
  })
  it('a ledger that opens with a balance is flagged as starting midway', () => {
    const c = checkLedger(parseLedger(input('YK2142_2026-27_LEDGER.csv')))
    expect(c.startsMidway).toBe(true)
    expect(c.openingBalance).toBeCloseTo(4568.2, 1)
    expect(c.ok).toBe(false)
  })
  it('empty ledger is not ok', () => { expect(checkLedger([]).ok).toBe(false) })
})

import { blankAccount, mergeAccount, parseBackup, serializeBackup, xirr } from './index.ts'

describe('xirr', () => {
  it('100 in, 110 out a year later is 10%', () => {
    expect(xirr([{ date: '2025-01-01', amount: -100 }, { date: '2026-01-01', amount: 110 }])!).toBeCloseTo(0.10, 4)
  })
  it('is undefined for one-sided or single flows', () => {
    expect(xirr([{ date: '2025-01-01', amount: -100 }])).toBeNull()
    expect(xirr([{ date: '2025-01-01', amount: -100 }, { date: '2026-01-01', amount: -5 }])).toBeNull()
  })
  it('handles a loss', () => {
    expect(xirr([{ date: '2025-01-01', amount: -100 }, { date: '2026-01-01', amount: 80 }])!).toBeCloseTo(-0.20, 3)
  })
})

describe('account metrics (YK2142 as of 2026-11-14)', () => {
  const led = parseLedger(input('YK2142_2017-18_to_2026-27_LEDGER.csv'))
  const hs = parseHoldingsXlsx(new Uint8Array(readFileSync(inputUrl('YK2142_2026-11-14_HOLDINGS.xlsx'))))
  const acc = { clientId: 'YK2142', name: 'S', ledger: led, holdings: hs.holdings.filter(h => h.kind === 'equity'), holdingsAsOn: hs.asOn }
  const v = accountView(acc, '2026-11-14', 0.12)
  it('value, gain, hurdle gap', () => {
    expect(v.value).toBeCloseTo(v.market + v.cash, 6)
    expect(v.gain).toBeCloseTo(v.value - v.totalInvestment, 6)
    expect(v.gain).toBeGreaterThan(700000)
    expect(v.hurdleGap).toBeCloseTo(v.value - v.netInvestment, 6)
  })
  it('by default invested is exactly pay-ins minus payouts (Power BI style)', () => {
    const plain = flowsFromLedger(led, '2026-11-14').reduce((t, f) => t + f.amount, 0)
    expect(v.totalInvestment).toBeCloseTo(plain, 6)
    expect(v.totalInvestment).toBeCloseTo(330208, 0)
    expect(v.mfOutflow).toBe(0)
  })
  it('as of 31 Dec 2025 it reproduces the Power BI report: invested 3,47,685, cash 48,716', () => {
    const p = accountView(acc, '2025-12-31', 0.12)
    expect(p.totalInvestment).toBeCloseTo(347685, -1)
    expect(p.cash).toBeCloseTo(48716, 0)
  })
  it('equity & F&O only takes the mutual fund purchases out of invested', () => {
    const e = accountView(acc, '2026-11-14', 0.12, { excludeMutualFunds: true })
    expect(e.mfOutflow).toBeCloseTo(135000, 0)
    expect(e.totalInvestment).toBeCloseTo(v.totalInvestment - 135000, 0)
    expect(e.value).toBeCloseTo(v.value, 6)       // value is equity + cash either way
  })
  it('xirr is a sensible annual return', () => {
    expect(v.xirr!).toBeGreaterThan(0.05); expect(v.xirr!).toBeLessThan(0.25)
  })
  it('F&O net from ledger obligations, cash share', () => {
    expect(v.fnoNet).toBeCloseTo(-260448, -1)
    expect(v.cashPct).toBeGreaterThan(20); expect(v.cashPct).toBeLessThan(28)
  })
  it('holding rows: invested, pnl, weights add to 100, sorted by value', () => {
    const w = v.holdings.reduce((t, h) => t + h.weight, 0)
    expect(w).toBeCloseTo(100, 6)
    const sbc = v.holdings.find(h => h.symbol === 'SBC')!
    expect(sbc.invested).toBeCloseTo(1500 * 19.4533, 2)
    expect(sbc.pnl).toBeCloseTo(76270, 0)
    expect(v.holdings.map(h => h.value)).toEqual([...v.holdings.map(h => h.value)].sort((a, b) => b - a))
  })
  it('combined xirr lies between the accounts', () => {
    const c = combine([v, accountView({ ...acc, clientId: 'X' }, '2026-11-14', 0.12)])
    expect(c.xirr!).toBeCloseTo(v.xirr!, 3)       // identical accounts => same return
    expect(c.gain).toBeCloseTo(2 * v.gain, 4)
  })
})

describe('backup', () => {
  const led = parseLedger(input('YK2142_2026-27_LEDGER.csv'))
  const a = { ...blankAccount('YK2142', 'Test Owner'), ledger: led }
  it('round-trips', () => {
    const b = parseBackup(serializeBackup([a]))
    expect(b.accounts[0].ledger).toHaveLength(led.length)
    expect(b.accounts[0].name).toBe('Test Owner')
  })
  it('still reads backups exported before the rename', () => {
    const old = serializeBackup([a]).replace('"app":"portfolio-hisab"', '"app":"zerodha-portfolio"')
    expect(old).toContain('zerodha-portfolio')
    expect(parseBackup(old).accounts).toHaveLength(1)
  })
  it('rejects junk', () => {
    expect(() => parseBackup('nope')).toThrow(/valid backup/)
    expect(() => parseBackup('{"a":1}')).toThrow(/Portfolio Hisab backup/)
  })
  it('merge keeps a custom local name, unions ledger without duplicating', () => {
    const merged = mergeAccount({ ...a, name: 'My Name' }, { ...a, name: 'YK2142' })
    expect(merged.name).toBe('My Name')
    expect(merged.ledger).toHaveLength(a.ledger.filter(e => e.kind !== 'opening' && e.kind !== 'closing').length)
  })
  it('merge prefers newer holdings', () => {
    const old = { ...a, holdingsAsOn: '2026-01-01' as const }
    const newer = { ...a, holdingsAsOn: '2026-11-14' as const, holdings: [] }
    expect(mergeAccount(old, newer).holdingsAsOn).toBe('2026-11-14')
    expect(mergeAccount(newer, old).holdingsAsOn).toBe('2026-11-14')
  })
})

import { aggregateHoldings } from './index.ts'
describe('aggregateHoldings', () => {
  const led = parseLedger(input('YK2142_2026-27_LEDGER.csv'))
  const hs = parseHoldingsXlsx(new Uint8Array(readFileSync(inputUrl('YK2142_2026-11-14_HOLDINGS.xlsx'))))
  const acc = { clientId: 'A', name: 'A', ledger: led, holdings: hs.holdings.filter(h => h.kind === 'equity'), holdingsAsOn: hs.asOn }
  const a = accountView(acc, '2026-11-14', 0.12), b = accountView({ ...acc, clientId: 'B' }, '2026-11-14', 0.12)
  it('sums same symbols across accounts and re-bases weights', () => {
    const rows = aggregateHoldings([a, b])
    const one = a.holdings.find(h => h.symbol === 'SBC')!, two = rows.find(h => h.symbol === 'SBC')!
    expect(two.quantity).toBe(2 * one.quantity)
    expect(two.value).toBeCloseTo(2 * one.value, 6)
    expect(two.avgPrice).toBeCloseTo(one.avgPrice, 6)
    expect(rows.reduce((t, r) => t + r.weight, 0)).toBeCloseTo(100, 6)
    expect(rows).toHaveLength(a.holdings.length)
  })
})

import { dedupeDividends, parseDividends } from './index.ts'
describe('dividends', () => {
  const csv = 'Symbol,Ex-date,Qty,Dividend per share,Total dividend$\nAPLAPOLLO#,2025-08-22,55,5.75,316.25$\nSBIN,2021-06-03,1,4,4$'
  it('parses $-suffixed totals and strips # from symbols', () => {
    expect(parseDividends(csv)).toEqual([
      { symbol: 'APLAPOLLO', date: '2025-08-22', quantity: 55, perShare: 5.75, amount: 316.25 },
      { symbol: 'SBIN', date: '2021-06-03', quantity: 1, perShare: 4, amount: 4 },
    ])
  })
  it('dedupes and sorts by date', () => {
    const d = parseDividends(csv)
    expect(dedupeDividends([...d, ...d]).map(x => x.symbol)).toEqual(['SBIN', 'APLAPOLLO'])
  })
  it('identifies as dividends file for the given client', () => {
    expect(identifyFile('BP1917_x.csv', new TextEncoder().encode(csv)))
      .toMatchObject({ kind: 'dividends', clientId: 'BP1917', canonical: 'BP1917_2021-22_to_2025-26_DIVIDENDS.csv' })
  })
  it('rejects a CSV without the dividend columns', () => {
    expect(() => parseDividends('Symbol,Qty\nA,1')).toThrow(/Not a dividends CSV/)
  })
})


describe('mutual fund ledger rows', () => {
  const l = parseLedger(input('YK2142_2017-18_to_2026-27_LEDGER.csv'))
  it('are classified as mf, not other', () => {
    const mf = l.filter(e => e.kind === 'mf')
    expect(mf).toHaveLength(27)
    expect(mf.every(e => /^Investment in/.test(e.particulars))).toBe(true)
    expect(l.filter(e => e.kind === 'other').some(e => /^Investment in/.test(e.particulars))).toBe(false)
  })
  it('are never counted as pay-ins or payouts unless excluded on purpose', () => {
    const n = l.filter(e => e.kind === 'payin' || e.kind === 'payout').length
    expect(flowsFromLedger(l, '2026-11-14')).toHaveLength(n)
    expect(flowsFromLedger(l, '2026-11-14', { excludeMutualFunds: true })).toHaveLength(n + 27)
  })
})

describe('other capital (off-ledger)', () => {
  const l = parseLedger(input('YK2142_2026-27_LEDGER.csv'))
  const base = { clientId: 'A', name: 'A', ledger: l, holdings: [], holdingsAsOn: null }
  it('counts as a pay-in on its date and moves invested, schedule and xirr', () => {
    const a = accountView(base, '2026-11-14', 0.12)
    const b = accountView({ ...base, extraCapital: [{ id: '1', date: '2026-04-01', amount: 100000, note: 'IPO' }] }, '2026-11-14', 0.12)
    expect(b.totalInvestment).toBeCloseTo(a.totalInvestment + 100000, 6)
    expect(b.otherCapital).toBe(100000)
    expect(b.netInvestment).toBeGreaterThan(a.netInvestment + 100000)    // earns the hurdle too
  })
  it('entries dated after the as-of date are ignored', () => {
    const b = accountView({ ...base, extraCapital: [{ id: '1', date: '2027-01-01', amount: 5e6, note: 'future' }] }, '2026-11-14', 0.12)
    expect(b.otherCapital).toBe(0)
  })
  it('negative amount takes capital out', () => {
    const a = accountView(base, '2026-11-14', 0.12)
    const b = accountView({ ...base, extraCapital: [{ id: '1', date: '2026-05-01', amount: -2000, note: 'gift out' }] }, '2026-11-14', 0.12)
    expect(b.totalInvestment).toBeCloseTo(a.totalInvestment - 2000, 6)
  })
  it('merge unions entries by id', () => {
    const e = { id: 'x', date: '2026-04-01', amount: 1, note: '' }
    const m = mergeAccount({ ...blankAccount('A'), extraCapital: [e] }, { ...blankAccount('A'), extraCapital: [e, { ...e, id: 'y' }] })
    expect(m.extraCapital.map(x => x.id)).toEqual(['x', 'y'])
  })
})

describe('accountView dividends', () => {
  const h = { symbol: 'TATAPOWER', isin: 'X', kind: 'equity' as const, sector: '', quantity: 750, longTermQty: 750, avgPrice: 100, prevClose: 120 }
  const dividends = [
    { symbol: 'TATAPOWER', date: '2024-07-04', quantity: 750, perShare: 2, amount: 1500 },
    { symbol: 'SBIN', date: '2021-06-03', quantity: 1, perShare: 4, amount: 4 },
    { symbol: 'TATAPOWER', date: '2030-01-01', quantity: 750, perShare: 2, amount: 1500 },
  ]
  const v = accountView({ clientId: 'A', name: 'A', ledger: [], holdings: [h], holdingsAsOn: '2026-11-14', dividends }, '2026-11-14', 0.12)
  it('totals dividends up to as-of date, including sold symbols', () => expect(v.dividends).toBe(1504))
  it('per-holding dividends match the held symbol only', () => expect(v.holdings[0].dividends).toBe(1500))
  it('adds dividends to gain and hurdle gap, not to value', () => {
    expect(v.value).toBe(750 * 120)
    expect(v.gain).toBe(750 * 120 + 1504)
    expect(v.hurdleGap).toBe(750 * 120 + 1504)
  })
  it('adds dividends as positive cashflows on their dates', () => {
    expect(v.cashflows.filter(c => c.date === '2024-07-04')).toEqual([{ date: '2024-07-04', amount: 1500 }])
  })
})

import { upgradeLedgerKinds } from './index.ts'

describe('upgradeLedgerKinds (data saved by an older build)', () => {
  const fresh = parseLedger(input('YK2142_2017-18_to_2026-27_LEDGER.csv'))
  // what an older build stored: mutual fund rows labelled 'other'
  const stale = fresh.map(e => (e.kind === 'mf' ? { ...e, kind: 'other' as const } : e))
  it('the switch does nothing on stale rows, and works after the upgrade', () => {
    const acc = (ledger: typeof fresh) => ({ clientId: 'A', name: 'A', ledger, holdings: [], holdingsAsOn: null })
    const before = accountView(acc(stale), '2026-11-14', 0.12, { excludeMutualFunds: true })
    expect(before.mfOutflow).toBe(0)
    const up = upgradeLedgerKinds(stale)
    expect(up.changed).toBe(true)
    const after = accountView(acc(up.entries), '2026-11-14', 0.12, { excludeMutualFunds: true })
    expect(after.mfOutflow).toBeCloseTo(135000, 0)
    expect(after.totalInvestment).toBeCloseTo(before.totalInvestment - 135000, 0)
  })
  it('is a no-op on up-to-date data', () => {
    const up = upgradeLedgerKinds(fresh)
    expect(up.changed).toBe(false)
    expect(up.entries).toBe(fresh)
  })
  it('also upgrades old "Settlement value" rows so tradebook coverage counts them', () => {
    const row = { ...fresh[1], particulars: 'Settlement value for April 2022 - May 2022 in NSE with settlement number 1', kind: 'other' as const }
    expect(upgradeLedgerKinds([row]).entries[0].kind).toBe('settlement')
  })
})

import { suggestOffLedgerCapital } from './index.ts'

describe('off-ledger capital suggestions', () => {
  const trade = (symbol: string, isin: string, date: string, side: 'buy' | 'sell', quantity: number, price: number, n: number) =>
    ({ symbol, isin, date, exchange: 'NSE', side, quantity, price, tradeId: String(n), orderId: String(n), executedAt: `${date}T10:00:00` })
  const hold = (symbol: string, isin: string, quantity: number, avgPrice: number) =>
    ({ symbol, isin, kind: 'equity' as const, sector: '', quantity, longTermQty: 0, avgPrice, prevClose: avgPrice })
  const acct = (trades: ReturnType<typeof trade>[], holdings: ReturnType<typeof hold>[]) =>
    ({ ...blankAccount('T1234'), eqTrades: trades, holdings, holdingsAsOn: '2026-11-14' })

  it('a symbol rename (same ISIN) is not new capital', () => {
    const a = acct([trade('CREATIVE', 'INE985W01018', '2024-09-16', 'buy', 500, 1000, 1)], [hold('CNL', 'INE985W01018', 500, 1000)])
    expect(suggestOffLedgerCapital(a).suggestions).toEqual([])
  })
  it('a bonus or split (more shares, same cost) is not new capital', () => {
    const a = acct([trade('ROTO', 'INE535D01037', '2024-12-17', 'buy', 1500, 300, 1)], [hold('ROTO', 'INE535D01037', 4500, 100)])
    expect(suggestOffLedgerCapital(a).suggestions).toEqual([])
  })
  it('shares with no purchase are suggested at the cost the tradebooks do not explain', () => {
    const a = acct([trade('AAA', 'INE000A01010', '2024-01-01', 'buy', 10, 100, 1)], [hold('AAA', 'INE000A01010', 30, 400), hold('BBB', 'INE000B01010', 10, 50)])
    const s = suggestOffLedgerCapital(a).suggestions
    expect(s.map(x => [x.key, Math.round(x.amount)])).toEqual([['hold:AAA', 11000]])   // BBB: ₹500 is under the noise threshold
  })
  it('a merger that moves shares to a new symbol and ISIN is not new capital', () => {
    const a = acct([trade('APOLLOTRI', 'INE919P01029', '2022-09-05', 'buy', 55, 1012, 1)], [hold('APLAPOLLO', 'INE702C01027', 55, 1012)])
    expect(suggestOffLedgerCapital(a).suggestions).toEqual([])
  })
  it('a split that changes the ISIN under the same symbol is not new capital', () => {
    const a = acct([trade('PCJ', 'INE785M01013', '2018-05-08', 'buy', 100, 170, 1), trade('PCJ', 'INE785M01021', '2025-07-04', 'buy', 1000, 16, 2)],
      [hold('PCJ', 'INE785M01021', 2000, 25)])   // Zerodha's average price differs from our lot matching, but most of the cost is explained
    expect(suggestOffLedgerCapital(a).suggestions).toEqual([])
  })
  it('extra shares sold after a bonus issue are not capital when the stock was bought before', () => {
    const a = acct([trade('SBC', 'INE04AK01028', '2023-11-23', 'buy', 3030, 33, 1), trade('SBC', 'INE04AK01028', '2024-02-09', 'sell', 4545, 23, 2)], [])
    expect(suggestOffLedgerCapital(a).suggestions).toEqual([])
  })
  it('a sell with no purchase is suggested at the sale proceeds', () => {
    const a = acct([trade('IPO', 'INE000C01010', '2025-12-19', 'sell', 6, 2600, 1)], [])
    expect(suggestOffLedgerCapital(a).suggestions).toMatchObject([{ key: 'sell:2025-12-19:IPO', amount: 15600 }])
  })
})
