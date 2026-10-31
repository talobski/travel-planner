import { useSyncExternalStore } from "react"

export type Page = "stays" | "itinerary"

export const PAGE_HREF: Record<Page, string> = { stays: "#/", itinerary: "#/itinerary" }

function readPage(): Page {
  return window.location.hash === PAGE_HREF.itinerary ? "itinerary" : "stays"
}

function subscribe(onChange: () => void) {
  window.addEventListener("hashchange", onChange)
  return () => window.removeEventListener("hashchange", onChange)
}

/** The current page, from the URL hash so reloads and Back keep it. */
export function usePage() {
  return useSyncExternalStore(subscribe, readPage)
}
