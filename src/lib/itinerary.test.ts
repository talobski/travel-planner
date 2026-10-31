import { describe, expect, it } from "vitest"
import {
  dayParts,
  daysFrom,
  formatDay,
  formatTime,
  isGoogleMapsUrl,
  isInTrip,
  itineraryDays,
  moveWithinDay,
  placeActivity,
  tripLength,
} from "./itinerary"
import type { Activity } from "./types"

function activity(id: string, date: string, time = ""): Activity {
  return {
    id,
    date,
    name: id,
    time,
    location: "",
    url: "",
    notes: "",
    createdAt: "2026-10-01T00:00:00.000Z",
    updatedAt: "2026-10-01T00:00:00.000Z",
  }
}

const ids = (list: Activity[]) => list.map((item) => item.id)

describe("trip days", () => {
  const trip = { start: "2030-05-01", end: "2030-05-14" }

  it("lists every day from the first to the last, in order, across months", () => {
    const days = daysFrom(trip.start, trip.end)
    expect(days).toHaveLength(14)
    expect(days[0]).toBe("2030-05-01")
    expect(days.at(-1)).toBe("2030-05-14")
    expect(daysFrom("2030-04-29", "2030-05-02")).toEqual(["2030-04-29", "2030-04-30", "2030-05-01", "2030-05-02"])
    expect(daysFrom("2030-05-01", "2030-05-01")).toEqual(["2030-05-01"])
    expect(daysFrom("2030-05-02", "2030-05-01")).toEqual([])
    expect(daysFrom("", "2030-05-01")).toEqual([])
    expect(tripLength(trip)).toBe(14)
  })

  it("keeps empty trip days and adds days outside the trip that have activities", () => {
    const outside = [activity("before", "2030-04-28"), activity("in", "2030-05-03"), activity("after", "2030-05-20")]
    const days = itineraryDays(trip, outside)
    expect(days).toHaveLength(16)
    expect(days[0]).toBe("2030-04-28")
    expect(days.slice(1, 15)).toEqual(daysFrom(trip.start, trip.end))
    expect(days.at(-1)).toBe("2030-05-20")
    expect(isInTrip(trip, "2030-04-28")).toBe(false)
    expect(isInTrip(trip, "2030-05-14")).toBe(true)
  })

  it("shows only days with activities when the trip dates are not set", () => {
    expect(itineraryDays(null, [activity("b", "2030-05-09"), activity("a", "2030-05-02"), activity("c", "2030-05-09")])).toEqual([
      "2030-05-02",
      "2030-05-09",
    ])
    expect(itineraryDays(null, [])).toEqual([])
    expect(isInTrip(null, "2030-05-02")).toBe(false)
  })

  it("formats days and times without timezone drift", () => {
    expect(dayParts("2030-05-01")).toEqual({ weekday: "Wed", monthDay: "May 1" })
    expect(formatDay("2030-05-14")).toBe("Tue, May 14, 2030")
    expect(formatTime("09:30")).toBe("9:30 AM")
    expect(formatTime("00:05")).toBe("12:05 AM")
    expect(formatTime("18:00")).toBe("6:00 PM")
  })
})

describe("placeActivity", () => {
  const day = "2030-05-06"
  const list = [activity("flex", day), activity("other-day", "2030-05-07"), activity("nine", day, "09:00"), activity("two", day, "14:00")]

  it("puts a timed activity before the first later time that day", () => {
    expect(ids(placeActivity(list, activity("noon", day, "12:00")))).toEqual(["flex", "other-day", "nine", "noon", "two"])
    expect(ids(placeActivity(list, activity("early", day, "07:00")))).toEqual(["flex", "other-day", "early", "nine", "two"])
    expect(ids(placeActivity(list, activity("late", day, "21:00")))).toEqual(["flex", "other-day", "nine", "two", "late"])
  })

  it("puts a flexible activity last on its day, and starts an empty day at the end", () => {
    expect(ids(placeActivity(list, activity("new", day)))).toEqual(["flex", "other-day", "nine", "two", "new"])
    expect(ids(placeActivity(list, activity("new", "2030-05-01")))).toEqual(["flex", "other-day", "nine", "two", "new"])
  })

  it("moves an existing activity instead of duplicating it", () => {
    expect(ids(placeActivity(list, { ...list[0], time: "10:00" }))).toEqual(["other-day", "nine", "flex", "two"])
  })
})

describe("moveWithinDay", () => {
  const day = "2030-05-06"
  const list = [activity("a", day), activity("x", "2030-05-07"), activity("b", day), activity("c", day)]

  it("reorders one day and leaves other days where they were", () => {
    expect(ids(moveWithinDay(list, "c", 0))).toEqual(["c", "x", "a", "b"])
    expect(ids(moveWithinDay(list, "a", 2))).toEqual(["b", "x", "c", "a"])
    expect(ids(moveWithinDay(list, "a", 99))).toEqual(["b", "x", "c", "a"])
    expect(ids(moveWithinDay(list, "missing", 0))).toEqual(ids(list))
  })
})

describe("isGoogleMapsUrl", () => {
  it("recognizes Google Maps links only", () => {
    expect(isGoogleMapsUrl("https://maps.app.goo.gl/abc")).toBe(true)
    expect(isGoogleMapsUrl("https://www.google.com/maps/place/Central+Market")).toBe(true)
    expect(isGoogleMapsUrl("https://maps.google.co.jp/?q=Lakeside")).toBe(true)
    expect(isGoogleMapsUrl("https://goo.gl/maps/xyz")).toBe(true)
    expect(isGoogleMapsUrl("https://www.google.com/search?q=maps")).toBe(false)
    expect(isGoogleMapsUrl("https://example.com/maps")).toBe(false)
  })
})
