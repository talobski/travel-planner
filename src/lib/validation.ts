import { isIsoDate, nightsBetween } from "./dates"
import { isTime, tripLength } from "./itinerary"
import { parseAmount } from "./money"
import {
  CURRENCIES,
  type Activity,
  type Currency,
  type FeeCertainty,
  type Listing,
  type PriceBasis,
  type StayGroup,
  type Trip,
} from "./types"

export const MAX_GUESTS = 30
export const MAX_NIGHTS = 90
export const MAX_TRIP_DAYS = 90
const MAX_AMOUNT = 1e12

/** Returns the URL only if it is an absolute http(s) link; anything else is unsafe to open. */
export function safeHttpUrl(value: string): string | null {
  const trimmed = value.trim()
  if (!trimmed || /[\s\u0000-\u001f\u007f]/.test(trimmed)) return null
  let url: URL
  try {
    url = new URL(trimmed)
  } catch {
    return null
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null
  if (!url.hostname || url.username || url.password) return null
  return url.href
}

export function isCurrency(value: unknown): value is Currency {
  return typeof value === "string" && (CURRENCIES as readonly string[]).includes(value)
}

function isBasis(value: unknown): value is PriceBasis {
  return value === "nightly" || value === "stay"
}

function isCertainty(value: unknown): value is FeeCertainty {
  return value === "confirmed" || value === "estimated" || value === "unknown"
}

export type FieldErrors = Partial<Record<string, string>>

export function validateDates(checkIn: string, checkOut: string): FieldErrors {
  const errors: FieldErrors = {}
  if (!isIsoDate(checkIn)) errors.checkIn = "Enter a valid check-in date."
  if (!isIsoDate(checkOut)) errors.checkOut = "Enter a valid check-out date."
  if (errors.checkIn || errors.checkOut) return errors
  const nights = nightsBetween(checkIn, checkOut)!
  if (nights < 1) errors.checkOut = "Check-out must be at least one night after check-in."
  else if (nights > MAX_NIGHTS) errors.checkOut = `Stays longer than ${MAX_NIGHTS} nights are not supported.`
  return errors
}

export function parseGuests(raw: string): number {
  const trimmed = raw.trim()
  return /^\d+$/.test(trimmed) ? Number(trimmed) : Number.NaN
}

export function validateGuests(guests: number): string | undefined {
  if (!Number.isInteger(guests) || guests < 1) return "Enter at least 1 guest."
  if (guests > MAX_GUESTS) return `Enter ${MAX_GUESTS} guests or fewer.`
  return undefined
}

// Listing form

export interface ListingFormValues {
  groupId: string
  name: string
  area: string
  source: string
  url: string
  checkIn: string
  checkOut: string
  guests: string
  currency: Currency
  amount: string
  basis: PriceBasis
  extraFees: string
  feeCertainty: FeeCertainty
  notes: string
}

/** What the quote form edits. Booking is set from the row menu, not the form. */
export type ListingDraft = Omit<Listing, "id" | "createdAt" | "updatedAt" | "booked">

export function validateListingForm(
  values: ListingFormValues,
  groupIds: ReadonlySet<string>,
): { draft: ListingDraft | null; errors: FieldErrors } {
  const errors: FieldErrors = {}

  if (!groupIds.has(values.groupId)) errors.groupId = "Choose a stay."
  const name = values.name.trim()
  if (!name) errors.name = "Enter a name."
  else if (name.length > 120) errors.name = "Keep the name under 120 characters."

  const url = values.url.trim()
  const safeUrl = url ? safeHttpUrl(url) : ""
  if (safeUrl === null) errors.url = "Use a full http:// or https:// link."

  Object.assign(errors, validateDates(values.checkIn, values.checkOut))

  const guests = parseGuests(values.guests)
  const guestError = validateGuests(guests)
  if (guestError) errors.guests = guestError

  if (!isCurrency(values.currency)) errors.currency = "Choose a currency."

  const amount = parseAmount(values.amount)
  if (!Number.isFinite(amount) || amount <= 0) errors.amount = "Enter a price above 0."
  else if (amount > MAX_AMOUNT) errors.amount = "That amount is too large."

  const extraFees = values.extraFees.trim() === "" ? 0 : parseAmount(values.extraFees)
  if (!Number.isFinite(extraFees) || extraFees < 0) errors.extraFees = "Enter 0 or a positive amount."
  else if (extraFees > MAX_AMOUNT) errors.extraFees = "That amount is too large."

  if (!isBasis(values.basis)) errors.basis = "Choose how the price is shown."
  if (!isCertainty(values.feeCertainty)) errors.feeCertainty = "Choose a fee status."

  if (Object.keys(errors).length > 0) return { draft: null, errors }

  return {
    draft: {
      groupId: values.groupId,
      name,
      area: values.area.trim(),
      source: values.source.trim() || "Other",
      url: safeUrl ?? "",
      checkIn: values.checkIn,
      checkOut: values.checkOut,
      guests,
      currency: values.currency,
      amount,
      basis: values.basis,
      extraFees,
      feeCertainty: values.feeCertainty,
      notes: values.notes.trim(),
    },
    errors,
  }
}

// Activity form

export interface ActivityFormValues {
  date: string
  name: string
  time: string
  location: string
  url: string
  notes: string
}

export type ActivityDraft = Omit<Activity, "id" | "createdAt" | "updatedAt">

export function validateActivityForm(values: ActivityFormValues): { draft: ActivityDraft | null; errors: FieldErrors } {
  const errors: FieldErrors = {}

  const name = values.name.trim()
  if (!name) errors.name = "Enter a name."
  else if (name.length > 120) errors.name = "Keep the name under 120 characters."

  if (!isIsoDate(values.date)) errors.date = "Choose a day."
  if (values.time !== "" && !isTime(values.time)) errors.time = "Enter a time, or leave it empty."

  const url = values.url.trim()
  const safeUrl = url ? safeHttpUrl(url) : ""
  if (safeUrl === null) errors.url = "Use a full http:// or https:// link."

  if (values.location.trim().length > 120) errors.location = "Keep the location under 120 characters."

  if (Object.keys(errors).length > 0) return { draft: null, errors }

  return {
    draft: {
      date: values.date,
      name,
      time: values.time,
      location: values.location.trim(),
      url: safeUrl ?? "",
      notes: values.notes.trim(),
    },
    errors,
  }
}

// Trip form

export interface TripFormValues {
  name: string
  destination: string
  start: string
  end: string
}

export function validateTripForm(values: TripFormValues): { trip: Trip | null; errors: FieldErrors } {
  const errors: FieldErrors = {}

  const name = values.name.trim()
  if (!name) errors.name = "Enter a name."
  else if (name.length > 80) errors.name = "Keep the name under 80 characters."

  const destination = values.destination.trim()
  if (destination.length > 80) errors.destination = "Keep the destination under 80 characters."

  if (!isIsoDate(values.start)) errors.start = "Enter a valid start date."
  if (!isIsoDate(values.end)) errors.end = "Enter a valid end date."
  if (!errors.start && !errors.end) {
    if (values.end < values.start) errors.end = "The trip must end on or after its first day."
    else if (tripLength(values) > MAX_TRIP_DAYS) errors.end = `Trips longer than ${MAX_TRIP_DAYS} days are not supported.`
  }

  if (Object.keys(errors).length > 0) return { trip: null, errors }
  return { trip: { name, destination, start: values.start, end: values.end }, errors }
}

// Stored and imported records

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function isNonEmptyString(value: unknown, max = 200): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= max
}

