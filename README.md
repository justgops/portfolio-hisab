# Portfolio Hisab

Consolidated investment, return and holdings view across several Zerodha accounts. A PWA (Vite, React, the shared ui-kit).
Everything runs in the browser and is stored on the device; nothing is uploaded.

## Layout

- `packages/core`: pure TypeScript, no UI. Parsers for Console exports (ledger, tradebook, holdings, dividends), the year-by-year
  hurdle schedule, XIRR, per-account and combined views, backup export/import. Tested with Vitest.
- `apps/web`: the PWA (pages: Dashboard, Investment schedule, Holdings, Insights, Accounts, Import & backup).
- `scripts/organize-input.ts`: renames Console exports in `Input/` to `ClientID_FY_EQ|FO.csv` etc. by their contents (`npm run organize`).

## Run

```
npm install
npm run dev        # http://localhost:5173
npm run build
npm test           # core tests
```

Create an `Input/` folder next to `package.json` and put your Console exports in it. In dev they are loaded automatically on first run,
and the dev server renames anything dropped there. The folder is not part of the repository.

## Deploy (Coolify, same flow as fabric-costing-lite)

A static PWA: the `Dockerfile` builds it with Node and serves it with nginx (`nginx.conf`: single-page-app fallback, no-cache on
`index.html` / `sw.js` / the manifest, immutable caching for hashed assets, `/health` for the health check). There is no server or database.

In Coolify: new application from this repository, build pack **Dockerfile**, port **3000** (Coolify's default), health check path `/health`, add a domain
(HTTPS is required for the service worker and "install app"). Build locally with `docker build -t portfolio-hisab .`.

## Private data

`Input/` holds real ledgers, tradebooks and holdings and is entirely git-ignored (the folder itself is not tracked). The core tests read those files, so they only pass on a machine
where `Input/` is populated. Owner names go in `apps/web/src/accountDefaults.local.ts` (also git-ignored).

## Versioning

The version is `apps/web/package.json`, shown in the app menu. Bump it with `npm version patch -w web` (or `minor`, `major`).
