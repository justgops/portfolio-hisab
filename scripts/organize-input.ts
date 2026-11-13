/**
 * Renames Console exports in Input/ to ClientID_FY_EQ|FO.csv, ClientID_FYs_LEDGER.csv,
 * ClientID_date_HOLDINGS.xlsx based on their CONTENTS, whatever they were called.
 *   - exact duplicates (same bytes as an already-named file) are deleted
 *   - a different file that would get an existing name is saved with a _2, _3 ... suffix
 *   - files it cannot identify are left alone and reported
 * Run: npm run organize   (the dev server also runs it whenever a file lands in Input/)
 */
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync, renameSync, unlinkSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { clientIdFromFilename, identifyFile } from '../packages/core/src/index.ts'

const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../Input')
const hash = (b: Uint8Array) => createHash('sha256').update(b).digest('hex')
const log = (...a: unknown[]) => console.log('[organize]', ...a)

if (!existsSync(dir)) { log('no Input/ folder, nothing to do'); process.exit(0) }

const names = readdirSync(dir).filter(f => /\.(csv|xlsx)$/i.test(f)).sort()
const files = names.map(name => ({ name, bytes: new Uint8Array(readFileSync(path.join(dir, name))) }))

// The only client id we can lean on when a file does not name its client.
const ids = new Set<string>()
for (const f of files) {
  try { const id = identifyFile(f.name, f.bytes).clientId ?? clientIdFromFilename(f.name); if (id) ids.add(id) } catch { /* handled below */ }
}
const fallback = ids.size === 1 ? [...ids][0] : null

const byHash = new Map<string, string>()   // content hash -> file name that owns it
for (const f of files) if (/^[A-Z0-9]+_.*_(EQ|FO|LEDGER|HOLDINGS|DIVIDENDS)\.(csv|xlsx)$/.test(f.name)) byHash.set(hash(f.bytes), f.name)

let changed = 0
for (const f of files) {
  let canonical: string | null
  try { canonical = identifyFile(f.name, f.bytes, fallback).canonical } catch (e) { log('skip', f.name, '-', (e as Error).message); continue }
  if (!canonical) { log('skip', f.name, '- cannot tell the client or dates'); continue }
  if (canonical === f.name) continue

  const h = hash(f.bytes)
  const owner = byHash.get(h)
  if (owner && owner !== f.name) { unlinkSync(path.join(dir, f.name)); log('deleted duplicate', f.name, `(same as ${owner})`); changed++; continue }

  let target = canonical
  for (let n = 2; existsSync(path.join(dir, target)); n++) target = canonical.replace(/(\.\w+)$/, `_${n}$1`)
  renameSync(path.join(dir, f.name), path.join(dir, target))
  byHash.set(h, target)
  log('renamed', f.name, '->', target)
  changed++
}
if (!changed) log('nothing to do')
