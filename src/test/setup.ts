import "@testing-library/jest-dom/vitest"
import { cleanup } from "@testing-library/react"
import { afterEach } from "vitest"
import { resetThemeCache } from "@/lib/theme"

afterEach(() => {
  cleanup()
  localStorage.clear()
  window.history.replaceState(null, "", "/")
  document.documentElement.classList.remove("dark")
  resetThemeCache()
})

if (!window.matchMedia) {
  window.matchMedia = (query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }) as MediaQueryList
}

// jsdom lacks pointer capture, which sonner calls when a toast is clicked.
Element.prototype.setPointerCapture ??= () => {}
Element.prototype.releasePointerCapture ??= () => {}
Element.prototype.hasPointerCapture ??= () => false
// jsdom does no layout, so it has no scrollIntoView; the comparison table calls it on keyboard focus.
Element.prototype.scrollIntoView ??= () => {}
