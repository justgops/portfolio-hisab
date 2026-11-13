import type { ISODate } from './types.ts'

const DAY = 86_400_000

export function toUTC(d: ISODate): number {
  const [y, m, day] = d.split('-').map(Number)
  return Date.UTC(y, m - 1, day)
}

export function fromUTC(ms: number): ISODate {
  return new Date(ms).toISOString().slice(0, 10)
}

export function daysBetween(from: ISODate, to: ISODate): number {
  return Math.round((toUTC(to) - toUTC(from)) / DAY)
}

/** Starting calendar year of the Indian FY containing `d` (Apr 1 - Mar 31). */
export function fyStartYear(d: ISODate): number {
  const [y, m] = d.split('-').map(Number)
  return m >= 4 ? y : y - 1
}

export function fyLabel(startYear: number): string {
  return `${startYear}-${String((startYear + 1) % 100).padStart(2, '0')}`
}

export function fyStart(startYear: number): ISODate {
  return `${startYear}-04-01`
}

export function fyDays(startYear: number): number {
  return daysBetween(fyStart(startYear), fyStart(startYear + 1))
}
