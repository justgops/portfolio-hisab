const nf = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 })
/** Whole rupees, Indian grouping, ASCII minus. Zero shown as 0. */
export const inr = (n: number) => (Math.round(n) === 0 ? '0' : nf.format(Math.round(n)).replace('−', '-'))
export const fyFull = (fy: string) => `${fy.slice(0, 4)}-${fy.slice(0, 2)}${fy.slice(5)}`

/** Whole rupees with an explicit + for gains. */
export const inrSigned = (n: number) => (Math.round(n) > 0 ? '+' : '') + inr(n)
export const pct = (n: number | null, digits = 1) => (n === null || !Number.isFinite(n) ? '–' : `${n.toFixed(digits)}%`)
export const pctSigned = (n: number, digits = 1) => `${n > 0 ? '+' : ''}${n.toFixed(digits)}%`

/** Compact Indian amount: 12.96L, 1.07Cr, 8,420. Used on the Portfolio page rows. */
export const compact = (n: number) => {
  const a = Math.abs(n), s = n < 0 ? '-' : ''
  if (a >= 1e7) return `${s}${(a / 1e7).toFixed(2)}Cr`
  if (a >= 1e5) return `${s}${(a / 1e5).toFixed(2)}L`
  return inr(n)
}
export const compactSigned = (n: number) => (Math.round(n) > 0 ? '+' : '') + compact(n)
