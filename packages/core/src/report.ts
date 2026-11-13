import { opportunityCost, sumByFY, type FYInterest, type OpportunityCost } from './interest.ts'
import type { ISODate, LotSlice } from './types.ts'

export interface SliceReport extends LotSlice {
  cost: number
  value: number | null     // sale proceeds, or current value if open and price known
  gain: number | null
  opp: OpportunityCost
}

export interface SymbolReport {
  symbol: string
  realizedGain: number
  openQuantity: number
  openCost: number
  openValue: number | null
  unrealizedGain: number | null
  oppSimple: number
  oppCompound: number
  excessSimple: number | null    // (realized + unrealized) - opportunity cost
  excessCompound: number | null
  slices: SliceReport[]
}

export interface PortfolioReport {
  rate: number
  asOf: ISODate
  symbols: SymbolReport[]
  byFY: FYInterest[]
  totals: Omit<SymbolReport, 'symbol' | 'slices'>
}

export function buildReport(
  slices: LotSlice[],
  opts: { rate: number; asOf: ISODate; prices?: Record<string, number> },
): PortfolioReport {
  const bySym = new Map<string, SliceReport[]>()
  for (const s of slices) {
    const cost = s.quantity * s.buyPrice
    const closed = s.sellDate !== undefined
    const px = closed ? s.sellPrice! : opts.prices?.[s.symbol]
    const value = px === undefined ? null : s.quantity * px
    const rep: SliceReport = {
      ...s, cost, value,
      gain: value === null ? null : value - cost,
      opp: opportunityCost(cost, s.buyDate, closed ? s.sellDate! : opts.asOf, opts.rate),
    }
    ;(bySym.get(s.symbol) ?? bySym.set(s.symbol, []).get(s.symbol)!).push(rep)
  }

  const symbols: SymbolReport[] = [...bySym].map(([symbol, reps]) => {
    let realized = 0, openQty = 0, openCost = 0, openValue: number | null = 0, oppS = 0, oppC = 0
    for (const r of reps) {
      oppS += r.opp.simple; oppC += r.opp.compound
      if (r.sellDate) realized += r.gain!
      else {
        openQty += r.quantity; openCost += r.cost
        openValue = openValue === null || r.value === null ? null : openValue + r.value
      }
    }
    const unreal = openQty === 0 ? 0 : openValue === null ? null : openValue - openCost
    const total = unreal === null ? null : realized + unreal
    return {
      symbol, realizedGain: realized, openQuantity: openQty, openCost,
      openValue: openQty === 0 ? 0 : openValue, unrealizedGain: unreal,
      oppSimple: oppS, oppCompound: oppC,
      excessSimple: total === null ? null : total - oppS,
      excessCompound: total === null ? null : total - oppC,
      slices: reps,
    }
  }).sort((a, b) => a.symbol.localeCompare(b.symbol))

  const sumNullable = (f: (s: SymbolReport) => number | null) =>
    symbols.reduce<number | null>((a, s) => { const v = f(s); return a === null || v === null ? null : a + v }, 0)

  return {
    rate: opts.rate,
    asOf: opts.asOf,
    symbols,
    byFY: sumByFY(symbols.flatMap(s => s.slices.map(x => x.opp))),
    totals: {
      realizedGain: symbols.reduce((a, s) => a + s.realizedGain, 0),
      openQuantity: symbols.reduce((a, s) => a + s.openQuantity, 0),
      openCost: symbols.reduce((a, s) => a + s.openCost, 0),
      openValue: sumNullable(s => s.openValue),
      unrealizedGain: sumNullable(s => s.unrealizedGain),
      oppSimple: symbols.reduce((a, s) => a + s.oppSimple, 0),
      oppCompound: symbols.reduce((a, s) => a + s.oppCompound, 0),
      excessSimple: sumNullable(s => s.excessSimple),
      excessCompound: sumNullable(s => s.excessCompound),
    },
  }
}
