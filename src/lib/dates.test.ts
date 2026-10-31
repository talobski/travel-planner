import { describe, expect, it } from "vitest"
import { formatDateRange, formatDateRangeLong, isIsoDate, nightsBetween } from "./dates"

describe("nightsBetween", () => {
  it("counts calendar nights for the trip stays", () => {
    expect(nightsBetween("2030-05-05", "2030-05-08")).toBe(3)
    expect(nightsBetween("2030-05-08", "2030-05-10")).toBe(2)
    expect(nightsBetween("2030-05-10", "2030-05-14")).toBe(4)
  })

  it("crosses month, year, and leap-day boundaries", () => {
    expect(nightsBetween("2026-11-30", "2026-12-01")).toBe(1)
    expect(nightsBetween("2026-12-30", "2027-01-02")).toBe(3)
    expect(nightsBetween("2028-02-28", "2028-03-01")).toBe(2)
    expect(nightsBetween("2027-02-28", "2027-03-01")).toBe(1)
  })

  it("is not shifted by DST transitions", () => {
    // US and EU DST changes; a local-time implementation would yield fractional days.
    expect(nightsBetween("2026-03-07", "2026-03-09")).toBe(2)
    expect(nightsBetween("2026-03-28", "2026-03-30")).toBe(2)
    expect(nightsBetween("2026-10-31", "2026-11-02")).toBe(2)
    expect(Number.isInteger(nightsBetween("2026-01-01", "2026-12-31"))).toBe(true)
    expect(nightsBetween("2026-01-01", "2026-12-31")).toBe(364)
  })

  it("returns zero or negative for same-day or reversed ranges", () => {
    expect(nightsBetween("2030-05-08", "2030-05-08")).toBe(0)
    expect(nightsBetween("2030-05-08", "2030-05-05")).toBe(-3)
  })

  it("rejects invalid dates", () => {
    expect(nightsBetween("2026-02-30", "2026-03-02")).toBeNull()
    expect(nightsBetween("2030-5-05", "2030-05-08")).toBeNull()
    expect(nightsBetween("", "2030-05-08")).toBeNull()
    expect(nightsBetween("2026-13-01", "2030-05-08")).toBeNull()
    expect(isIsoDate("2030-05-05T00:00")).toBe(false)
    expect(isIsoDate(20300505)).toBe(false)
  })
})

describe("formatDateRange", () => {
  it("formats short and long ranges", () => {
    expect(formatDateRange("2030-05-05", "2030-05-08")).toBe("May 5–8")
    expect(formatDateRange("2026-12-30", "2027-01-02")).toBe("Dec 30–Jan 2")
    expect(formatDateRangeLong("2030-05-05", "2030-05-08")).toBe("Sun, May 5 to Wed, May 8, 2030")
  })
})
