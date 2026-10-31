import { useCallback, useEffect, useState } from "react"
import {
  applyImport,
  keepCopy,
  loadData,
  saveData,
  type ConflictPolicy,
  type ImportPlan,
  type LoadResult,
  type Recovery,
} from "@/lib/storage"
import { moveWithinDay, placeActivity } from "@/lib/itinerary"
import { moveAmong } from "@/lib/order"
import { quoteSection } from "@/lib/pricing"
import type { Activity, AppData, ComparisonSettings, Listing, StayGroup, Trip } from "@/lib/types"
import type { ActivityDraft, ListingDraft } from "@/lib/validation"

export function newId() {
  return globalThis.crypto?.randomUUID?.() ?? `id-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

export type AppStore = ReturnType<typeof useAppData>

export function useAppData() {
  const [initial] = useState<LoadResult>(() => loadData())
  const [data, setData] = useState<AppData>(initial.data)
  const [saveError, setSaveError] = useState(false)
  const [recovery, setRecovery] = useState<Recovery | null>(initial.status === "empty" ? null : initial.recovery)
  // Saved data that was not read in full and could not be copied. Saving it over would lose it for good.
  const savingHeld = recovery?.original != null

  useEffect(() => {
    // Nothing is written until the user changes something, so saved data stays untouched on load. While the
    // original is held, nothing is written at all.
    if (data === initial.data || savingHeld) return
    try {
      saveData(data)
      setSaveError(false)
    } catch {
      setSaveError(true)
    }
  }, [data, initial.data, savingHeld])

  /** Tries again to copy the held original. Saving resumes once the copy is kept. */
  const retryRecoveryCopy = useCallback(() => {
    if (!recovery?.original) return true
    const backupKey = keepCopy(recovery.original, recovery.kind)
    if (backupKey) setRecovery({ ...recovery, backupKey, original: null })
    return backupKey !== null
  }, [recovery])

  /** The user chose to give up the held original: what was read is saved over it, and saving resumes. */
  const discardOriginal = useCallback(() => {
    setRecovery(null)
    // A new object, so the save runs even when nothing else has changed.
    setData((current) => ({ ...current }))
  }, [])

  const addListing = useCallback((draft: ListingDraft) => {
    const now = new Date().toISOString()
    const listing: Listing = { ...draft, booked: false, id: newId(), createdAt: now, updatedAt: now }
    setData((current) => ({ ...current, listings: [...current.listings, listing] }))
    return listing
  }, [])

  /** Edits keep the quote's place. One that moves it to another stay, currency, or dates list puts it last there. */
  const updateListing = useCallback((id: string, draft: ListingDraft) => {
    const now = new Date().toISOString()
    setData((current) => {
      const existing = current.listings.find((listing) => listing.id === id)
      if (!existing) return current
      const next = { ...existing, ...draft, updatedAt: now }
      const moved = quoteSection(existing, current.groups) !== quoteSection(next, current.groups)
      const listings = moved
        ? [...current.listings.filter((listing) => listing.id !== id), next]
        : current.listings.map((listing) => (listing.id === id ? next : listing))
      return { ...current, listings }
    })
  }, [])

  /** Moves a quote to `index` among `sectionIds`, the quotes listed with it. Every other quote keeps its place. */
  const moveListing = useCallback((id: string, index: number, sectionIds: readonly string[]) => {
    const members = new Set(sectionIds)
    setData((current) => ({
      ...current,
      listings: moveAmong(current.listings, (listing) => members.has(listing.id), id, index),
    }))
  }, [])

  /**
   * Marks a listing booked or not. Leaves `updatedAt` alone: booking is not a quote edit, and an unchanged
   * timestamp lets an older backup of the same quote still match it on import.
   */
  const setListingBooked = useCallback((id: string, booked: boolean) => {
    setData((current) => ({
      ...current,
      listings: current.listings.map((listing) => (listing.id === id ? { ...listing, booked } : listing)),
    }))
  }, [])

  /** Removes a listing and returns a function that puts it back in its original position. */
  const deleteListing = useCallback((id: string) => {
    let removed: { listing: Listing; index: number } | null = null
    setData((current) => {
      const index = current.listings.findIndex((listing) => listing.id === id)
      if (index === -1) return current
      removed = { listing: current.listings[index], index }
      return { ...current, listings: current.listings.filter((listing) => listing.id !== id) }
    })
    return () => {
      setData((current) => {
        if (!removed || current.listings.some((listing) => listing.id === removed!.listing.id)) return current
        const listings = [...current.listings]
        listings.splice(Math.min(removed.index, listings.length), 0, removed.listing)
        return { ...current, listings }
      })
    }
  }, [])

  const saveGroup = useCallback((group: Omit<StayGroup, "id"> & { id?: string }) => {
    const id = group.id ?? newId()
    setData((current) => {
      const exists = current.groups.some((item) => item.id === id)
      const next = { ...group, id }
      return {
        ...current,
        groups: exists
          ? current.groups.map((item) => (item.id === id ? next : item))
          : [...current.groups, next],
      }
    })
    return id
  }, [])

  const deleteGroup = useCallback((id: string) => {
    setData((current) => {
      if (current.listings.some((listing) => listing.groupId === id)) return current
      return { ...current, groups: current.groups.filter((group) => group.id !== id) }
    })
  }, [])

  /** Moves a stay to `index` in the tab order, which is the saved order of `groups`. */
  const moveGroup = useCallback((id: string, index: number) => {
    setData((current) => {
      const from = current.groups.findIndex((group) => group.id === id)
      const to = Math.max(0, Math.min(index, current.groups.length - 1))
      if (from === -1 || from === to) return current
      const groups = [...current.groups]
      groups.splice(to, 0, ...groups.splice(from, 1))
      return { ...current, groups }
    })
  }, [])

  const addActivity = useCallback((draft: ActivityDraft) => {
    const now = new Date().toISOString()
    const activity: Activity = { ...draft, id: newId(), createdAt: now, updatedAt: now }
    setData((current) => ({ ...current, activities: placeActivity(current.activities, activity) }))
    return activity
  }, [])

  /** A new day or time places the activity again; other edits keep its position. */
  const updateActivity = useCallback((id: string, draft: ActivityDraft) => {
    const now = new Date().toISOString()
    setData((current) => {
      const existing = current.activities.find((activity) => activity.id === id)
      if (!existing) return current
      const next = { ...existing, ...draft, updatedAt: now }
      const activities =
        existing.date !== next.date || existing.time !== next.time
          ? placeActivity(current.activities, next)
          : current.activities.map((activity) => (activity.id === id ? next : activity))
      return { ...current, activities }
    })
  }, [])

  /** Removes an activity and returns a function that puts it back in its original position. */
  const deleteActivity = useCallback((id: string) => {
    let removed: { activity: Activity; index: number } | null = null
    setData((current) => {
      const index = current.activities.findIndex((activity) => activity.id === id)
      if (index === -1) return current
      removed = { activity: current.activities[index], index }
      return { ...current, activities: current.activities.filter((activity) => activity.id !== id) }
    })
    return () => {
      setData((current) => {
        if (!removed || current.activities.some((activity) => activity.id === removed!.activity.id)) return current
        const activities = [...current.activities]
        activities.splice(Math.min(removed.index, activities.length), 0, removed.activity)
        return { ...current, activities }
      })
    }
  }, [])

  /** Moves an activity to `index` among the activities on its day. */
  const moveActivity = useCallback((id: string, index: number) => {
    setData((current) => ({ ...current, activities: moveWithinDay(current.activities, id, index) }))
  }, [])

  const setComparison = useCallback((comparison: ComparisonSettings) => {
    setData((current) => ({ ...current, comparison }))
  }, [])

  /** Changes only the trip details. Stays and activities keep their own dates, inside the trip or not. */
  const saveTrip = useCallback((trip: Trip) => {
    setData((current) => ({ ...current, trip }))
  }, [])

  const importData = useCallback((plan: ImportPlan, policy: ConflictPolicy, useFileTrip: boolean) => {
    setData((current) => applyImport(current, plan, policy, newId, useFileTrip))
  }, [])

  return {
    data,
    loadStatus: initial,
    recovery,
    savingHeld,
    retryRecoveryCopy,
    discardOriginal,
    saveError,
    addListing,
    updateListing,
    moveListing,
    setListingBooked,
    deleteListing,
    saveGroup,
    deleteGroup,
    moveGroup,
    addActivity,
    updateActivity,
    deleteActivity,
    moveActivity,
    setComparison,
    saveTrip,
    importData,
  }
}
