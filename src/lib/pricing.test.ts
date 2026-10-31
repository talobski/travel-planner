import { describe, expect, it } from "vitest"
import {
  buildComparison,
  computeQuote,
  findLowest,
  getRate,
  legacyQuoteOrder,
  perPersonNightly,
  quoteSection,
  setRate,
} from "./pricing"
import type { ComparisonSettings, Listing, StayGroup } from "./types"

const group: StayGroup = {
  id: "g1",
  area: "Old Town",
  checkIn: "2030-05-05",
  checkOut: "2030-05-08",
  guests: 2,
}

let seq = 0
function listing(overrides: Partial<Listing>): Listing {
  seq++
  return {
    id: `l${seq}`,
    groupId: "g1",
    name: `Place ${seq}`,
    area: "",
    source: "Airbnb",
    url: "",
    checkIn: group.checkIn,
    checkOut: group.checkOut,
    guests: group.guests,
    currency: "JPY",
    amount: 10000,
    basis: "nightly",
    extraFees: 0,
    feeCertainty: "confirmed",
    notes: "",
    booked: false,
    createdAt: `2026-10-01T00:00:${String(seq).padStart(2, "0")}.000Z`,
    updatedAt: "2026-10-01T00:00:00.000Z",
    ...overrides,
  }
}

const noRates: ComparisonSettings = { target: null, rates: {} }

describe("computeQuote", () => {
  const stay = { checkIn: "2030-05-05", checkOut: "2030-05-08" }

  it("multiplies nightly prices by nights and adds one-time fees", () => {
    const quote = computeQuote({ ...stay, amount: 15000, basis: "nightly", extraFees: 5000 })
    expect(quote).toMatchObject({ nights: 3, baseTotal: 45000, stayTotal: 50000 })
    expect(quote!.effectiveNightly).toBeCloseTo(16666.6667, 3)
  })

  it("adds fees once to stay totals, not per night", () => {
    const quote = computeQuote({ ...stay, amount: 45000, basis: "stay", extraFees: 5000 })
    expect(quote).toMatchObject({ baseTotal: 45000, stayTotal: 50000 })
  })

  it("treats equivalent nightly and stay quotes the same", () => {
    const nightly = computeQuote({ ...stay, amount: 15000, basis: "nightly", extraFees: 3000 })!
    const total = computeQuote({ ...stay, amount: 45000, basis: "stay", extraFees: 3000 })!
    expect(nightly.stayTotal).toBe(total.stayTotal)
    expect(nightly.effectiveNightly).toBe(total.effectiveNightly)
  })

  it("does not round the nightly rate before computing the total", () => {
    // A ₱10,000 stay over 3 nights is ₱3,333.33… per night; rounding first would give ₱9,999.99.
    const quote = computeQuote({ ...stay, amount: 10000, basis: "stay", extraFees: 0 })!
    expect(quote.effectiveNightly * quote.nights).toBeCloseTo(10000, 9)
    const nightly = computeQuote({ ...stay, amount: 3333.335, basis: "nightly", extraFees: 0 })!
    expect(nightly.stayTotal).toBeCloseTo(10000.005, 9)
  })

  it("rejects zero nights, reversed dates, and invalid amounts", () => {
    expect(computeQuote({ checkIn: "2030-05-08", checkOut: "2030-05-08", amount: 1, basis: "stay", extraFees: 0 })).toBeNull()
    expect(computeQuote({ checkIn: "2030-05-08", checkOut: "2030-05-05", amount: 1, basis: "stay", extraFees: 0 })).toBeNull()
    expect(computeQuote({ ...stay, amount: 0, basis: "stay", extraFees: 0 })).toBeNull()
    expect(computeQuote({ ...stay, amount: -5, basis: "stay", extraFees: 0 })).toBeNull()
    expect(computeQuote({ ...stay, amount: Number.NaN, basis: "stay", extraFees: 0 })).toBeNull()
    expect(computeQuote({ ...stay, amount: Number.POSITIVE_INFINITY, basis: "stay", extraFees: 0 })).toBeNull()
    expect(computeQuote({ ...stay, amount: 100, basis: "stay", extraFees: -1 })).toBeNull()
  })
})

