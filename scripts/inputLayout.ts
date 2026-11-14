/**
 * How Input/ is laid out: one folder per account (named by client id), with a subfolder per kind of file.
 *   Input/BP1917/ledger/BP1917_2020-21_to_2026-27_LEDGER.csv
 *   Input/BP1917/tradebook/BP1917_2023-24_EQ.csv      (equity and F&O)
 *   Input/BP1917/dividends/BP1917_2023-24_DIVIDENDS.csv
 *   Input/BP1917/holdings/BP1917_2026-11-14_HOLDINGS.xlsx
 *   Input/BP1917/capital/BP1917_OTHER_CAPITAL.csv     (IPO / transfer-in money, see packages/core/src/capital.ts)
 * Files dropped loose in Input/ are sorted into place by `npm run organize`.
 */
import { existsSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'

export const KIND_FOLDER: Record<string, string> = {
  ledger: 'ledger', holdings: 'holdings', dividends: 'dividends', 'tradebook-eq': 'tradebook', 'tradebook-fo': 'tradebook', capital: 'capital',
}
export const KIND_FOLDERS = ['ledger', 'tradebook', 'dividends', 'holdings', 'capital']

/** A client id folder name such as BP1917 (capitals and digits, at least one digit). Excludes helper folders like combined/. */
export const isAccountDir = (name: string) => /^[A-Z0-9]{4,}$/.test(name) && /\d/.test(name)

const isData = (f: string) => /\.(csv|xlsx)$/i.test(f)

/** Every csv/xlsx under Input/: loose files plus those inside account folders. Paths are relative to `dir`, with / separators. */
export function listInputFiles(dir: string): string[] {
  if (!existsSync(dir)) return []
  const out: string[] = []
  for (const e of readdirSync(dir).sort()) {
    const p = path.join(dir, e)
    if (statSync(p).isFile()) { if (isData(e)) out.push(e) }
    else if (isAccountDir(e)) {
      for (const sub of readdirSync(p).sort()) {
        const sp = path.join(p, sub)
        if (statSync(sp).isFile()) { if (isData(sub)) out.push(`${e}/${sub}`) }
        else for (const f of readdirSync(sp).sort()) if (isData(f) && statSync(path.join(sp, f)).isFile()) out.push(`${e}/${sub}/${f}`)
      }
    }
  }
  return out
}
