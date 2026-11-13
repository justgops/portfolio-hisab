/** ISO calendar date, 'YYYY-MM-DD'. */
export type ISODate = string

export interface Trade {
  symbol: string
  isin: string
  date: ISODate
  exchange: string
  side: 'buy' | 'sell'
  quantity: number
  price: number
  tradeId: string
  orderId: string
  executedAt: string
}

/** One dividend payout (Console dividends report). `date` is the ex-date. */
export interface Dividend {
  symbol: string
  date: ISODate
  quantity: number
  perShare: number
  amount: number
}

export type LedgerKind =
  | 'opening' | 'closing'
  | 'payin' | 'payout'
  | 'settlement' | 'fno' | 'mf'
  | 'charge' | 'other'

export interface LedgerEntry {
  particulars: string
  date: ISODate | null
  voucherType: string
  debit: number
  credit: number
  balance: number
  kind: LedgerKind
}

/** A slice of a buy lot, optionally closed by a sell. */
export interface LotSlice {
  symbol: string
  quantity: number
  buyDate: ISODate
  buyPrice: number
  sellDate?: ISODate
  sellPrice?: number
}

export interface UnmatchedSell {
  symbol: string
  date: ISODate
  quantity: number
  price: number
}

export type Compounding = 'simple' | 'compound'
