import { describe, expect, it } from 'vitest'
import { accountView, combine, estimateTax, insights, realizedGains, chargeSummary, concentration, termSplit, movers, type InsightAccount, type LedgerEntry, type Trade } from './index.ts'

const trade = (symbol: string, date: string, side: 'buy' | 'sell', quantity: number, price: number, n = 0): Trade =>
  ({ symbol, isin: '', date, exchange: 'NSE', side, quantity, price, tradeId: String(n), orderId: '', executedAt: `${date} 10:00:00` })
const led = (particulars: string, date: string, debit: number, credit: number, kind: LedgerEntry['kind'] = 'other'): LedgerEntry =>
  ({ particulars, date, voucherType: '', debit, credit, balance: 0, kind })

describe('chargeSummary', () => {
  it('sums DP, AMC, SEBI and smallcase rows by type and FY, ignores later dates', () => {
    const a = { ledger: [
      led('DP Charges for Sale of MRF on 1/1/2024', '2024-01-02', 15.93, 0, 'charge'),
      led('Annual Maintenance Charge for Demat Account for 2023-24', '2024-03-31', 300, 0),
      led('SEBI turnover fees for 1/1/24 to 31/1/24', '2024-04-02', 5, 0),
      led('Being fee for smallcase', '2024-05-01', 100, 0),
      led('Net settlement for Equity', '2024-05-01', 1000, 0, 'settlement'),
      led('DP Charges for Sale of X', '2030-01-01', 15.93, 0, 'charge'),
    ] } as InsightAccount
    const c = chargeSummary([a], '2024-12-31')
    expect(c.total).toBeCloseTo(15.93 + 300 + 5 + 100, 6)
    expect(c.byFY.map(x => x.fy)).toEqual(['2023-24', '2024-25'])
    expect(c.byType.map(x => x.label).sort()).toEqual(['DP charges', 'Demat AMC', 'SEBI turnover fees', 'Smallcase fee'])
  })
})

describe('realizedGains', () => {
  it('splits short-term, long-term and intraday; flags sells with no buy', () => {
    const a = { eqTrades: [
      trade('AAA', '2021-01-04', 'buy', 10, 100, 1),
      trade('AAA', '2022-06-01', 'sell', 10, 150, 2),            // long-term, +500
      trade('BBB', '2024-08-01', 'buy', 10, 100, 3),
      trade('BBB', '2024-09-01', 'sell', 10, 90, 4),             // short-term, -100
      trade('CCC', '2024-09-02', 'buy', 5, 100, 5),
      trade('CCC', '2024-09-02', 'sell', 5, 110, 6),             // intraday, +50
      trade('ZZZ', '2024-09-03', 'sell', 4, 10, 7),              // no buy
    ] } as InsightAccount
    const r = realizedGains([a], '2025-01-01')
    expect(r.ltcg).toBeCloseTo(500); expect(r.stcg).toBeCloseTo(-100); expect(r.intraday).toBeCloseTo(50)
    expect(r.total).toBeCloseTo(450)
    expect(r.unmatchedSells).toBe(4)
    expect(r.byFY.map(x => x.fy)).toEqual(['2022-23', '2024-25'])
    expect(r.firstTrade).toBe('2021-01-04')
  })
})

describe('estimateTax', () => {
  it('STCG 20% after Jul 2024, 15% before', () => {
    expect(estimateTax(2025, 0, 1000, 0, 0)).toBeCloseTo(200)
    expect(estimateTax(2023, 1000, 0, 0, 0)).toBeCloseTo(150)
  })
  it('LTCG only above the exemption; pre-2018 FYs untaxed', () => {
    expect(estimateTax(2025, 0, 0, 0, 100_000)).toBe(0)
    expect(estimateTax(2025, 0, 0, 0, 225_000)).toBeCloseTo(100_000 * 0.125)
    expect(estimateTax(2022, 0, 0, 200_000, 0)).toBeCloseTo(100_000 * 0.10)
    expect(estimateTax(2017, 0, 0, 900_000, 0)).toBe(0)
  })
  it('short-term loss offsets long-term gain; long-term loss never offsets short-term gain', () => {
    expect(estimateTax(2025, 0, -100_000, 0, 325_000)).toBeCloseTo(100_000 * 0.125)
    expect(estimateTax(2025, 0, 1000, 0, -5000)).toBeCloseTo(200)
  })
})

