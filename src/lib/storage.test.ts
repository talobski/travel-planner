import { describe, expect, it } from "vitest"
import {
  SAMPLE_TRIP,
  STORAGE_KEY,
  applyImport,
  defaultData,
  keepCopy,
  loadData,
  parseAppData,
  planImport,
  saveData,
  serializeExport,
} from "./storage"
import type { Activity, AppData, Listing, Trip } from "./types"

function listing(id: string, overrides: Partial<Listing> = {}): Listing {
  return {
    id,
    groupId: "sample-old-town-1",
    name: `Place ${id}`,
    area: "",
    source: "Airbnb",
    url: "",
    checkIn: "2030-05-05",
    checkOut: "2030-05-08",
    guests: 2,
    currency: "JPY",
    amount: 40000,
    basis: "stay",
    extraFees: 0,
    feeCertainty: "confirmed",
    notes: "",
    booked: false,
    createdAt: "2026-10-01T00:00:00.000Z",
    updatedAt: "2026-10-01T00:00:00.000Z",
    ...overrides,
  }
}

function activity(id: string, overrides: Partial<Activity> = {}): Activity {
  return {
    id,
    date: "2030-05-06",
    name: `Plan ${id}`,
    time: "",
    location: "",
    url: "",
    notes: "",
    createdAt: "2026-10-01T00:00:00.000Z",
    updatedAt: "2026-10-01T00:00:00.000Z",
    ...overrides,
  }
}

function withListings(...listings: Listing[]): AppData {
  return { ...defaultData(), listings }
}

const trip = (overrides: Partial<Trip> = {}): Trip => ({ ...SAMPLE_TRIP, ...overrides })

/** A save or backup from before trip details existed. */
function legacy(data: AppData) {
  const old = JSON.parse(JSON.stringify(data))
  delete old.trip
  return old
}

describe("defaultData", () => {
  it("starts a fresh browser with the sample trip", () => {
    expect(defaultData().trip).toEqual({ name: "Sample trip", destination: "Example City", start: "2030-05-01", end: "2030-05-14" })
  })

  it("prefills the three trip stays", () => {
    expect(defaultData().groups).toEqual([
      { id: "sample-old-town-1", area: "Old Town", checkIn: "2030-05-05", checkOut: "2030-05-08", guests: 2 },
      { id: "sample-lakeside", area: "Lakeside", checkIn: "2030-05-08", checkOut: "2030-05-10", guests: 4 },
      { id: "sample-old-town-2", area: "Old Town", checkIn: "2030-05-10", checkOut: "2030-05-14", guests: 4 },
    ])
  })
})

describe("load and save", () => {
  it("round-trips through storage", () => {
    const data = withListings(listing("a"))
    saveData(data)
    const loaded = loadData()
    expect(loaded.status).toBe("ok")
    expect(loaded.data).toEqual(data)
  })

  it("keeps unreadable data under a backup key instead of discarding it", () => {
    localStorage.setItem(STORAGE_KEY, "{not json")
    const loaded = loadData()
    expect(loaded.status).toBe("corrupt")
    if (loaded.status !== "corrupt") return
    expect(loaded.recovery).toMatchObject({ kind: "unreadable", original: null })
    expect(localStorage.getItem(loaded.recovery.backupKey!)).toBe("{not json")
    expect(loaded.data).toEqual(defaultData())
  })
})