describe("perPersonNightly", () => {
  it("splits the all-in stay total by nights, then by guests", () => {
    // ¥15,000 × 3 nights + ¥6,000 fees = ¥51,000; ÷ 3 nights = ¥17,000; ÷ 2 guests = ¥8,500.
    const quote = computeQuote({ checkIn: "2030-05-05", checkOut: "2030-05-08", amount: 15000, basis: "nightly", extraFees: 6000 })!
    expect(perPersonNightly(quote.stayTotal, quote.nights, 2)).toBe(8500)
  })

  it("does not round before the final division", () => {
    // ₱10,000 for 3 nights, 3 guests: 1,111.111…, not 3,333.33 ÷ 3 = 1,111.11.
    expect(perPersonNightly(10000, 3, 3)).toBeCloseTo(10000 / 9, 12)
    expect(perPersonNightly(10000, 3, 3)).not.toBe(1111.11)
  })

  it("rejects guest counts that are not positive whole numbers", () => {
    for (const guests of [0, -1, 1.5, Number.NaN]) expect(perPersonNightly(30000, 3, guests)).toBeNull()
  })
})

describe("rates", () => {
  it("stores manual rates per direction and rejects invalid values", () => {
    let settings = setRate(noRates, "JPY", "PHP", 0.38)
    expect(getRate(settings, "JPY", "PHP")).toBe(0.38)
    expect(getRate(settings, "PHP", "JPY")).toBeNull()
    expect(getRate(settings, "JPY", "JPY")).toBe(1)
    settings = { ...settings, rates: { ...settings.rates, "USD:PHP": 0 } }
    expect(getRate(settings, "USD", "PHP")).toBeNull()
    settings = setRate(settings, "JPY", "PHP", null)
    expect(getRate(settings, "JPY", "PHP")).toBeNull()
  })
})

