import { serializeBackup } from '@zp/core'
import type { AccountRecord } from './db.ts'

/**
 * Saves all accounts to one JSON file. On phones that support it the system share sheet opens
 * (AirDrop, Drive, WhatsApp...), otherwise the browser downloads the file.
 */
export async function exportBackup(accounts: AccountRecord[]): Promise<'shared' | 'downloaded'> {
  const name = `portfolio-hisab-backup-${new Date().toISOString().slice(0, 10)}.json`
  const file = new File([serializeBackup(accounts)], name, { type: 'application/json' })
  if (navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], title: 'Portfolio Hisab backup' }); return 'shared' }
    catch (e) { if ((e as DOMException).name === 'AbortError') return 'shared' /* user cancelled the sheet */ }
  }
  const url = URL.createObjectURL(file)
  const a = document.createElement('a')
  a.href = url; a.download = name; a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
  return 'downloaded'
}
