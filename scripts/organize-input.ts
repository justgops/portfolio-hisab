/**
 * Sorts Console exports into Input/<ClientID>/<kind>/ by their CONTENTS, whatever they were called:
 *   Input/BP1917/ledger/, tradebook/ (EQ and FO), dividends/, holdings/
 * Files are renamed to ClientID_FY_EQ|FO.csv, ClientID_FYs_LEDGER.csv, ClientID_FY_DIVIDENDS.csv, ClientID_date_HOLDINGS.xlsx.
 *   - an exact duplicate (same bytes as a file already filed for that account) is deleted
 *   - a different file that would get an existing name is saved with a _2, _3 ... suffix
 *   - files it cannot identify are left where they are and reported
 *   - files already in the right folder under the right name are not touched
 * Run: npm run organize          (the dev server also runs it whenever a file lands in Input/)
 *      npm run organize -- --dry  to only print what would happen
 */
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { clientIdFromFilename, identifyFile } from '../packages/core/src/index.ts'
import { isAccountDir, KIND_FOLDER, listInputFiles } from './inputLayout.ts'

const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../Input')
const dry = process.argv.includes('--dry')
const hash = (b: Uint8Array) => createHash('sha256').update(b).digest('hex')
const log = (...a: unknown[]) => console.log('[organize]', dry ? '(dry run)' : '', ...a)

if (!existsSync(dir)) { log('no Input/ folder, nothing to do'); process.exit(0) }

const files = listInputFiles(dir).map(rel => ({ rel, bytes: new Uint8Array(readFileSync(path.join(dir, rel))) }))
const baseName = (rel: string) => rel.split('/').at(-1)!
const accountOf = (rel: string) => { const first = rel.split('/')[0]; return rel.includes('/') && isAccountDir(first) ? first : null }

// A loose file that names no client can only be assigned when there is exactly one account.
const ids = new Set<string>()
for (const f of files) {
  const own = accountOf(f.rel)
  if (own) { ids.add(own); continue }
  try { const id = identifyFile(baseName(f.rel), f.bytes).clientId ?? clientIdFromFilename(baseName(f.rel)); if (id) ids.add(id) } catch { /* handled below */ }
}
const onlyId = ids.size === 1 ? [...ids][0] : null

const sameName = (name: string, canonical: string) => name === canonical || name.replace(/_\d+(\.\w+)$/, '$1') === canonical
const owners = new Map<string, string>()   // content hash -> rel path of the filed copy, per account
const key = (id: string, h: string) => `${id}:${h}`
const placed = new Set<string>()           // rel paths already in their right place

const plan = files.map(f => {
  const name = baseName(f.rel)
  let id: string | null, kind: string, canonical: string | null
  try {
    const r = identifyFile(name, f.bytes, accountOf(f.rel) ?? onlyId)
    id = r.clientId; kind = r.kind; canonical = r.canonical
  } catch (e) { return { f, error: (e as Error).message } }
  if (!id || !canonical) return { f, error: 'cannot tell the client or dates (if the file does not mention its client, put the client id in the file name, e.g. SMJ193_other_capital.csv)' }
  const target = `${id}/${KIND_FOLDER[kind]}`
  const inPlace = path.posix.dirname(f.rel) === target && sameName(name, canonical)
  if (inPlace) { placed.add(f.rel); owners.set(key(id, hash(f.bytes)), f.rel) }
  return { f, id, canonical, target, inPlace }
})

let changed = 0
for (const p of plan) {
  if ('error' in p) { log('skip', p.f.rel, '-', p.error); continue }
  if (p.inPlace) continue
  const h = hash(p.f.bytes)
  const owner = owners.get(key(p.id!, h))
  if (owner && owner !== p.f.rel) {
    if (!dry) unlinkSync(path.join(dir, p.f.rel))
    log('deleted duplicate', p.f.rel, `(same as ${owner})`); changed++; continue
  }
  let name = p.canonical!
  for (let n = 2; existsSync(path.join(dir, p.target!, name)); n++) name = p.canonical!.replace(/(\.\w+)$/, `_${n}$1`)
  const to = `${p.target}/${name}`
  if (!dry) { mkdirSync(path.join(dir, p.target!), { recursive: true }); renameSync(path.join(dir, p.f.rel), path.join(dir, to)) }
  owners.set(key(p.id!, h), to)
  log('moved', p.f.rel, '->', to); changed++
}
if (!changed) log('nothing to do')