describe("buildComparison", () => {
  it("keeps the saved order and marks the lowest all-in total wherever it sits", () => {
    const a = listing({ name: "A", amount: 20000 })
    const b = listing({ name: "B", amount: 50000, basis: "stay" })
    const c = listing({ name: "C", amount: 12000, extraFees: 9000 })
    const result = buildComparison(group, [a, b, c], noRates)
    expect(result.sections).toHaveLength(1)
    expect(result.sections[0].rows.map((row) => row.listing.name)).toEqual(["A", "B", "C"])
    expect(result.sections[0].rows.map((row) => row.total)).toEqual([60000, 50000, 45000])
    expect(result.sections[0].lowest).toEqual({ id: c.id, kind: "lowest" })
  })

  it("gives the same prices and Lowest label in any order", () => {
    const a = listing({ name: "A", amount: 20000 })
    const b = listing({ name: "B", amount: 9000, feeCertainty: "unknown" })
    const c = listing({ name: "C", amount: 12000, extraFees: 9000 })
    const d = listing({ name: "D", amount: 15000 }) // ties with C
    const orders = [
      [a, b, c, d],
      [d, c, b, a],
      [b, d, a, c],
    ]
    const results = orders.map((order) => buildComparison(group, order, noRates).sections[0])
    for (const section of results) {
      expect(section.lowest).toEqual({ id: c.id, kind: "lowest-confirmed" })
      const totals = Object.fromEntries(section.rows.map((row) => [row.listing.name, [row.total, row.nightly, row.perPerson]]))
      expect(totals).toEqual(Object.fromEntries(results[0].rows.map((row) => [row.listing.name, [row.total, row.nightly, row.perPerson]])))
    }
  })

  it("never ranks mixed currencies together without a manual rate", () => {
    const yen = listing({ currency: "JPY", amount: 15000 })
    const peso = listing({ currency: "PHP", amount: 5000 })
    const result = buildComparison(group, [yen, peso], noRates)
    expect(result.sections.map((section) => section.currency)).toEqual(["JPY", "PHP"])
    expect(result.sections.every((section) => !section.converted)).toBe(true)
    // A single quote per currency has nothing to be lowest against.
    expect(result.sections.every((section) => section.lowest === null)).toBe(true)
  })

  it("converts to a common currency only with an explicit manual rate", () => {
    const yen = listing({ currency: "JPY", amount: 15000 }) // ¥45,000 total
    const peso = listing({ currency: "PHP", amount: 6000 }) // ₱18,000 total
    const settings = setRate({ target: "PHP", rates: {} }, "JPY", "PHP", 0.37)
    const result = buildComparison(group, [peso, yen], settings)
    expect(result.sections).toHaveLength(1)
    const [section] = result.sections
    expect(section).toMatchObject({ currency: "PHP", converted: true })
    expect(section.rows.map((row) => row.listing.id)).toEqual([peso.id, yen.id])
    expect(section.lowest?.id).toBe(yen.id)
    expect(section.rows[1].total).toBeCloseTo(16650, 6)
    expect(section.rows[1].converted).toBe(true)
    expect(section.rows[0]).toMatchObject({ total: 18000, converted: false })
  })

  it("keeps currencies without a rate in their own section and reports them", () => {
    const yen = listing({ currency: "JPY" })
    const usd = listing({ currency: "USD", amount: 100 })
    const peso = listing({ currency: "PHP", amount: 3000 })
    const settings = setRate({ target: "PHP", rates: {} }, "JPY", "PHP", 0.37)
    const result = buildComparison(group, [yen, usd, peso], settings)
    expect(result.missingRates).toEqual(["USD"])
    expect(result.sections.map((section) => section.currency)).toEqual(["PHP", "USD"])
    expect(result.sections[0].rows).toHaveLength(2)
  })

  it("separates quotes for other dates or guest counts instead of ranking them", () => {
    const same = listing({ amount: 30000 })
    const shorter = listing({ checkIn: "2030-05-06", amount: 1000 })
    const bigger = listing({ guests: 4, amount: 1000 })
    const result = buildComparison(group, [same, shorter, bigger], noRates)
    expect(result.sections[0].rows.map((row) => row.listing.id)).toEqual([same.id])
    expect(result.mismatched.map((row) => row.listing.id)).toEqual([shorter.id, bigger.id])
    expect(result.mismatched.find((row) => row.listing.id === shorter.id)).toMatchObject({ datesDiffer: true, guestsDiffer: false })
    expect(result.mismatched.find((row) => row.listing.id === bigger.id)).toMatchObject({ datesDiffer: false, guestsDiffer: true })
  })

  it("ignores listings from other stays", () => {
    const other = listing({ groupId: "g2" })
    expect(buildComparison(group, [other], noRates).sections).toHaveLength(0)
  })
})

describe("buildComparison per person / night", () => {
  it("uses each quote's own guest count, including quotes for different guests", () => {
    const same = listing({ amount: 60000, basis: "stay", extraFees: 6000 }) // 66,000 / 3 / 2
    const more = listing({ amount: 60000, basis: "stay", guests: 5 }) // 60,000 / 3 / 5
    const result = buildComparison(group, [same, more], noRates)
    expect(result.sections[0].rows[0].perPerson).toBe(11000)
    expect(result.mismatched[0].listing.id).toBe(more.id)
    expect(result.mismatched[0].perPerson).toBe(4000)
  })

  it("converts with the manual rate from the unrounded value", () => {
    const yen = listing({ amount: 10000, basis: "stay" }) // 10,000 / 3 / 2 = 1,666.67 (unrounded)
    const peso = listing({ currency: "PHP", amount: 3000, basis: "stay" })
    const settings = setRate({ target: "PHP", rates: {} }, "JPY", "PHP", 0.37)
    const rows = buildComparison(group, [yen, peso], settings).sections[0].rows
    const converted = rows.find((row) => row.listing.id === yen.id)!
    expect(converted.converted).toBe(true)
    expect(converted.perPerson).toBeCloseTo((10000 / 3 / 2) * 0.37, 12)
    expect(rows.find((row) => row.listing.id === peso.id)!.perPerson).toBe(500)
  })
})

