import { getRate, isValidRate, legacyQuoteOrder } from "./pricing"
import type { Activity, AppData, ComparisonSettings, Listing, StayGroup, Trip } from "./types"
import { isCurrency, parseActivity, parseListing, parseStayGroup, parseTrip } from "./validation"

export const STORAGE_KEY = "japan-stay-compare:v1"
export const EXPORT_FORMAT = "japan-stay-compare"

// A sample trip for a fresh start, edited or replaced by the user. Saved data never gets these filled in.
export const SAMPLE_TRIP: Trip = { name: "Sample trip", destination: "Example City", start: "2030-05-01", end: "2030-05-14" }

export const DEFAULT_GROUPS: StayGroup[] = [
  { id: "sample-old-town-1", area: "Old Town", checkIn: "2030-05-05", checkOut: "2030-05-08", guests: 2 },
  { id: "sample-lakeside", area: "Lakeside", checkIn: "2030-05-08", checkOut: "2030-05-10", guests: 4 },
  { id: "sample-old-town-2", area: "Old Town", checkIn: "2030-05-10", checkOut: "2030-05-14", guests: 4 },
]

export function defaultData(): AppData {
  return {
    version: 1,
    groups: DEFAULT_GROUPS.map((group) => ({ ...group })),
    listings: [],
    comparison: { target: null, rates: {} },
    activities: [],
    quoteOrder: "manual",
    trip: { ...SAMPLE_TRIP },
  }
}

function parseComparison(value: unknown): ComparisonSettings {
  const settings: ComparisonSettings = { target: null, rates: {} }
  if (typeof value !== "object" || value === null) return settings
  const raw = value as Record<string, unknown>
  if (isCurrency(raw.target)) settings.target = raw.target
  if (typeof raw.rates === "object" && raw.rates !== null) {
    for (const [key, rate] of Object.entries(raw.rates)) {
      const [from, to] = key.split(":")
      if (isCurrency(from) && isCurrency(to) && from !== to && isValidRate(rate)) {
        settings.rates[key] = rate
      }
    }
  }
  return settings
}

/** Records that failed validation and were left out. `trip` is 1 when trip details were present but invalid. */
export interface RejectedCounts {
  groups: number
  listings: number
  activities: number
  trip: number
}

export function totalRejected(rejected: RejectedCounts) {
  return rejected.groups + rejected.listings + rejected.activities + rejected.trip
}

export interface ParsedData {
  data: AppData
  rejected: RejectedCounts
  /** Listings saved before booking existed, so their booking status is unknown rather than "not booked". */
  bookingUnknown: ReadonlySet<string>
}

/** Validate a stored or exported payload. Throws when it is not this app's data at all. */
export function parseAppData(value: unknown): ParsedData {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("This file is not a Travel Planner backup.")
  }
  const raw = value as Record<string, unknown>
  if (raw.version !== 1 || !Array.isArray(raw.groups) || !Array.isArray(raw.listings)) {
    throw new Error("This file is not a Travel Planner backup.")
  }

  const groups: StayGroup[] = []
  const groupIds = new Set<string>()
  let rejectedGroups = 0
  for (const item of raw.groups) {
    const group = parseStayGroup(item)
    if (group && !groupIds.has(group.id)) {
      groups.push(group)
      groupIds.add(group.id)
    } else rejectedGroups++
  }

  const listings: Listing[] = []
  const listingIds = new Set<string>()
  const bookingUnknown = new Set<string>()
  let rejectedListings = 0
  for (const item of raw.listings) {
    const listing = parseListing(item)
    if (listing && groupIds.has(listing.groupId) && !listingIds.has(listing.id)) {
      listings.push(listing)
      listingIds.add(listing.id)
      if (!Object.hasOwn(item as object, "booked")) bookingUnknown.add(listing.id)
    } else rejectedListings++
  }

  // Saves and backups from before the itinerary have no activities.
  const activities: Activity[] = []
  const activityIds = new Set<string>()
  let rejectedActivities = 0
  for (const item of Array.isArray(raw.activities) ? raw.activities : []) {
    const activity = parseActivity(item)
    if (activity && !activityIds.has(activity.id)) {
      activities.push(activity)
      activityIds.add(activity.id)
    } else rejectedActivities++
  }

  // Saves and backups from before trip details have none; that is not an error.
  const hasTrip = raw.trip !== undefined && raw.trip !== null
  const trip = hasTrip ? parseTrip(raw.trip) : null

  const comparison = parseComparison(raw.comparison)
  return {
    data: {
      version: 1,
      groups,
      listings: raw.quoteOrder === "manual" ? listings : legacyQuoteOrder(groups, listings, comparison),
      comparison,
      activities,
      quoteOrder: "manual",
      trip,
    },
    rejected: {
      groups: rejectedGroups,
      listings: rejectedListings,
      activities: rejectedActivities,
      trip: hasTrip && trip === null ? 1 : 0,
    },
    bookingUnknown,
  }
}

