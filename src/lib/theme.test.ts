import { describe, expect, it } from "vitest"
import { THEME_KEY, applyTheme, readStoredTheme, setTheme } from "./theme"

describe("theme", () => {
  it("defaults to light when nothing is saved, even if the system prefers dark", () => {
    window.matchMedia = ((query: string) => ({ matches: query.includes("dark") })) as typeof window.matchMedia
    expect(readStoredTheme()).toBe("light")
  })

  it("restores only an explicit dark choice", () => {
    localStorage.setItem(THEME_KEY, "dark")
    expect(readStoredTheme()).toBe("dark")
    for (const value of ["light", "Dark", "system", ""]) {
      localStorage.setItem(THEME_KEY, value)
      expect(readStoredTheme()).toBe("light")
    }
  })

  it("applies the class and native color scheme, and saves the choice", () => {
    const meta = document.createElement("meta")
    meta.name = "color-scheme"
    meta.content = "light"
    document.head.append(meta)

    setTheme("dark")
    expect(document.documentElement).toHaveClass("dark")
    expect(meta.content).toBe("dark")
    expect(localStorage.getItem(THEME_KEY)).toBe("dark")

    applyTheme("light")
    expect(document.documentElement).not.toHaveClass("dark")
    expect(meta.content).toBe("light")
    meta.remove()
  })
})
