import packageJson from '../package.json'

/** Single source of truth for the app name and version: apps/web/package.json (bump with `npm version`). */
export const APP_NAME = 'Portfolio Hisab'
export const APP_VERSION: string = packageJson.version
