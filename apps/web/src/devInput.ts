import type { AccountRecord } from './db.ts'
import { importFiles, type ImportResult } from './importer.ts'

/** Dev only: read every csv/xlsx in the repo's Input/ folder (served by the vite dev plugin) and merge them into accounts. */
export async function readInputFolder(existing: AccountRecord[] = []): Promise<{ accounts: AccountRecord[]; results: ImportResult[] }> {
  const names: string[] = await (await fetch('/__input/')).json()
  // One at a time: browsers allow few connections per host and the dev server's live-reload socket uses one.
  const files: File[] = []
  for (const n of names) {
    const res = await fetch(`/__input/${encodeURIComponent(n)}`)
    if (res.ok) files.push(new File([await res.arrayBuffer()], n))
  }
  const map = new Map(existing.map(a => [a.clientId, structuredClone(a)]))
  const results = await importFiles(files, map)
  return { accounts: [...map.values()], results }
}
