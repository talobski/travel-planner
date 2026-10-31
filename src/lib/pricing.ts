import { nightsBetween } from "./dates"
import type {
  ComparisonSettings,
  Currency,
  FeeCertainty,
  Listing,
  PriceBasis,
  StayGroup,
} from "./types"

export interface PriceInput {
  checkIn: string
  checkOut: string
  amount: number
  basis: PriceBasis
  extraFees: number
}

export interface Quote {
  nights: number
  /** amount × nights for nightly quotes, or the amount itself for stay quotes. */
  baseTotal: number
  extraFees: number
  stayTotal: number
  /** stayTotal ÷ nights, never rounded before the total is computed. */
  effectiveNightly: number
}

/** Normalize a quote to a full-stay total and effective nightly rate. Null if inputs are unusable. */
export function computeQuote(input: PriceInput): Quote | null {
  const nights = nightsBetween(input.checkIn, input.checkOut)
  if (nights === null || nights < 1) return null
  if (!Number.isFinite(input.amount) || input.amount <= 0) return null
  if (!Number.isFinite(input.extraFees) || input.extraFees < 0) return null

  const baseTotal = input.basis === "nightly" ? input.amount * nights : input.amount
  const stayTotal = baseTotal + input.extraFees
  return {
    nights,
    baseTotal,
    extraFees: input.extraFees,
    stayTotal,
    effectiveNightly: stayTotal / nights,
  }
}

/**
 * All-in stay total ÷ nights ÷ guests, from unrounded values. Prices are for the
 * whole place, so this is an even split, not a per-person rate from the host.
 * Null when the guest count is not a positive whole number.
 */
export function perPersonNightly(stayTotal: number, nights: number, guests: number): number | null {
  if (!Number.isInteger(guests) || guests < 1) return null
  return stayTotal / nights / guests
}

export function isConfirmed(certainty: FeeCertainty) {
  return certainty === "confirmed"
}

// Rates

function rateKey(from: Currency, to: Currency) {
  return `${from}:${to}`
}

export function isValidRate(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0
}

/** Units of `to` per one unit of `from`, from a manually entered rate. Null if none is set. */
export function getRate(settings: ComparisonSettings, from: Currency, to: Currency): number | null {
  if (from === to) return 1
  const rate = settings.rates[rateKey(from, to)]
  return isValidRate(rate) ? rate : null
}

export function setRate(
  settings: ComparisonSettings,
  from: Currency,
  to: Currency,
  value: number | null,
): ComparisonSettings {
  const rates = { ...settings.rates }
  const key = rateKey(from, to)
  if (value === null) delete rates[key]
  else rates[key] = value
  return { ...settings, rates }
}

// Comparison

export interface ComparisonRow {
  listing: Listing
  quote: Quote
  /** Currency the row is displayed and ranked in. */
  currency: Currency
  total: number
  nightly: number
  /** Split by the quote's own guest count, even when it differs from the stay's. */
  perPerson: number
  /** True when total/nightly/perPerson were converted with a manual rate. */
  converted: boolean
  datesDiffer: boolean
  guestsDiffer: boolean
}

export type LowestKind = "lowest" | "lowest-confirmed"

export interface ComparisonSection {
  currency: Currency
  converted: boolean
  rows: ComparisonRow[]
  lowest: { id: string; kind: LowestKind } | null
}

export interface GroupComparison {
  sections: ComparisonSection[]
  /** Quotes for other dates or guest counts. Shown, never ranked against the stay. */
  mismatched: ComparisonRow[]
  /** Currencies in this stay that need a manual rate to join the converted ranking. */
  missingRates: Currency[]
  /** Listings whose stored values cannot produce a quote. */
  invalid: Listing[]
  currencies: Currency[]
}

const EPSILON = 1e-9

function cheaper(a: number, b: number) {
  return a < b - EPSILON * Math.max(1, Math.abs(b))
}

/** Name, then id: a fixed tiebreak that does not depend on where the user has placed a quote. */
function byName(a: ComparisonRow, b: ComparisonRow) {
  return a.listing.name.localeCompare(b.listing.name) || (a.listing.id < b.listing.id ? -1 : a.listing.id > b.listing.id ? 1 : 0)
}

/** The order the app used before quotes could be reordered by hand. */
function cheapestFirst(a: ComparisonRow, b: ComparisonRow) {
  if (cheaper(a.total, b.total)) return -1
  if (cheaper(b.total, a.total)) return 1
  // Equal totals: confirmed prices first, then name.
  const confirmed = Number(isConfirmed(b.listing.feeCertainty)) - Number(isConfirmed(a.listing.feeCertainty))
  return confirmed || byName(a, b)
}

/**
 * Only a confirmed all-in price can be called the lowest, and only when there
 * is something to compare it with. If an unconfirmed
 * quote currently looks cheaper, the confirmed one is labeled "lowest
 * confirmed" instead. The row order plays no part, so moving quotes never moves the label.
 */
