import { parseHoldingsXlsx } from './holdings.ts'
import { CLIENT_ID_SOURCE, clientIdFromFilename, parseLedger } from './ledger.ts'
import { parseCsv } from './csv.ts'
import { fyLabel, fyStartYear } from './fy.ts'
import { parseDividends } from './dividends.ts'
import { parseTradebook } from './tradebook.ts'

export type FileKind = 'ledger' | 'tradebook-eq' | 'tradebook-fo' | 'holdings' | 'dividends'

export interface FileIdentity {
  kind: FileKind
  /** Client id from the filename or file contents; null when the file does not say. */
  clientId: string | null
  /** e.g. YK2142_2021-22_EQ.csv; null when the file has no rows to date it by. */
  canonical: string | null
  /** Where the client id came from, for display. */
  source: 'filename' | 'contents' | 'fallback' | 'none'
}

const fyRange = (dates: string[]) => {
  const s = [...dates].sort()
  const a = fyLabel(fyStartYear(s[0])), b = fyLabel(fyStartYear(s.at(-1)!))
  return a === b ? a : `${a}_to_${b}`
}

/** Most frequent client-id-looking token (e.g. YK2142) inside ledger text. */
function clientIdFromLedgerText(text: string): string | null {
  const counts = new Map<string, number>()
  for (const m of text.matchAll(new RegExp(CLIENT_ID_SOURCE, 'g'))) counts.set(m[1], (counts.get(m[1]) ?? 0) + 1)
  return [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null
}

/**
 * Works out what a Console export is from its contents (any filename), and the
 * canonical name it should be stored under: ClientID_FY_EQ|FO|DIVIDENDS.csv, ClientID_FYs_LEDGER.csv,
 * ClientID_asOnDate_HOLDINGS.xlsx. `fallbackClientId` is used when neither name nor contents say.
 */
export function identifyFile(name: string, bytes: Uint8Array, fallbackClientId?: string | null): FileIdentity {
  const resolve = (fromContents: string | null) => {
    const fromName = clientIdFromFilename(name)
    if (fromName) return { id: fromName, source: 'filename' as const }
    if (fromContents) return { id: fromContents, source: 'contents' as const }
    if (fallbackClientId) return { id: fallbackClientId, source: 'fallback' as const }
    return { id: null, source: 'none' as const }
  }

  if (/\.xlsx$/i.test(name)) {
    const h = parseHoldingsXlsx(bytes)
    const id = h.clientId || resolve(null).id
    return { kind: 'holdings', clientId: id, source: h.clientId ? 'contents' : resolve(null).source, canonical: id ? `${id}_${h.asOn}_HOLDINGS.xlsx` : null }
  }

  const text = new TextDecoder().decode(bytes)
  const head = text.split(/\r?\n/, 1)[0].replace(/^﻿/, '')
  if (head.startsWith('particulars,')) {
    const rows = parseLedger(text)
    const dates = rows.map(r => r.date).filter((d): d is string => !!d)
    const r = resolve(clientIdFromLedgerText(text))
    return { kind: 'ledger', clientId: r.id, source: r.source, canonical: r.id && dates.length ? `${r.id}_${fyRange(dates)}_LEDGER.csv` : null }
  }
  if (/^symbol,\s*ex-date,/i.test(head)) {
    const dates = parseDividends(text).map(d => d.date)
    const r = resolve(null)
    return { kind: 'dividends', clientId: r.id, source: r.source, canonical: r.id && dates.length ? `${r.id}_${fyRange(dates)}_DIVIDENDS.csv` : null }
  }
  if (head.startsWith('symbol,')) {
    // The segment column is authoritative; currency (CDS), commodity (COM) etc. are not tracked here.
    const seg = (parseCsv(text)[0]?.segment ?? (head.includes('expiry_date') ? 'FO' : 'EQ')).toUpperCase()
    if (seg !== 'EQ' && seg !== 'FO') throw new Error(`Unsupported tradebook segment "${seg}". Only equity (EQ) and F&O (FO) tradebooks are used.`)
    const kind = seg === 'FO' ? 'tradebook-fo' : 'tradebook-eq'
    const dates = parseTradebook(text).map(t => t.date)
    const r = resolve(null)
    return { kind, clientId: r.id, source: r.source, canonical: r.id && dates.length ? `${r.id}_${fyRange(dates)}_${kind === 'tradebook-fo' ? 'FO' : 'EQ'}.csv` : null }
  }
  throw new Error('Unrecognised file (not a Console ledger, tradebook or holdings export)')
}