/** "skipped": some entries were left out. "unreadable": none of the saved data could be read. */
export type RecoveryKind = "skipped" | "unreadable"

/**
 * Whenever saved data is not read in full, the next save would write only what was read, so the original is
 * copied first. `backupKey` names that copy. When the copy cannot be stored, `backupKey` is null and `original`
 * holds the saved text: saving must then wait until a copy is kept or the user chooses to discard it.
 */
export interface Recovery {
  kind: RecoveryKind
  backupKey: string | null
  original: string | null
}

export type LoadResult =
  | { status: "empty"; data: AppData }
  /** `recovery` is null when everything was read. */
  | { status: "ok"; data: AppData; rejected: RejectedCounts; recovery: Recovery | null }
  | { status: "corrupt"; data: AppData; recovery: Recovery }

/** Stores `raw` under a new recovery key, or returns the key already holding the same copy. Null when it cannot. */
export function keepCopy(
  raw: string,
  kind: RecoveryKind,
  storage: Storage | undefined = globalThis.localStorage,
): string | null {
  const prefix = `${STORAGE_KEY}:${kind}:`
  try {
    if (!storage) return null
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i)
      if (key?.startsWith(prefix) && storage.getItem(key) === raw) return key
    }
    const key = `${prefix}${Date.now()}`
    storage.setItem(key, raw)
    // A full store can drop the write without throwing in some browsers; only a copy that reads back counts.
    return storage.getItem(key) === raw ? key : null
  } catch {
    return null
  }
}

function recover(raw: string, kind: RecoveryKind, storage: Storage | undefined): Recovery {
  const backupKey = keepCopy(raw, kind, storage)
  return { kind, backupKey, original: backupKey ? null : raw }
}

export function loadData(storage: Storage | undefined = globalThis.localStorage): LoadResult {
  let raw: string | null = null
  try {
    raw = storage?.getItem(STORAGE_KEY) ?? null
  } catch {
    return { status: "empty", data: defaultData() }
  }
  if (raw === null) return { status: "empty", data: defaultData() }
  try {
    const { data, rejected } = parseAppData(JSON.parse(raw))
    if (data.groups.length === 0) data.groups = defaultData().groups
    const recovery = totalRejected(rejected) > 0 ? recover(raw, "skipped", storage) : null
    return { status: "ok", data, rejected, recovery }
  } catch {
    // Keep the unreadable copy so nothing is lost when the app saves again.
    return { status: "corrupt", data: defaultData(), recovery: recover(raw, "unreadable", storage) }
  }
}

export function saveData(data: AppData, storage: Storage | undefined = globalThis.localStorage) {
  storage?.setItem(STORAGE_KEY, JSON.stringify(data))
}

export function serializeExport(data: AppData, now = new Date()) {
  return JSON.stringify({ format: EXPORT_FORMAT, exportedAt: now.toISOString(), ...data }, null, 2)
}

// Import merge

export type ConflictPolicy = "keep-existing" | "keep-both"

/**
 * How the file's trip details compare with the current ones. "add": only the file has them. "conflict": both have
 * them and they differ. Either way the user chooses; an import never changes the trip on its own.
 */
export type TripChange = "none" | "add" | "conflict"

export interface ImportPlan {
  incoming: AppData
  rejected: RejectedCounts
  bookingUnknown: ReadonlySet<string>
  newGroups: number
  newListings: number
  identicalListings: number
  /** Same id as an existing record but different contents. */
  conflictingListings: number
  conflictingGroups: number
  newActivities: number
  identicalActivities: number
  conflictingActivities: number
  tripChange: TripChange
}

function sameRecord<T extends object>(a: T, b: T) {
  return JSON.stringify(a, Object.keys(a).sort()) === JSON.stringify(b, Object.keys(b).sort())
}

/**
 * A listing from a backup made before booking existed says nothing about booking, so it matches the current
 * listing whatever its booking status. That keeps an older backup from turning a booked quote into a conflict.
 */
function sameListing(existing: Listing, incoming: Listing, bookingUnknown: ReadonlySet<string>) {
  return sameRecord(existing, bookingUnknown.has(incoming.id) ? { ...incoming, booked: existing.booked } : incoming)
}