export function findLowest(rows: ComparisonRow[]): ComparisonSection["lowest"] {
  const confirmed = rows.filter((row) => isConfirmed(row.listing.feeCertainty))
  if (confirmed.length === 0) return null
  const best = confirmed.reduce((min, row) => (cheapestFirst(row, min) < 0 ? row : min))
  const undercut = rows.some(
    (row) => !isConfirmed(row.listing.feeCertainty) && cheaper(row.total, best.total),
  )
  return { id: best.listing.id, kind: undercut ? "lowest-confirmed" : "lowest" }
}

export function buildComparison(
  group: StayGroup,
  listings: Listing[],
  settings: ComparisonSettings,
): GroupComparison {
  const comparable: ComparisonRow[] = []
  const mismatched: ComparisonRow[] = []
  const invalid: Listing[] = []
  const currencies = new Set<Currency>()

  for (const listing of listings) {
    if (listing.groupId !== group.id) continue
    const quote = computeQuote(listing)
    const perPerson = quote ? perPersonNightly(quote.stayTotal, quote.nights, listing.guests) : null
    if (!quote || perPerson === null) {
      invalid.push(listing)
      continue
    }
    const datesDiffer = listing.checkIn !== group.checkIn || listing.checkOut !== group.checkOut
    const guestsDiffer = listing.guests !== group.guests
    const row: ComparisonRow = {
      listing,
      quote,
      currency: listing.currency,
      total: quote.stayTotal,
      nightly: quote.effectiveNightly,
      perPerson,
      converted: false,
      datesDiffer,
      guestsDiffer,
    }
    if (datesDiffer || guestsDiffer) mismatched.push(row)
    else {
      comparable.push(row)
      currencies.add(listing.currency)
    }
  }

  const missingRates = new Set<Currency>()
  const byCurrency = new Map<Currency, ComparisonRow[]>()
  const convertedRows: ComparisonRow[] = []
  const target = settings.target

  for (const row of comparable) {
    if (target) {
      const rate = getRate(settings, row.currency, target)
      if (rate !== null) {
        convertedRows.push({
          ...row,
          currency: target,
          total: row.quote.stayTotal * rate,
          nightly: row.quote.effectiveNightly * rate,
          perPerson: row.perPerson * rate,
          converted: row.currency !== target,
        })
        continue
      }
      missingRates.add(row.currency)
    }
    const bucket = byCurrency.get(row.currency) ?? []
    bucket.push(row)
    byCurrency.set(row.currency, bucket)
  }

  // Rows keep the order of `listings`, which is the user's own order.
  const sections: ComparisonSection[] = []
  if (target && convertedRows.length > 0) {
    sections.push({
      currency: target,
      converted: convertedRows.some((row) => row.converted),
      rows: convertedRows,
      lowest: convertedRows.length > 1 ? findLowest(convertedRows) : null,
    })
  }
  for (const [currency, rows] of [...byCurrency].sort(([a], [b]) => a.localeCompare(b))) {
    sections.push({
      currency,
      converted: false,
      rows,
      lowest: rows.length > 1 ? findLowest(rows) : null,
    })
  }

  return {
    sections,
    mismatched,
    missingRates: [...missingRates],
    invalid,
    currencies: [...currencies].sort(),
  }
}

function byDates(a: ComparisonRow, b: ComparisonRow) {
  return (
    a.listing.checkIn.localeCompare(b.listing.checkIn) ||
    a.listing.checkOut.localeCompare(b.listing.checkOut) ||
    a.listing.guests - b.listing.guests ||
    byName(a, b)
  )
}

/**
 * Orders quotes saved before manual ordering the way the app showed them then: cheapest first in each
 * section, and other dates or guests by date. Used once, so an upgrade does not reshuffle the list.
 */
export function legacyQuoteOrder(groups: StayGroup[], listings: Listing[], settings: ComparisonSettings): Listing[] {
  const ordered: Listing[] = []
  for (const group of groups) {
    const result = buildComparison(group, listings, settings)
    for (const section of result.sections) ordered.push(...[...section.rows].sort(cheapestFirst).map((row) => row.listing))
    ordered.push(...[...result.mismatched].sort(byDates).map((row) => row.listing))
    ordered.push(...result.invalid)
  }
  const placed = new Set(ordered)
  return [...ordered, ...listings.filter((listing) => !placed.has(listing))]
}

/**
 * Which list a quote shows in on its stay: its currency, or "Different dates or guests". A change to this is
 * the only edit that moves a quote; it then goes last in its new list, like a new quote.
 */
export function quoteSection(listing: Listing, groups: readonly StayGroup[]) {
  const group = groups.find((item) => item.id === listing.groupId)
  const matches =
    group && listing.checkIn === group.checkIn && listing.checkOut === group.checkOut && listing.guests === group.guests
  return `${listing.groupId}:${matches ? listing.currency : "other"}`
}