describe("export and import", () => {
  it("exports a file that imports back cleanly", () => {
    const data = withListings(listing("a"), listing("b", { currency: "PHP", amount: 12000 }))
    const file = JSON.parse(serializeExport(data))
    expect(file.format).toBe("japan-stay-compare")
    expect(parseAppData(file).data).toEqual(data)
  })

  it("rejects files that are not backups", () => {
    expect(() => planImport(defaultData(), [])).toThrow()
    expect(() => planImport(defaultData(), { version: 2, groups: [], listings: [] })).toThrow()
    expect(() => planImport(defaultData(), { hello: "world" })).toThrow()
  })

  it("skips invalid records and listings for unknown stays", () => {
    const file = {
      version: 1,
      groups: defaultData().groups,
      listings: [
        listing("ok"),
        listing("bad-amount", { amount: -1 }),
        { ...listing("bad-url"), url: "javascript:alert(1)" },
        listing("orphan", { groupId: "missing" }),
      ],
    }
    const plan = planImport(defaultData(), file)
    expect(plan.incoming.listings.map((l) => l.id)).toEqual(["ok"])
    expect(plan.rejected.listings).toBe(3)
  })

  it("adds new records, skips identical ones, and never overwrites existing data", () => {
    const current = withListings(listing("same"), listing("conflict", { amount: 40000 }))
    const file = JSON.parse(
      serializeExport(withListings(listing("same"), listing("conflict", { amount: 99999 }), listing("new"))),
    )
    const plan = planImport(current, file)
    expect(plan).toMatchObject({ newListings: 1, identicalListings: 1, conflictingListings: 1 })

    let n = 0
    const keepMine = applyImport(current, plan, "keep-existing", () => `id${++n}`)
    expect(keepMine.listings.map((l) => l.id)).toEqual(["same", "conflict", "new"])
    expect(keepMine.listings.find((l) => l.id === "conflict")!.amount).toBe(40000)

    const keepBoth = applyImport(current, plan, "keep-both", () => `id${++n}`)
    expect(keepBoth.listings).toHaveLength(4)
    expect(keepBoth.listings.find((l) => l.id === "conflict")!.amount).toBe(40000)
    expect(keepBoth.listings.some((l) => l.amount === 99999 && l.id !== "conflict")).toBe(true)
  })

  it("remaps listings when a conflicting stay is kept as a copy", () => {
    const current = defaultData()
    const incoming = defaultData()
    incoming.groups[0] = { ...incoming.groups[0], guests: 3 }
    incoming.listings = [listing("x", { guests: 3 })]
    const plan = planImport(current, JSON.parse(serializeExport(incoming)))
    expect(plan.conflictingGroups).toBe(1)
    const merged = applyImport(current, plan, "keep-both", () => "copy")
    expect(merged.groups.find((g) => g.id === "copy")?.guests).toBe(3)
    expect(merged.groups.find((g) => g.id === "sample-old-town-1")?.guests).toBe(2)
    expect(merged.listings[0].groupId).toBe("copy")
  })

  it("imports manual rates only where none exist", () => {
    const current: AppData = { ...defaultData(), comparison: { target: "PHP", rates: { "JPY:PHP": 0.37 } } }
    const incoming: AppData = { ...defaultData(), comparison: { target: "JPY", rates: { "JPY:PHP": 0.5, "USD:PHP": 58 } } }
    const merged = applyImport(current, planImport(current, incoming), "keep-existing", () => "x")
    expect(merged.comparison).toEqual({ target: "PHP", rates: { "JPY:PHP": 0.37, "USD:PHP": 58 } })
  })

  it("reads saves and backups from before the itinerary, with no activities", () => {
    const old = { version: 1, groups: defaultData().groups, listings: [listing("a")], comparison: { target: null, rates: {} } }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(old))
    const loaded = loadData()
    expect(loaded).toMatchObject({ status: "ok", recovery: null })
    expect(loaded.data.listings.map((l) => l.id)).toEqual(["a"])
    expect(loaded.data.activities).toEqual([])
    // Old data has no trip details; they are left for the user to confirm, not filled in.
    expect(loaded.data.trip).toBeNull()

    // Importing an old backup keeps the activities already here.
    const current = { ...withListings(listing("b")), activities: [activity("kept")] }
    const plan = planImport(current, { format: "japan-stay-compare", ...old })
    expect(plan).toMatchObject({ newListings: 1, newActivities: 0, conflictingActivities: 0 })
    const merged = applyImport(current, plan, "keep-existing", () => "x")
    expect(merged.activities.map((a) => a.id)).toEqual(["kept"])
    expect(merged.listings.map((l) => l.id)).toEqual(["b", "a"])
  })

  it("exports activities and merges them like quotes, without overwriting", () => {
    const current = { ...defaultData(), activities: [activity("same"), activity("conflict", { time: "09:00" })] }
    const incoming = {
      ...defaultData(),
      activities: [
        activity("same"),
        activity("conflict", { time: "15:00" }),
        activity("new", { date: "2030-05-01", url: "https://maps.app.goo.gl/abc" }),
        activity("outside-trip", { date: "2030-05-19" }),
        { ...activity("bad-link"), url: "javascript:alert(1)" },
        activity("bad-time", { time: "25:00" }),
        activity("bad-date", { date: "2030-02-30" }),
      ],
    }
    const file = JSON.parse(serializeExport(incoming))
    expect(file.activities).toHaveLength(7)
    const plan = planImport(current, file)
    // An activity outside the trip dates is still a valid activity.
    expect(plan).toMatchObject({ newActivities: 2, identicalActivities: 1, conflictingActivities: 1 })
    expect(plan.rejected.activities).toBe(3)

    const keepMine = applyImport(current, plan, "keep-existing", () => "copy")
    expect(keepMine.activities.map((a) => a.id)).toEqual(["same", "conflict", "new", "outside-trip"])
    expect(keepMine.activities.find((a) => a.id === "conflict")!.time).toBe("09:00")

    const keepBoth = applyImport(current, plan, "keep-both", () => "copy")
    expect(keepBoth.activities.map((a) => a.id)).toEqual(["same", "conflict", "copy", "new", "outside-trip"])
    expect(keepBoth.activities.find((a) => a.id === "copy")!.time).toBe("15:00")
  })

  it("round-trips activities through storage in their saved order", () => {
    const data = { ...defaultData(), activities: [activity("b", { time: "18:00" }), activity("a")] }
    saveData(data)
    expect(loadData().data).toEqual(data)
  })

  it("exports booking, reads older data as not booked, and never lets an older backup unbook a quote", () => {
    const booked = { ...listing("a"), booked: true }
    const current = withListings(booked, listing("b"))
    expect(JSON.parse(serializeExport(current)).listings[0].booked).toBe(true)
    expect(parseAppData(JSON.parse(serializeExport(current))).data).toEqual(current)

    // An older backup has no booking field at all.
    const older = JSON.parse(serializeExport(withListings(listing("a"), listing("b"), listing("c"))))
    for (const item of older.listings) delete item.booked
    expect(parseAppData(older).data.listings.every((l) => l.booked === false)).toBe(true)

    const plan = planImport(current, older)
    expect(plan).toMatchObject({ newListings: 1, identicalListings: 2, conflictingListings: 0 })
    for (const policy of ["keep-existing", "keep-both"] as const) {
      const merged = applyImport(current, plan, policy, () => "copy")
      expect(merged.listings.map((l) => [l.id, l.booked])).toEqual([["a", true], ["b", false], ["c", false]])
    }

    // A newer backup that says otherwise is a real difference, handled as a conflict like any other.
    const newer = JSON.parse(serializeExport(withListings(listing("a"))))
    const conflict = planImport(current, newer)
    expect(conflict.conflictingListings).toBe(1)
    expect(applyImport(current, conflict, "keep-existing", () => "copy").listings[0].booked).toBe(true)
    const both = applyImport(current, conflict, "keep-both", () => "copy")
    expect(both.listings.map((l) => [l.id, l.booked])).toEqual([["a", true], ["b", false], ["copy", false]])
  })

  it("loads saves from before booking existed as not booked", () => {
    const saved = JSON.parse(JSON.stringify(withListings(listing("a"))))
    delete saved.listings[0].booked
    localStorage.setItem(STORAGE_KEY, JSON.stringify(saved))
    expect(loadData().data.listings[0].booked).toBe(false)
  })

  it("keeps an established quote order through storage and backups", () => {
    // Deliberately not cheapest first: the user put the priciest quote at the top.
    const data = withListings(listing("pricey", { amount: 90000 }), listing("cheap", { amount: 10000 }), listing("mid"))
    saveData(data)
    expect(loadData().data.listings.map((l) => l.id)).toEqual(["pricey", "cheap", "mid"])
    const exported = JSON.parse(serializeExport(data))
    expect(exported.quoteOrder).toBe("manual")
    expect(parseAppData(exported).data.listings.map((l) => l.id)).toEqual(["pricey", "cheap", "mid"])
  })

  it("shows quotes from before manual ordering in the order the app used, cheapest first", () => {
    const saved = JSON.parse(JSON.stringify(withListings(listing("pricey", { amount: 90000 }), listing("cheap", { amount: 10000 }))))
    delete saved.quoteOrder
    localStorage.setItem(STORAGE_KEY, JSON.stringify(saved))
    const loaded = loadData().data
    expect(loaded.listings.map((l) => l.id)).toEqual(["cheap", "pricey"])
    expect(loaded.quoteOrder).toBe("manual")
    // Nothing else about the quotes changes.
    expect(loaded.listings.find((l) => l.id === "pricey")).toEqual(listing("pricey", { amount: 90000 }))
  })

  it("adds imported quotes after the existing ones without reshuffling them, for old and new backups", () => {
    const current = withListings(listing("mine-b", { amount: 90000 }), listing("mine-a", { amount: 10000 }))
    const newer = withListings(listing("mine-a", { amount: 10000 }), listing("new-2", { amount: 70000 }), listing("new-1", { amount: 20000 }))
    const merged = applyImport(current, planImport(current, JSON.parse(serializeExport(newer))), "keep-existing", () => "x")
    expect(merged.listings.map((l) => l.id)).toEqual(["mine-b", "mine-a", "new-2", "new-1"])

    // An older backup has no saved order, so its new quotes arrive cheapest first.
    const older = JSON.parse(serializeExport(newer))
    delete older.quoteOrder
    const fromOlder = applyImport(current, planImport(current, older), "keep-existing", () => "x")
    expect(fromOlder.listings.map((l) => l.id)).toEqual(["mine-b", "mine-a", "new-1", "new-2"])
    expect(fromOlder.quoteOrder).toBe("manual")
  })

  it("exports trip details and reads them back", () => {
    const data = { ...defaultData(), trip: trip({ name: "Spring trip", destination: "" }) }
    const file = JSON.parse(serializeExport(data))
    expect(file.trip).toEqual({ name: "Spring trip", destination: "", start: "2030-05-01", end: "2030-05-14" })
    expect(parseAppData(file).data).toEqual(data)
    saveData(data)
    expect(loadData().data.trip).toEqual(data.trip)
  })

  it("never changes the trip on import without being asked", () => {
    const mine = { ...defaultData(), trip: trip({ name: "Mine" }) }
    const theirs = { ...defaultData(), trip: trip({ name: "Theirs", end: "2030-05-20" }) }

    // Same trip details: nothing to decide.
    expect(planImport(mine, JSON.parse(serializeExport(mine))).tripChange).toBe("none")
    // An old backup has none, so it cannot affect the current trip.
    const fromOld = planImport(mine, legacy(theirs))
    expect(fromOld.tripChange).toBe("none")
    expect(applyImport(mine, fromOld, "keep-existing", () => "x", true).trip).toEqual(mine.trip)

    const conflict = planImport(mine, JSON.parse(serializeExport(theirs)))
    expect(conflict.tripChange).toBe("conflict")
    expect(applyImport(mine, conflict, "keep-existing", () => "x").trip).toEqual(mine.trip)
    expect(applyImport(mine, conflict, "keep-both", () => "x").trip).toEqual(mine.trip)
    expect(applyImport(mine, conflict, "keep-existing", () => "x", true).trip).toEqual(theirs.trip)

    // Missing details here can be filled in from the file, again only when chosen.
    const unset = { ...mine, trip: null }
    const add = planImport(unset, JSON.parse(serializeExport(theirs)))
    expect(add.tripChange).toBe("add")
    expect(applyImport(unset, add, "keep-existing", () => "x").trip).toBeNull()
    expect(applyImport(unset, add, "keep-existing", () => "x", true).trip).toEqual(theirs.trip)
  })

  it("counts invalid trip details as skipped instead of rejecting the backup", () => {
    const file = { ...JSON.parse(serializeExport(defaultData())), trip: { name: "", destination: "", start: "x", end: "y" } }
    const parsed = parseAppData(file)
    expect(parsed.data.trip).toBeNull()
    expect(parsed.rejected).toEqual({ groups: 0, listings: 0, activities: 0, trip: 1 })
    expect(parseAppData(legacy(defaultData())).rejected.trip).toBe(0)
  })
})

