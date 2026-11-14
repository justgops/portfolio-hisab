import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

const require = createRequire(import.meta.url)

// Dev only: serve the repo's Input/ folder so the app can load sample files without manual upload.
const inputDir = path.resolve(__dirname, '../../Input')
const inputFolder = {
  name: 'input-folder',
  apply: 'serve' as const,
  configureServer(server: import('vite').ViteDevServer) {
    // Anything dropped loose into Input/ is filed into Input/<ClientID>/<kind>/ and renamed by its contents.
    const script = path.resolve(__dirname, '../../scripts/organize-input.ts')
    let timer: NodeJS.Timeout | undefined
    const organize = () => {
      clearTimeout(timer)
      timer = setTimeout(() => spawn('node', [script], { stdio: 'inherit' }), 800)   // let the copy finish first
    }
    if (fs.existsSync(inputDir)) {
      organize()
      server.watcher.add(inputDir)
      server.watcher.on('add', f => { if (path.dirname(f) === inputDir) organize() })   // only loose files; filed ones are already in place
    }
    // Lists every csv/xlsx as a path relative to Input/: loose files plus Input/<ClientID>/<kind>/ ones.
    const isData = (f: string) => /\.(csv|xlsx)$/i.test(f)
    const isAccountDir = (n: string) => /^[A-Z0-9]{4,}$/.test(n) && /\d/.test(n)
    const list = (): string[] => {
      if (!fs.existsSync(inputDir)) return []
      const out: string[] = []
      for (const e of fs.readdirSync(inputDir).sort()) {
        const p = path.join(inputDir, e)
        if (fs.statSync(p).isFile()) { if (isData(e)) out.push(e) }
        else if (isAccountDir(e)) for (const sub of fs.readdirSync(p).sort()) {
          const sp = path.join(p, sub)
          if (fs.statSync(sp).isFile()) { if (isData(sub)) out.push(`${e}/${sub}`) }
          else for (const f of fs.readdirSync(sp).sort()) if (isData(f)) out.push(`${e}/${sub}/${f}`)
        }
      }
      return out
    }
    server.middlewares.use('/__input', (req, res) => {
      const rel = decodeURIComponent((req.url ?? '/').split('?')[0].replace(/^\//, ''))
      if (!rel) { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(list())); return }
      if (!list().includes(rel)) { res.statusCode = 404; res.end(); return }   // only files the listing would show
      res.end(fs.readFileSync(path.join(inputDir, rel)))
    })
  },
}
// ui-kit source uses "@/" to refer to its own src; project source does not use "@/".
const uiKitSrcDir = path.dirname(require.resolve('@onyantra-in/ui-kit'))

export default defineConfig({
  resolve: { alias: { '@': uiKitSrcDir } },
  plugins: [
    inputFolder,
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg'],
      manifest: {
        name: 'Portfolio Hisab',
        short_name: 'Hisab',
        description: 'Portfolio Hisab: consolidated investment, return and holdings view across your Zerodha accounts',
        theme_color: '#007595',
        background_color: '#ffffff',
        display: 'standalone',
        start_url: '.',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any maskable' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
        ],
      },
      workbox: { globPatterns: ['**/*.{js,css,html,ico,png,svg}'] },
    }),
  ],
})