const holding = (symbol: string, quantity: number, longTermQty: number, avgPrice: number, price: number, weight: number) => {
  const invested = quantity * avgPrice, value = quantity * price
  return { symbol, quantity, longTermQty, avgPrice, price, invested, value, pnl: value - invested, pnlPct: (value / invested - 1) * 100, weight, dividends: 0 }
}
const H = [holding('A', 10, 10, 100, 200, 50), holding('B', 10, 4, 100, 50, 25), holding('C', 10, 0, 100, 110, 15), holding('D', 10, 0, 100, 100, 10)]

describe('holdings stats', () => {
  it('concentration', () => {
    const c = concentration(H)
    expect(c.count).toBe(4); expect(c.top1).toBe(50); expect(c.top1Symbol).toBe('A'); expect(c.top5).toBe(100); expect(c.top10).toBe(100)
  })
  it('long/short term split on quantities', () => {
    const t = termSplit(H)
    expect(t.ltValue).toBeCloseTo(10 * 200 + 4 * 50)
    expect(t.stValue).toBeCloseTo(6 * 50 + 10 * 110 + 10 * 100)
    expect(t.ltGain).toBeCloseTo(1000 + 4 * -50)
    expect(t.stGain).toBeCloseTo(6 * -50 + 100)
  })
  it('movers with contribution to net P&L', () => {
    const m = movers(H, 1)
    expect(m.bestPnl[0].symbol).toBe('A'); expect(m.worstPnl[0].symbol).toBe('B')
    expect(m.bestPct[0].symbol).toBe('A'); expect(m.worstPct[0].symbol).toBe('B')
    expect(m.bestPnl[0].contribution).toBeCloseTo(1000 / (1000 - 500 + 100) * 100)
  })
})

describe('insights', () => {
  it('ties charges, dividends and xirr-vs-hurdle together', () => {
    const a: InsightAccount = {
      clientId: 'T1', name: 'T1', holdingsAsOn: '2025-01-01',
      ledger: [
        { ...led('Funds added using UPI', '2021-01-01', 0, 100_000, 'payin'), balance: 100_000 },
        { ...led('DP Charges for Sale of A', '2024-06-01', 1000, 0, 'charge'), balance: 99_000 },
      ],
      holdings: [{ symbol: 'A', isin: 'x', kind: 'equity', sector: '', quantity: 10, longTermQty: 0, avgPrice: 100, prevClose: 200 }],
      dividends: [{ symbol: 'A', date: '2024-12-01', quantity: 10, perShare: 5, amount: 50 }, { symbol: 'A', date: '2022-01-01', quantity: 10, perShare: 5, amount: 50 }],
      eqTrades: [],
    }
    const v = accountView(a, '2025-01-01', 0.12)
    const total = combine([v])
    const i = insights([a], [v], total, '2025-01-01', 0.12)
    expect(i.charges.total).toBe(1000)
    expect(i.chargesPctOfGross).toBeCloseTo(1000 / (total.gain + 1000) * 100)
    expect(i.dividends.total).toBe(100); expect(i.dividends.ttm).toBe(50)
    expect(i.dividends.yieldOnInvested).toBeCloseTo(100 / total.totalInvestment * 100)
    expect(i.xirrVsHurdle).toBeCloseTo((total.xirr! - 0.12) * 100)
    expect(i.unrealized).toBeCloseTo(1000)
  })
})