function isString(value: unknown, max: number): value is string {
  return typeof value === "string" && value.length <= max
}

function isAmount(value: unknown, allowZero: boolean): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value <= MAX_AMOUNT &&
    (allowZero ? value >= 0 : value > 0)
  )
}

function hasValidStay(checkIn: unknown, checkOut: unknown, guests: unknown) {
  return (
    typeof checkIn === "string" &&
    typeof checkOut === "string" &&
    Object.keys(validateDates(checkIn, checkOut)).length === 0 &&
    typeof guests === "number" &&
    validateGuests(guests) === undefined
  )
}

export function parseStayGroup(value: unknown): StayGroup | null {
  if (!isRecord(value)) return null
  const { id, area, checkIn, checkOut, guests } = value
  if (!isNonEmptyString(id, 100) || !isNonEmptyString(area, 80)) return null
  if (!hasValidStay(checkIn, checkOut, guests)) return null
  return {
    id,
    area: area.trim(),
    checkIn: checkIn as string,
    checkOut: checkOut as string,
    guests: guests as number,
  }
}

export function parseListing(value: unknown): Listing | null {
  if (!isRecord(value)) return null
  const v = value
  if (!isNonEmptyString(v.id, 100) || !isNonEmptyString(v.groupId, 100)) return null
  if (!isNonEmptyString(v.name, 120)) return null
  if (!isString(v.area, 120) || !isString(v.source, 60) || !isString(v.notes, 4000)) return null
  if (!isString(v.url, 2000)) return null
  const url = v.url.trim() === "" ? "" : safeHttpUrl(v.url)
  if (url === null) return null
  if (!hasValidStay(v.checkIn, v.checkOut, v.guests)) return null
  if (!isCurrency(v.currency) || !isBasis(v.basis) || !isCertainty(v.feeCertainty)) return null
  if (!isAmount(v.amount, false) || !isAmount(v.extraFees, true)) return null
  if (!isString(v.createdAt, 40) || !isString(v.updatedAt, 40)) return null
  if (v.booked !== undefined && typeof v.booked !== "boolean") return null
  return {
    id: v.id,
    groupId: v.groupId,
    name: v.name.trim(),
    area: v.area,
    source: v.source,
    url,
    checkIn: v.checkIn as string,
    checkOut: v.checkOut as string,
    guests: v.guests as number,
    currency: v.currency,
    amount: v.amount,
    basis: v.basis,
    extraFees: v.extraFees,
    feeCertainty: v.feeCertainty,
    notes: v.notes,
    booked: v.booked === true,
    createdAt: v.createdAt,
    updatedAt: v.updatedAt,
  }
}

export function parseActivity(value: unknown): Activity | null {
  if (!isRecord(value)) return null
  const v = value
  if (!isNonEmptyString(v.id, 100) || !isNonEmptyString(v.name, 120)) return null
  // Any real date: activities outside the current trip dates are kept, not rejected.
  if (!isIsoDate(v.date) || !(v.time === "" || isTime(v.time))) return null
  if (!isString(v.location, 120) || !isString(v.notes, 4000) || !isString(v.url, 2000)) return null
  const url = v.url.trim() === "" ? "" : safeHttpUrl(v.url)
  if (url === null) return null
  if (!isString(v.createdAt, 40) || !isString(v.updatedAt, 40)) return null
  return {
    id: v.id,
    date: v.date,
    name: v.name.trim(),
    time: v.time as string,
    location: v.location,
    url,
    notes: v.notes,
    createdAt: v.createdAt,
    updatedAt: v.updatedAt,
  }
}

export function parseTrip(value: unknown): Trip | null {
  if (!isRecord(value)) return null
  const { name, destination, start, end } = value
  if (typeof name !== "string" || typeof destination !== "string") return null
  if (typeof start !== "string" || typeof end !== "string") return null
  return validateTripForm({ name, destination, start, end }).trip
}
