/**
 * Writes Input/combined/COMBINED_STATEMENT.txt and COMBINED_LEDGER.csv: every account side by side plus a combined column, from the Console files under Input/ (Input/<ClientID>/<kind>/).
 * Only for checking the dashboard figures by hand. Written to a subfolder so the dev loader (loose files and account folders only) never imports them.
 * Run: node scripts/combined-statement.ts [asOf YYYY-MM-DD] [hurdle %]
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { accountView, checkLedger } from '../packages/core/src/index.ts'
import { importFiles } from '../apps/web/src/importer.ts'
import { listInputFiles } from './inputLayout.ts'

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'Input')
const files = listInputFiles(dir).map(rel => new File([readFileSync(path.join(dir, rel))], path.basename(rel)))
const accounts = new Map()
const results = await importFiles(files, accounts)
for (const r of results.filter(r => !r.ok)) console.error(`FAILED ${r.file}: ${r.message}`)
const list = [...accounts.values()]

const dates = list.flatMap(a => [a.holdingsAsOn ?? '', a.ledger.at(-1)?.date ?? '']).filter(Boolean).sort()
const asOf = process.argv[2] ?? dates.at(-1) ?? new Date().toISOString().slice(0, 10)
const rate = Number(process.argv[3] ?? 12) / 100

const n = (x: number) => Math.round(x).toLocaleString('en-IN')
const cols = list.map(a => {
  const v = accountView(a, asOf, rate, { excludeMutualFunds: true })
  const upto = a.ledger.filter((e: any) => e.date && e.date <= asOf)
  const sum = (kind: string, side: 'debit' | 'credit') => upto.filter((e: any) => e.kind === kind).reduce((t: number, e: any) => t + e[side], 0)
  const c = checkLedger(a.ledger)
  return {
    name: `${a.name} (${a.clientId})`, ledger: c.ok ? 'complete' : 'INCOMPLETE',
    payins: sum('payin', 'credit'), payouts: -sum('payout', 'debit'), mf: v.mfOutflow, other: v.otherCapital, invested: v.totalInvestment,
    market: v.market, cash: v.cash, value: v.value, dividends: v.dividends, gain: v.gain, fno: v.fnoNet,
  }
})
const keys = ['payins', 'payouts', 'mf', 'other', 'invested', 'market', 'cash', 'value', 'dividends', 'gain', 'fno'] as const
const labels: Record<string, string> = {
  payins: 'Pay-ins', payouts: 'Payouts', mf: 'MF purchases removed', other: 'Other capital', invested: 'INVESTED',
  market: 'Holdings value', cash: 'Cash in ledger', value: 'VALUE NOW', dividends: 'Dividends', gain: 'TOTAL GAIN', fno: 'F&O net',
}
const W = 22
const row = (label: string, cells: string[]) => label.padEnd(24) + cells.map(c => c.padStart(W)).join('')
const lines = [
  `Combined statement as of ${asOf}, hurdle ${rate * 100}%, Equity & F&O only`,
  '',
  row('', [...cols.map(c => c.name), 'COMBINED']),
  row('Ledger', [...cols.map(c => c.ledger), '']),
  ...keys.map(k => row(labels[k], [...cols.map(c => n(c[k])), n(cols.reduce((t, c) => t + c[k], 0))])),
  '',
  'Invested = pay-ins + payouts (negative) + MF adjustment + other capital. Value now = holdings + cash. Gain = value now + dividends - invested.',
]
const outDir = path.join(dir, 'combined')
mkdirSync(outDir, { recursive: true })
const out = path.join(outDir, 'COMBINED_STATEMENT.txt')
writeFileSync(out, lines.join('\n') + '\n')
console.log(lines.join('\n') + `\n\nSaved ${out}`)

// Combined ledger: every account's rows merged by date, with the account's own balance and a running combined balance.
const q = (x: string) => `"${x.replace(/"/g, '""')}"`
const rows = list.flatMap(a => a.ledger.filter((e: any) => e.date && e.kind !== 'opening' && e.kind !== 'closing').map((e: any) => ({ a, e })))
rows.sort((x, y) => x.e.date.localeCompare(y.e.date))
const bal = new Map<string, number>(list.map(a => [a.clientId, 0]))
const csv = ['account,date,particulars,voucher_type,kind,debit,credit,account_balance,combined_balance']
for (const { a, e } of rows) {
  bal.set(a.clientId, e.balance)
  const combinedBal = [...bal.values()].reduce((t, x) => t + x, 0)
  csv.push([a.clientId, e.date, q(e.particulars), q(e.voucherType), e.kind, e.debit.toFixed(2), e.credit.toFixed(2), e.balance.toFixed(2), combinedBal.toFixed(2)].join(','))
}
const csvPath = path.join(outDir, 'COMBINED_LEDGER.csv')
writeFileSync(csvPath, csv.join('\n') + '\n')
console.log(`Saved ${csvPath} (${rows.length} rows)`)
