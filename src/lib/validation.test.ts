import { describe, expect, it } from "vitest"
import { parseAmount } from "./money"
import {
  parseActivity,
  parseListing,
  parseTrip,
  safeHttpUrl,
  validateActivityForm,
  validateListingForm,
  validateTripForm,
  type ListingFormValues,
} from "./validation"

const groups = new Set(["g1"])
const valid: ListingFormValues = {
  groupId: "g1",
  name: "Riverside apartment",
  area: "Riverside",
  source: "Airbnb",
  url: "https://www.airbnb.com/rooms/123",
  checkIn: "2030-05-05",
  checkOut: "2030-05-08",
  guests: "2",
  currency: "JPY",
  amount: "45,000",
  basis: "stay",
  extraFees: "",
  feeCertainty: "confirmed",
  notes: "",
}

describe("safeHttpUrl", () => {
  it("accepts only absolute http(s) links", () => {
    expect(safeHttpUrl("https://www.airbnb.com/rooms/1")).toBe("https://www.airbnb.com/rooms/1")
    expect(safeHttpUrl("http://example.jp/")).toBe("http://example.jp/")
    expect(safeHttpUrl("  https://maps.app.goo.gl/abc  ")).toBe("https://maps.app.goo.gl/abc")
  })

  it("rejects scripts, data, other schemes, credentials, and relative links", () => {
    for (const unsafe of [
      "javascript:alert(1)",
      "JaVaScRiPt:alert(1)",
      "data:text/html,<script>alert(1)</script>",
      "vbscript:msgbox",
      "ftp://example.com",
      "file:///etc/passwd",
      "//evil.example",
      "/rooms/1",
      "airbnb.com/rooms/1",
      "https://user:pass@example.com",
      "https://exa mple.com",
      "",
    ]) {
      expect(safeHttpUrl(unsafe), unsafe).toBeNull()
    }
  })
})

describe("parseAmount", () => {
  it("parses plain and comma-grouped numbers", () => {
    expect(parseAmount("45,000")).toBe(45000)
    expect(parseAmount("12500.50")).toBe(12500.5)
    expect(parseAmount(" 0 ")).toBe(0)
  })

  it("rejects non-numeric, negative, and exponent input", () => {
    for (const bad of ["", "abc", "-5", "1e5", "Infinity", "NaN", "1.2.3", "¥100"]) {
      expect(parseAmount(bad), bad).toBeNaN()
    }
  })
})

describe("validateListingForm", () => {
  it("produces a draft for valid input", () => {
    const { draft, errors } = validateListingForm(valid, groups)
    expect(errors).toEqual({})
    expect(draft).toMatchObject({ amount: 45000, extraFees: 0, guests: 2, url: "https://www.airbnb.com/rooms/123" })
  })

  it.each([
    ["zero nights", { checkOut: "2030-05-05" }, "checkOut"],
    ["reversed dates", { checkOut: "2030-04-30" }, "checkOut"],
    ["invalid date", { checkIn: "2026-02-30" }, "checkIn"],
    ["zero guests", { guests: "0" }, "guests"],
    ["fractional guests", { guests: "2.5" }, "guests"],
    ["too many guests", { guests: "31" }, "guests"],
    ["zero price", { amount: "0" }, "amount"],
    ["negative price", { amount: "-100" }, "amount"],
    ["non-finite price", { amount: "Infinity" }, "amount"],
    ["negative fees", { extraFees: "-1" }, "extraFees"],
    ["unsafe link", { url: "javascript:alert(1)" }, "url"],
    ["missing name", { name: "   " }, "name"],
    ["unknown stay", { groupId: "nope" }, "groupId"],
  ] as const)("rejects %s", (_label, patch, field) => {
    const { draft, errors } = validateListingForm({ ...valid, ...patch }, groups)
    expect(draft).toBeNull()
    expect(errors[field]).toBeTruthy()
  })

  it("allows an empty link", () => {
    expect(validateListingForm({ ...valid, url: "" }, groups).draft?.url).toBe("")
  })
})