import { buildLots, tradebookCheck, parseTradebook } from './index.ts'
const tr = (symbol: string, isin: string, date: string, time: string, side: 'buy' | 'sell', quantity: number, price: number, n = 0): Trade =>
  ({ symbol, isin, date, exchange: 'NSE', side, quantity, price, tradeId: String(n), orderId: '', executedAt: `${date}T${time}` })

describe('buildLots matching', () => {
  it('pairs a same-day sell-then-buy as an intraday slice instead of an unmatched sale', () => {
    const r = buildLots([tr('KECL', 'I1', '2023-04-20', '10:30:23', 'sell', 100, 93), tr('KECL', 'I1', '2023-04-20', '10:38:21', 'buy', 100, 92)])
    expect(r.unmatchedSells).toEqual([])
    expect(r.slices).toHaveLength(1)
    expect(r.slices[0]).toMatchObject({ quantity: 100, buyDate: '2023-04-20', sellDate: '2023-04-20', buyPrice: 92, sellPrice: 93 })
  })
  it('a short not covered the same day stays unmatched; the later buy stays open', () => {
    const r = buildLots([tr('X', 'I2', '2023-04-20', '10:00:00', 'sell', 10, 50), tr('X', 'I2', '2023-04-21', '10:00:00', 'buy', 10, 49)])
    expect(r.unmatchedSells.map(u => u.quantity)).toEqual([10])
    expect(r.slices.filter(s => !s.sellDate)).toHaveLength(1)
  })
  it('a rename (same ISIN) stays one stock and carries the latest symbol', () => {
    const r = buildLots([tr('IDFCBANK', 'I3', '2018-09-28', '14:00:00', 'buy', 500, 36), tr('IDFCFIRSTB', 'I3', '2020-12-09', '11:00:00', 'sell', 500, 37)])
    expect(r.unmatchedSells).toEqual([])
    expect(r.slices).toHaveLength(1)
    expect(r.slices[0]).toMatchObject({ symbol: 'IDFCFIRSTB', sellDate: '2020-12-09' })
  })
  it('negative quantities count as their absolute value, trades in any order', () => {
    const csv = 'symbol,isin,trade_date,exchange,segment,series,trade_type,auction,quantity,price,trade_id,order_id,order_execution_time\n' +
      'ITC,I4,2018-05-02,NSE,EQ,EQ,sell,false,-100.000000,284.6,2,2,2018-05-02T11:55:17\n' +
      'ITC,I4,2018-05-02,NSE,EQ,EQ,buy,false,100.000000,282,1,1,2018-05-02T09:39:37\n'
    const t = parseTradebook(csv)
    expect(t.map(x => x.quantity)).toEqual([100, 100])
    const r = buildLots([...t].reverse())
    expect(r.unmatchedSells).toEqual([])
    expect(r.slices[0].sellDate).toBe('2018-05-02')
  })
})

describe('tradebookCheck', () => {
  it('lists holdings the tradebooks do not explain and sales with no purchase', () => {
    const a = {
      clientId: 'T', name: 'Tee', ledger: [], holdingsAsOn: '2025-01-01', dividends: [],
      holdings: [
        { symbol: 'AAA', isin: 'A', kind: 'equity' as const, sector: '', quantity: 10, longTermQty: 0, avgPrice: 1, prevClose: 1 },
        { symbol: 'IPO', isin: 'P', kind: 'equity' as const, sector: '', quantity: 5, longTermQty: 0, avgPrice: 1, prevClose: 1 },
      ],
      eqTrades: [tr('AAA', 'A', '2024-01-01', '10:00:00', 'buy', 10, 1), tr('GONE', 'G', '2024-02-01', '10:00:00', 'sell', 7, 1)],
    }
    const c = tradebookCheck([a], '2025-01-01')
    expect(c.mismatches.map(m => [m.symbol, m.diff])).toEqual([['IPO', 5]])
    expect(c.unmatchedSales.map(u => [u.symbol, u.quantity])).toEqual([['GONE', 7]])
  })
})