describe("saved data with entries that cannot be read", () => {
  function savedWithBadEntries() {
    const data = {
      ...withListings(listing("a"), listing("bad", { amount: -1 })),
      activities: [activity("kept", { date: "2030-04-20" }), activity("bad-time", { time: "99:99" })],
    }
    const raw = JSON.stringify(legacy(data))
    localStorage.setItem(STORAGE_KEY, raw)
    return raw
  }

  it("keeps activities outside the trip dates as they are", () => {
    const data = { ...defaultData(), activities: [activity("before", { date: "2030-04-20" }), activity("after", { date: "2031-01-02" })] }
    saveData(data)
    const loaded = loadData()
    expect(loaded).toMatchObject({ status: "ok", recovery: null, rejected: { groups: 0, listings: 0, activities: 0, trip: 0 } })
    expect(loaded.data).toEqual(data)
  })

  it("keeps an untouched copy of the original before anything is saved over it", () => {
    const raw = savedWithBadEntries()
    const loaded = loadData()
    expect(loaded.status).toBe("ok")
    if (loaded.status !== "ok") return
    expect(loaded.rejected).toEqual({ groups: 0, listings: 1, activities: 1, trip: 0 })
    expect(loaded.data.listings.map((l) => l.id)).toEqual(["a"])
    expect(loaded.data.activities.map((a) => a.id)).toEqual(["kept"])
    expect(loaded.recovery).toMatchObject({ kind: "skipped", original: null })
    const key = loaded.recovery!.backupKey!
    expect(key).toMatch(new RegExp(`^${STORAGE_KEY}:skipped:`))
    expect(localStorage.getItem(key)).toBe(raw)
    expect(localStorage.getItem(STORAGE_KEY)).toBe(raw)

    // Loading again before any change reuses the same copy.
    const again = loadData()
    expect(again.status === "ok" && again.recovery?.backupKey).toBe(key)
    expect(Object.keys(localStorage).filter((key) => key.includes(":skipped:"))).toHaveLength(1)
  })

  /** A store holding `raw` that refuses new writes while `full` is set, or drops them silently. */
  function fullStorage(raw: string, mode: "throws" | "drops" = "throws") {
    const items = new Map([[STORAGE_KEY, raw]])
    const state = { full: true }
    const storage = {
      getItem: (key: string) => items.get(key) ?? null,
      setItem: (key: string, value: string) => {
        if (!state.full) items.set(key, value)
        else if (mode === "throws") throw new DOMException("full", "QuotaExceededError")
      },
      key: (i: number) => [...items.keys()][i] ?? null,
      get length() {
        return items.size
      },
    } as unknown as Storage
    return { storage, items, state }
  }

  it("holds the original instead of claiming a copy when none could be stored", () => {
    const raw = savedWithBadEntries()
    for (const mode of ["throws", "drops"] as const) {
      const { storage, items } = fullStorage(raw, mode)
      const loaded = loadData(storage)
      expect(loaded).toMatchObject({
        status: "ok",
        rejected: { listings: 1, activities: 1 },
        recovery: { kind: "skipped", backupKey: null, original: raw },
      })
      expect([...items.keys()]).toEqual([STORAGE_KEY])
    }
  })

  it("holds unreadable data the same way when it cannot be copied", () => {
    const { storage } = fullStorage("{not json")
    const loaded = loadData(storage)
    expect(loaded).toMatchObject({ status: "corrupt", recovery: { kind: "unreadable", backupKey: null, original: "{not json" } })
  })

  it("keeps the copy on a later try once there is room", () => {
    const raw = savedWithBadEntries()
    const { storage, items, state } = fullStorage(raw)
    expect(keepCopy(raw, "skipped", storage)).toBeNull()
    state.full = false
    const key = keepCopy(raw, "skipped", storage)
    expect(key).toMatch(new RegExp(`^${STORAGE_KEY}:skipped:`))
    expect(items.get(key!)).toBe(raw)
    expect(items.get(STORAGE_KEY)).toBe(raw)
  })
})
