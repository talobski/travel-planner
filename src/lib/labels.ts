import { formatDateRange, nightsBetween, pluralize } from "./dates"
import type { FeeCertainty, StayGroup } from "./types"

export const FEE_CERTAINTY_LABELS: Record<FeeCertainty, string> = {
  confirmed: "All-in confirmed",
  estimated: "Fees estimated",
  unknown: "Fees unknown",
}

export const FEE_CERTAINTY_HINTS: Record<FeeCertainty, string> = {
  confirmed: "You saw the final total with every fee.",
  estimated: "Extra fees are a guess.",
  unknown: "There may be fees you have not seen yet.",
}

export function stayNights(group: Pick<StayGroup, "checkIn" | "checkOut">) {
  return nightsBetween(group.checkIn, group.checkOut) ?? 0
}

/** "May 5–8 · 3 nights · 2 guests" */
export function staySummary(stay: Pick<StayGroup, "checkIn" | "checkOut" | "guests">) {
  return [
    formatDateRange(stay.checkIn, stay.checkOut),
    pluralize(stayNights(stay), "night"),
    pluralize(stay.guests, "guest"),
  ].join(" · ")
}