describe("findLowest", () => {
  it("does not crown an unconfirmed quote as cheapest", () => {
    const unknown = listing({ amount: 8000, feeCertainty: "unknown", extraFees: 0 })
    const estimated = listing({ amount: 9000, feeCertainty: "estimated", extraFees: 1000 })
    const confirmed = listing({ amount: 12000, feeCertainty: "confirmed" })
    const result = buildComparison(group, [unknown, estimated, confirmed], noRates)
    const section = result.sections[0]
    expect(section.rows[0].listing.id).toBe(unknown.id)
    expect(section.lowest).toEqual({ id: confirmed.id, kind: "lowest-confirmed" })
  })

  it("has no lowest when nothing is confirmed", () => {
    const rows = buildComparison(group, [listing({ feeCertainty: "unknown" })], noRates).sections[0].rows
    expect(findLowest(rows)).toBeNull()
  })

  it("prefers the confirmed quote on a tie", () => {
    const unknown = listing({ name: "A", amount: 10000, feeCertainty: "unknown" })
    const confirmed = listing({ name: "B", amount: 30000, basis: "stay" })
    const section = buildComparison(group, [unknown, confirmed], noRates).sections[0]
    expect(section.lowest).toEqual({ id: confirmed.id, kind: "lowest" })
  })

  it("breaks a tie between confirmed quotes by name, not by position", () => {
    const zen = listing({ name: "Zen house", amount: 10000 })
    const aoi = listing({ name: "Aoi flat", amount: 10000 })
    for (const order of [[zen, aoi], [aoi, zen]]) {
      expect(buildComparison(group, order, noRates).sections[0].lowest).toEqual({ id: aoi.id, kind: "lowest" })
    }
  })
})

describe("legacyQuoteOrder", () => {
  it("puts quotes saved before manual ordering in the order the app showed them", () => {
    const other: StayGroup = { ...group, id: "g2", checkIn: "2030-05-10", checkOut: "2030-05-15" }
    const pricey = listing({ name: "Pricey", amount: 30000 })
    const late = listing({ name: "Late", checkIn: "2030-05-06" })
    const peso = listing({ name: "Peso", currency: "PHP", amount: 3000 })
    const cheap = listing({ name: "Cheap", amount: 5000 })
    const early = listing({ name: "Early", checkOut: "2030-05-07" })
    const elsewhere = listing({ name: "Elsewhere", groupId: "g2", checkIn: other.checkIn, checkOut: other.checkOut })
    const ordered = legacyQuoteOrder([group, other], [pricey, elsewhere, late, peso, cheap, early], noRates)
    // Each currency cheapest first, then other dates by date, stay by stay.
    expect(ordered.map((item) => item.name)).toEqual(["Cheap", "Pricey", "Peso", "Early", "Late", "Elsewhere"])
  })
})

describe("quoteSection", () => {
  it("changes only with the stay, the currency, or whether dates and guests match", () => {
    const base = listing({})
    const key = quoteSection(base, [group])
    expect(quoteSection({ ...base, name: "Renamed", amount: 1, notes: "x", feeCertainty: "unknown" }, [group])).toBe(key)
    expect(quoteSection({ ...base, currency: "PHP" }, [group])).not.toBe(key)
    expect(quoteSection({ ...base, groupId: "g2" }, [group])).not.toBe(key)
    const shifted = quoteSection({ ...base, checkIn: "2030-05-06" }, [group])
    expect(shifted).not.toBe(key)
    // Both on other dates: the same list.
    expect(quoteSection({ ...base, checkIn: "2030-05-06", guests: 4 }, [group])).toBe(shifted)
  })
})
