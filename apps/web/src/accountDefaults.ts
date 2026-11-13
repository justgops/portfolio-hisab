type Defaults = Record<string, { name: string }>

/**
 * Owner names applied when an account is first created from an import, keyed by client id.
 * Empty in the repository; put your own in src/accountDefaults.local.ts (git-ignored):
 *   export default { AB1234: { name: 'Owner name' } }
 * Names can always be edited later on the Accounts page.
 */
let local: Defaults = {}
try {
  const found = import.meta.glob<{ default: Defaults }>('./accountDefaults.local.ts', { eager: true })
  local = Object.values(found)[0]?.default ?? {}
} catch { /* not running under Vite (scripts, tests): no local overrides */ }

export const ACCOUNT_DEFAULTS: Defaults = local
