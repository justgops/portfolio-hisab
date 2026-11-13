import { unzipSync, strFromU8 } from 'fflate'
import type { ISODate, LotSlice } from './types.ts'

export interface Holding {
  symbol: string
  isin: string
  kind: 'equity' | 'mf'
  sector: string
  quantity: number
  longTermQty: number
  avgPrice: number
  prevClose: number
}

export interface HoldingsStatement {
  clientId: string
  asOn: ISODate
  holdings: Holding[]
}

const unescapeXml = (s: string) =>
  s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&')

function sharedStrings(xml: string | undefined): string[] {
  if (!xml) return []
  return [...xml.matchAll(/<si>([\s\S]*?)<\/si>/g)].map(m =>
    unescapeXml([...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map(t => t[1]).join('')))
}

/** Returns rows as {A: .., B: ..} keyed by column letter, row number order preserved. */
function sheetRows(xml: string, ss: string[]): Record<string, string>[] {
  const rows: Record<string, string>[] = []
  for (const r of xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
    const row: Record<string, string> = {}
    for (const c of r[1].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const ref = /r="([A-Z]+)\d+"/.exec(c[1])?.[1]
      if (!ref || !c[2]) continue
      const t = /t="(\w+)"/.exec(c[1])?.[1]
      let val: string | undefined
      if (t === 'inlineStr') val = unescapeXml([...c[2].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map(x => x[1]).join(''))
      else {
        const v = /<v>([\s\S]*?)<\/v>/.exec(c[2])?.[1]
        if (v !== undefined) val = t === 's' ? ss[Number(v)] : unescapeXml(v)
      }
      if (val !== undefined) row[ref] = val.trim()
    }
    if (Object.keys(row).length) rows.push(row)
  }
  return rows
}

const n = (s: string | undefined) => { const x = Number(s); return Number.isFinite(x) ? x : 0 }

/** Parses Console "Holdings Statement" xlsx (Equity + Mutual Funds sheets; Combined is ignored). */
export function parseHoldingsXlsx(bytes: Uint8Array): HoldingsStatement {
  const files = unzipSync(bytes)
  const ss = sharedStrings(files['xl/sharedStrings.xml'] ? strFromU8(files['xl/sharedStrings.xml']) : undefined)
  let clientId = ''
  let asOn = ''
  const holdings: Holding[] = []

  const sheetNames = Object.keys(files).filter(k => /^xl\/worksheets\/sheet\d+\.xml$/.test(k)).sort()
  for (const name of sheetNames) {
    const rows = sheetRows(strFromU8(files[name]), ss)
    const title = rows.find(r => /Holdings Statement as on/i.test(r.B ?? ''))?.B ?? ''
    clientId ||= rows.find(r => r.B === 'Client ID')?.C ?? ''
    const kind = /^Equity/i.test(title) ? 'equity' : /^Mutual/i.test(title) ? 'mf' : null
    if (!kind) continue
    asOn ||= /as on (\d{4}-\d{2}-\d{2})/i.exec(title)?.[1] ?? ''
    const hi = rows.findIndex(r => r.B === 'Symbol')
    if (hi < 0) continue
    const head = rows[hi]
    const col = (label: string) => Object.entries(head).find(([, v]) => v === label)?.[0]
    const cQty = col('Quantity Available'), cAvg = col('Average Price'), cPrev = col('Previous Closing Price')
    const cLT = col('Quantity Long Term')
    const cIsin = col('ISIN'), cSector = col('Sector') ?? col('Instrument Type')
    if (!cQty || !cAvg || !cPrev || !cIsin) throw new Error(`Unexpected holdings layout in ${name}`)
    for (const r of rows.slice(hi + 1)) {
      if (!r.B || !r[cIsin]) continue
      holdings.push({
        symbol: r.B, isin: r[cIsin], kind, sector: cSector ? r[cSector] ?? '' : '',
        quantity: n(r[cQty]), longTermQty: cLT ? n(r[cLT]) : 0, avgPrice: n(r[cAvg]), prevClose: n(r[cPrev]),
      })
    }
  }
  if (!holdings.length) throw new Error('Not a holdings statement xlsx (no Equity/Mutual Funds sheet found)')
  return { clientId, asOn, holdings }
}

export function pricesFromHoldings(h: HoldingsStatement): Record<string, number> {
  return Object.fromEntries(h.holdings.map(x => [x.symbol, x.prevClose]))
}

export interface Reconciled {
  symbol: string
  kind: 'equity' | 'mf'
  holdingQty: number
  datedQty: number        // open qty explained by tradebook lots
  undatedQty: number      // holding qty with no matching buy in tradebooks
  avgPrice: number
  prevClose: number
}

/**
 * Tradebook symbols differ slightly from holdings symbols (e.g. GOLDBEES vs GOLDBEES-E),
 * so match on base symbol (text before the first '-').
 */
const base = (s: string) => s.split('-')[0]

export function reconcile(h: HoldingsStatement, slices: LotSlice[]): Reconciled[] {
  const open = new Map<string, number>()
  for (const s of slices) if (!s.sellDate) open.set(base(s.symbol), (open.get(base(s.symbol)) ?? 0) + s.quantity)
  return h.holdings.map(x => {
    const dated = Math.min(open.get(base(x.symbol)) ?? 0, x.quantity)
    return {
      symbol: x.symbol, kind: x.kind, holdingQty: x.quantity, datedQty: dated,
      undatedQty: x.quantity - dated, avgPrice: x.avgPrice, prevClose: x.prevClose,
    }
  })
}
