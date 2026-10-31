import { toDayNumber } from "./dates"
import { moveAmong } from "./order"
import type { Activity, Trip } from "./types"

const MS_PER_DAY = 86_400_000

function toIsoDay(day: number) {
  return new Date(day * MS_PER_DAY).toISOString().slice(0, 10)
}

/** Every day from `start` to `end` inclusive, in order, as YYYY-MM-DD. Empty when either date is invalid. */
export function daysFrom(start: string, end: string): string[] {
  const first = toDayNumber(start)
  const last = toDayNumber(end)
  if (first === null || last === null) return []
  const days: string[] = []
  for (let day = first; day <= last; day++) days.push(toIsoDay(day))
  return days
}

/** Number of days in the trip, counting the first and last. */
export function tripLength(trip: Pick<Trip, "start" | "end">) {
  return daysFrom(trip.start, trip.end).length
}

export function isInTrip(trip: Pick<Trip, "start" | "end"> | null, date: string) {
  return trip !== null && trip.start <= date && date <= trip.end
}

/**
 * The days the itinerary shows: every trip day, planned or not, and any other day that has activities, so
 * changing the trip dates never hides one. In date order.
 */
export function itineraryDays(trip: Pick<Trip, "start" | "end"> | null, activities: readonly Activity[]): string[] {
  const days = new Set(trip ? daysFrom(trip.start, trip.end) : [])
  for (const activity of activities) days.add(activity.date)
  return [...days].sort()
}

const TIME = /^([01]\d|2[0-3]):([0-5]\d)$/

export function isTime(value: unknown): value is string {
  return typeof value === "string" && TIME.test(value)
}

const timeFormat = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone: "UTC" })
const weekdayFormat = new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: "UTC" })
const monthDayFormat = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" })
const longFormat = new Intl.DateTimeFormat("en-US", {
  weekday: "short",
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
})

const spokenFormat = new Intl.DateTimeFormat("en-US", {
  weekday: "long",
  month: "long",
  day: "numeric",
  timeZone: "UTC",
})

/** "9:30 AM" for "09:30". */
export function formatTime(value: string) {
  const match = TIME.exec(value)
  if (!match) return value
  return timeFormat.format(new Date(Date.UTC(1970, 0, 1, Number(match[1]), Number(match[2]))))
}

function toDate(value: string) {
  return new Date(toDayNumber(value)! * MS_PER_DAY)
}

/** { weekday: "Wed", monthDay: "May 1" } */
export function dayParts(value: string) {
  const date = toDate(value)
  return { weekday: weekdayFormat.format(date), monthDay: monthDayFormat.format(date) }
}

/** "Wednesday, May 1", for screen readers. */
export function formatDaySpoken(value: string) {
  return spokenFormat.format(toDate(value))
}

/** "Wed, May 1, 2030" */
export function formatDay(value: string) {
  return longFormat.format(toDate(value))
}

/** The activities planned for `date`, in their saved order. */
export function activitiesOn(activities: readonly Activity[], date: string) {
  return activities.filter((activity) => activity.date === date)
}

/**
 * Adds `activity` to its day. A timed activity goes before the first activity that day with a later time; a
 * flexible one goes last. The user can reorder afterwards, so this only sets a sensible starting place.
 */
export function placeActivity(activities: readonly Activity[], activity: Activity): Activity[] {
  const next = activities.filter((item) => item.id !== activity.id)
  let index = -1
  if (activity.time) {
    index = next.findIndex((item) => item.date === activity.date && item.time !== "" && item.time > activity.time)
  }
  if (index === -1) {
    let lastSameDay = -1
    next.forEach((item, i) => {
      if (item.date === activity.date) lastSameDay = i
    })
    index = lastSameDay === -1 ? next.length : lastSameDay + 1
  }
  next.splice(index, 0, activity)
  return next
}

/** Moves an activity to position `toIndex` within its own day. */
export function moveWithinDay(activities: readonly Activity[], id: string, toIndex: number): Activity[] {
  const activity = activities.find((item) => item.id === id)
  if (!activity) return [...activities]
  return moveAmong(activities, (item) => item.date === activity.date, id, toIndex)
}

const MAPS_HOSTS = /^(maps\.google\.[a-z.]+|www\.google\.[a-z.]+|google\.[a-z.]+|maps\.app\.goo\.gl|goo\.gl)$/

/** True for Google Maps links, so the open button can say where it goes. */
export function isGoogleMapsUrl(href: string) {
  try {
    const url = new URL(href)
    if (!MAPS_HOSTS.test(url.hostname)) return false
    return (
      url.hostname.startsWith("maps.") ||
      url.pathname.startsWith("/maps") ||
      (url.hostname === "goo.gl" && url.pathname.startsWith("/maps"))
    )
  } catch {
    return false
  }
}
