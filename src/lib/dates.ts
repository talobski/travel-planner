const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/
const MS_PER_DAY = 86_400_000

/** Day number for a YYYY-MM-DD string, or null if it is not a real calendar date. */
export function toDayNumber(value: string): number | null {
  const match = ISO_DATE.exec(value)
  if (!match) return null
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const ms = Date.UTC(year, month - 1, day)
  const check = new Date(ms)
  if (
    check.getUTCFullYear() !== year ||
    check.getUTCMonth() !== month - 1 ||
    check.getUTCDate() !== day
  ) {
    return null
  }
  return ms / MS_PER_DAY
}

export function isIsoDate(value: unknown): value is string {
  return typeof value === "string" && toDayNumber(value) !== null
}

/**
 * Calendar nights between two YYYY-MM-DD dates. Uses UTC day numbers so local
 * timezone and DST transitions cannot shift the result. Returns null when
 * either date is invalid.
 */
export function nightsBetween(checkIn: string, checkOut: string): number | null {
  const start = toDayNumber(checkIn)
  const end = toDayNumber(checkOut)
  if (start === null || end === null) return null
  return end - start
}

const monthDay = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  timeZone: "UTC",
})
const dayOnly = new Intl.DateTimeFormat("en-US", { day: "numeric", timeZone: "UTC" })
const weekdayMonthDay = new Intl.DateTimeFormat("en-US", {
  weekday: "short",
  month: "short",
  day: "numeric",
  timeZone: "UTC",
})

function toUtcDate(value: string): Date | null {
  const day = toDayNumber(value)
  return day === null ? null : new Date(day * MS_PER_DAY)
}

/** "May 5–8" or "Apr 29–May 2". */
export function formatDateRange(checkIn: string, checkOut: string): string {
  const start = toUtcDate(checkIn)
  const end = toUtcDate(checkOut)
  if (!start || !end) return "Invalid dates"
  const sameMonth =
    start.getUTCFullYear() === end.getUTCFullYear() &&
    start.getUTCMonth() === end.getUTCMonth()
  return sameMonth
    ? `${monthDay.format(start)}–${dayOnly.format(end)}`
    : `${monthDay.format(start)}–${monthDay.format(end)}`
}

/** "Sun, May 5 to Wed, May 8, 2030". */
export function formatDateRangeLong(checkIn: string, checkOut: string): string {
  const start = toUtcDate(checkIn)
  const end = toUtcDate(checkOut)
  if (!start || !end) return "Invalid dates"
  return `${weekdayMonthDay.format(start)} to ${weekdayMonthDay.format(end)}, ${end.getUTCFullYear()}`
}

export function pluralize(count: number, singular: string, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`
}
