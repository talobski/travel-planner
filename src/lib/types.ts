export const CURRENCIES = ["JPY", "PHP", "USD"] as const
export type Currency = (typeof CURRENCIES)[number]

/** How the source displays the amount. */
export type PriceBasis = "nightly" | "stay"

/**
 * confirmed: the total including every fee has been seen (for example the
 *   final Airbnb checkout total).
 * estimated: extra fees were entered but are a guess.
 * unknown: fees may exist that are not entered yet.
 */
export type FeeCertainty = "confirmed" | "estimated" | "unknown"

export const SOURCES = [
  "Airbnb",
  "Google Maps",
  "Booking.com",
  "Agoda",
  "Trip.com",
  "Rakuten Travel",
  "Direct",
  "Other",
] as const

export interface StayGroup {
  id: string
  area: string
  checkIn: string
  checkOut: string
  guests: number
}

export interface Listing {
  id: string
  groupId: string
  name: string
  area: string
  source: string
  url: string
  checkIn: string
  checkOut: string
  guests: number
  currency: Currency
  amount: number
  basis: PriceBasis
  /** One-time amount for the whole stay, not already included in `amount`. */
  extraFees: number
  feeCertainty: FeeCertainty
  notes: string
  /** Reserved by the user. Separate from `feeCertainty`, which is about the price. Older data has none. */
  booked: boolean
  createdAt: string
  updatedAt: string
}

/** Manual rates: how many units of `target` one unit of each other currency buys. */
export interface ComparisonSettings {
  target: Currency | null
  rates: Partial<Record<string, number>>
}

/** The trip being planned. Dates are inclusive: `end` is the last day, not a check-out. */
export interface Trip {
  name: string
  /** Optional, "" when not given. */
  destination: string
  /** YYYY-MM-DD. */
  start: string
  /** YYYY-MM-DD, on or after `start`. */
  end: string
}

/** One plan on one trip day. Activities keep the order the user gives them within a day. */
export interface Activity {
  id: string
  /** YYYY-MM-DD. Usually a trip day, but kept as is when the trip dates change. */
  date: string
  name: string
  /** 24-hour "HH:MM", or "" when the time is flexible. */
  time: string
  location: string
  url: string
  notes: string
  createdAt: string
  updatedAt: string
}

export interface AppData {
  version: 1
  groups: StayGroup[]
  listings: Listing[]
  comparison: ComparisonSettings
  /** Added after the first release; older saves and backups have none. */
  activities: Activity[]
  /**
   * The order of `listings` is the user's own order of quotes. Saves and backups from before that have no
   * marker; their quotes are put in the order the app showed them, once.
   */
  quoteOrder: "manual"
  /**
   * Added after the itinerary. Older saves and backups have none, and their trip dates cannot be worked out from
   * the stays and activities, so this stays null until the user confirms them.
   */
  trip: Trip | null
}