describe("parseListing", () => {
  const stored = {
    ...validateListingForm(valid, groups).draft!,
    id: "l1",
    booked: false,
    createdAt: "2026-10-01T00:00:00.000Z",
    updatedAt: "2026-10-01T00:00:00.000Z",
  }

  it("accepts a well-formed record", () => {
    expect(parseListing(stored)).toEqual(stored)
    expect(parseListing({ ...stored, booked: true })).toEqual({ ...stored, booked: true })
  })

  it("reads records from before booking existed as not booked, and rejects a malformed status", () => {
    const { booked: _booked, ...older } = stored
    expect(parseListing(older)).toEqual({ ...stored, booked: false })
    expect(parseListing({ ...stored, booked: "yes" })).toBeNull()
  })

  it.each([
    ["string amount", { amount: "45000" }],
    ["NaN amount", { amount: Number.NaN }],
    ["negative fees", { extraFees: -1 }],
    ["unsafe link", { url: "javascript:alert(1)" }],
    ["zero nights", { checkOut: stored.checkIn }],
    ["unknown currency", { currency: "EUR" }],
    ["unknown basis", { basis: "weekly" }],
    ["fractional guests", { guests: 1.5 }],
  ])("rejects %s", (_label, patch) => {
    expect(parseListing({ ...stored, ...patch })).toBeNull()
  })
})

describe("validateActivityForm", () => {
  const base = { date: "2030-05-01", name: "  Harbor walk  ", time: "", location: " Riverside ", url: "", notes: "" }

  it("needs only a name and a day; time can stay flexible", () => {
    const { draft, errors } = validateActivityForm(base)
    expect(errors).toEqual({})
    expect(draft).toEqual({ date: "2030-05-01", name: "Harbor walk", time: "", location: "Riverside", url: "", notes: "" })
  })

  it("rejects a missing name, a date that does not exist, a bad time, and unsafe links", () => {
    const { draft, errors } = validateActivityForm({
      ...base,
      name: " ",
      date: "2030-02-30",
      time: "9am",
      url: "javascript:alert(1)",
    })
    expect(draft).toBeNull()
    expect(Object.keys(errors).sort()).toEqual(["date", "name", "time", "url"])
  })
})

describe("parseActivity", () => {
  const record = {
    id: "a1",
    date: "2030-05-09",
    name: "Lakeshore walk",
    time: "08:15",
    location: "",
    url: "https://maps.app.goo.gl/x",
    notes: "",
    createdAt: "2026-10-01T00:00:00.000Z",
    updatedAt: "2026-10-01T00:00:00.000Z",
  }

  it("accepts a well-formed record and rejects broken ones", () => {
    expect(parseActivity(record)).toEqual(record)
    expect(parseActivity({ ...record, time: "" })).toEqual({ ...record, time: "" })
    expect(parseActivity({ ...record, date: "2030-02-30" })).toBeNull()
    expect(parseActivity({ ...record, date: "9 May" })).toBeNull()
    expect(parseActivity({ ...record, url: "data:text/html,x" })).toBeNull()
    expect(parseActivity({ ...record, name: "" })).toBeNull()
  })

  it("keeps an activity on any real date, whatever the trip dates are", () => {
    for (const date of ["2030-04-30", "2031-01-15", "2024-02-29"]) {
      expect(parseActivity({ ...record, date })).toEqual({ ...record, date })
    }
  })
})

describe("validateTripForm", () => {
  const base = { name: "  Spring trip ", destination: " Example City ", start: "2030-05-01", end: "2030-05-14" }

  it("trims text and allows an empty destination and a one-day trip", () => {
    expect(validateTripForm(base)).toEqual({
      trip: { name: "Spring trip", destination: "Example City", start: "2030-05-01", end: "2030-05-14" },
      errors: {},
    })
    expect(validateTripForm({ ...base, destination: "", end: "2030-05-01" }).trip).toEqual({
      name: "Spring trip",
      destination: "",
      start: "2030-05-01",
      end: "2030-05-01",
    })
  })

  it("rejects a missing name, invalid dates, an end before the start, and very long trips", () => {
    expect(Object.keys(validateTripForm({ ...base, name: " ", start: "", end: "2030-02-30" }).errors).sort()).toEqual([
      "end",
      "name",
      "start",
    ])
    expect(validateTripForm({ ...base, end: "2030-04-30" }).errors).toEqual({
      end: "The trip must end on or after its first day.",
    })
    expect(validateTripForm({ ...base, end: "2030-07-29" }).trip).not.toBeNull()
    expect(validateTripForm({ ...base, end: "2030-07-30" }).errors.end).toMatch(/longer than 90 days/)
  })
})

describe("parseTrip", () => {
  it("reads stored trip details and rejects anything else", () => {
    const trip = { name: "Spring trip", destination: "", start: "2030-05-01", end: "2030-05-14" }
    expect(parseTrip(trip)).toEqual(trip)
    expect(parseTrip({ ...trip, destination: undefined })).toBeNull()
    expect(parseTrip({ ...trip, end: "2030-04-01" })).toBeNull()
    expect(parseTrip("Spring trip")).toBeNull()
    expect(parseTrip(null)).toBeNull()
  })
})
