const nf = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 })
/** Whole rupees, Indian grouping, ASCII minus. Zero shown as 0. */
export const inr = (n: number) => (Math.round(n) === 0 ? '0' : nf.format(Math.round(n)).replace('−', '-'))
export const fyFull = (fy: string) => `${fy.slice(0, 4)}-${fy.slice(0, 2)}${fy.slice(5)}`

/** Whole rupees with an explicit + for gains. */
export const inrSigned = (n: number) => (Math.round(n) > 0 ? '+' : '') + inr(n)
export const pct = (n: number | null, digits = 1) => (n === null || !Number.isFinite(n) ? '–' : `${n.toFixed(digits)}%`)
export const pctSigned = (n: number, digits = 1) => `${n > 0 ? '+' : ''}${n.toFixed(digits)}%`
