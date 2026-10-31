import { useSyncExternalStore } from "react"

export type Theme = "light" | "dark"

/** Must match the key read by the pre-paint script in index.html. */
export const THEME_KEY = "japan-stay-compare:theme"

/** Light unless the user explicitly chose dark. System appearance is ignored. */
export function readStoredTheme(storage: Storage | undefined = globalThis.localStorage): Theme {
  try {
    return storage?.getItem(THEME_KEY) === "dark" ? "dark" : "light"
  } catch {
    return "light"
  }
}

/** Applies the theme's `.dark` class and the native control color scheme. */
export function applyTheme(theme: Theme, root: HTMLElement = document.documentElement) {
  root.classList.toggle("dark", theme === "dark")
  root.ownerDocument.querySelector('meta[name="color-scheme"]')?.setAttribute("content", theme)
}

/**
 * Applies a theme change in one frame. Without this, controls with color
 * transitions fade from the old theme while the page background flips
 * instantly, briefly showing light controls on a dark page.
 */
function switchTheme(theme: Theme) {
  const style = document.createElement("style")
  style.textContent = "*,*::before,*::after{transition:none!important}"
  document.head.append(style)
  applyTheme(theme)
  // Flush styles with transitions disabled, then restore them.
  void getComputedStyle(document.body).color
  setTimeout(() => style.remove(), 1)
}

const listeners = new Set<() => void>()
let current: Theme | null = null

function getTheme(): Theme {
  // The pre-paint script has already applied the saved theme; read it back from the DOM.
  current ??= document.documentElement.classList.contains("dark") ? "dark" : "light"
  return current
}

export function setTheme(theme: Theme) {
  current = theme
  switchTheme(theme)
  try {
    localStorage.setItem(THEME_KEY, theme)
  } catch {
    // Storage blocked: the choice still applies for this visit.
  }
  listeners.forEach((listener) => listener())
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  // Keep other open tabs in sync.
  const onStorage = (event: StorageEvent) => {
    if (event.key !== THEME_KEY) return
    current = readStoredTheme()
    switchTheme(current)
    listener()
  }
  window.addEventListener("storage", onStorage)
  return () => {
    listeners.delete(listener)
    window.removeEventListener("storage", onStorage)
  }
}

export function useTheme() {
  return useSyncExternalStore(subscribe, getTheme, () => "light" as Theme)
}

/** Test helper: forget the cached theme so it is read from the DOM again. */
export function resetThemeCache() {
  current = null
}