export function planImport(current: AppData, value: unknown): ImportPlan {
  const { data: incoming, rejected, bookingUnknown } = parseAppData(value)
  const groupsById = new Map(current.groups.map((group) => [group.id, group]))
  const listingsById = new Map(current.listings.map((listing) => [listing.id, listing]))

  let newGroups = 0
  let conflictingGroups = 0
  for (const group of incoming.groups) {
    const existing = groupsById.get(group.id)
    if (!existing) newGroups++
    else if (!sameRecord(existing, group)) conflictingGroups++
  }

  let newListings = 0
  let identicalListings = 0
  let conflictingListings = 0
  for (const listing of incoming.listings) {
    const existing = listingsById.get(listing.id)
    if (!existing) newListings++
    else if (sameListing(existing, listing, bookingUnknown)) identicalListings++
    else conflictingListings++
  }

  const activitiesById = new Map(current.activities.map((activity) => [activity.id, activity]))
  let newActivities = 0
  let identicalActivities = 0
  let conflictingActivities = 0
  for (const activity of incoming.activities) {
    const existing = activitiesById.get(activity.id)
    if (!existing) newActivities++
    else if (sameRecord(existing, activity)) identicalActivities++
    else conflictingActivities++
  }

  let tripChange: TripChange = "none"
  if (incoming.trip && !current.trip) tripChange = "add"
  else if (incoming.trip && current.trip && !sameRecord(current.trip, incoming.trip)) tripChange = "conflict"

  return {
    incoming,
    rejected,
    bookingUnknown,
    newGroups,
    newListings,
    identicalListings,
    conflictingListings,
    conflictingGroups,
    newActivities,
    identicalActivities,
    conflictingActivities,
    tripChange,
  }
}

/**
 * Merge an import into current data without overwriting anything.
 * New records are added and identical ones skipped. For records whose id
 * already exists with different contents, "keep-existing" skips the imported
 * copy and "keep-both" adds it under a new id. The trip details change only
 * when `useFileTrip` is set and the file has them.
 */
export function applyImport(
  current: AppData,
  plan: ImportPlan,
  policy: ConflictPolicy,
  makeId: () => string,
  useFileTrip = false,
): AppData {
  const groups = [...current.groups]
  const listings = [...current.listings]
  const groupsById = new Map(groups.map((group) => [group.id, group]))
  const listingsById = new Map(listings.map((listing) => [listing.id, listing]))
  const groupIdMap = new Map<string, string>()

  for (const group of plan.incoming.groups) {
    const existing = groupsById.get(group.id)
    if (!existing) {
      groups.push(group)
      groupIdMap.set(group.id, group.id)
    } else if (sameRecord(existing, group) || policy === "keep-existing") {
      groupIdMap.set(group.id, group.id)
    } else {
      const copy = { ...group, id: makeId() }
      groups.push(copy)
      groupIdMap.set(group.id, copy.id)
    }
  }

  // Imported quotes follow the existing ones in each list, so an established order is never reshuffled.
  for (const listing of plan.incoming.listings) {
    const groupId = groupIdMap.get(listing.groupId) ?? listing.groupId
    const existing = listingsById.get(listing.id)
    if (!existing) {
      listings.push({ ...listing, groupId })
    } else if (sameListing(existing, listing, plan.bookingUnknown) || policy === "keep-existing") {
      continue
    } else {
      listings.push({ ...listing, id: makeId(), groupId })
    }
  }

  // Imported activities follow the existing ones, in the file's order within each day.
  const activities = [...current.activities]
  const activitiesById = new Map(activities.map((activity) => [activity.id, activity]))
  for (const activity of plan.incoming.activities) {
    const existing = activitiesById.get(activity.id)
    if (!existing) activities.push(activity)
    else if (sameRecord(existing, activity) || policy === "keep-existing") continue
    else activities.push({ ...activity, id: makeId() })
  }

  // Bring over manual rates the current data does not have yet.
  const comparison: ComparisonSettings = { ...current.comparison, rates: { ...current.comparison.rates } }
  for (const [key, rate] of Object.entries(plan.incoming.comparison.rates)) {
    const [from, to] = key.split(":")
    if (
      isCurrency(from) &&
      isCurrency(to) &&
      getRate(current.comparison, from, to) === null &&
      isValidRate(rate)
    ) {
      comparison.rates[key] = rate
    }
  }

  const trip = useFileTrip && plan.incoming.trip ? plan.incoming.trip : current.trip
  return { ...current, groups, listings, comparison, activities, trip }
}
