import { expect, test, type Locator, type Page } from "@playwright/test"

async function noHorizontalScroll(page: Page) {
  const { scrollWidth, innerWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }))
  expect(scrollWidth).toBeLessThanOrEqual(innerWidth)
}

async function insideViewport(page: Page, selector: string) {
  const width = page.viewportSize()!.width
  for (const box of await page.locator(selector).evaluateAll((els) =>
    els.map((el) => el.getBoundingClientRect().toJSON() as DOMRect),
  )) {
    expect(box.left).toBeGreaterThanOrEqual(0)
    expect(box.right).toBeLessThanOrEqual(width + 0.5)
  }
}

/**
 * Runs `act` on the theme toggle. On phones the toggle lives in the sidebar
 * drawer, so the drawer is opened first and closed afterwards.
 */
async function withThemeButton<T>(page: Page, name: string, act: (button: Locator) => Promise<T>): Promise<T> {
  const mobile = page.viewportSize()!.width < 768
  const drawer = page.getByRole("dialog", { name: "Navigation" })
  if (mobile) {
    await page.getByRole("button", { name: "Toggle Sidebar" }).click()
    await expect(drawer).toBeVisible()
    // Only timed animations finish; the tab strips' scroll-driven fades follow the scroll position.
    await page.waitForFunction(() => document.getAnimations().every((a) => a.timeline !== document.timeline || a.playState === "finished"))
  }
  const result = await act(page.getByRole("button", { name }))
  if (mobile) {
    await page.keyboard.press("Escape")
    await expect(drawer).toBeHidden()
  }
  return result
}

test.beforeEach(async ({ page }) => {
  await page.goto("/")
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await expect(page.getByRole("heading", { level: 1, name: "Stays" })).toBeVisible()
})

test("adds, keeps after reload, edits, and deletes with undo using only the keyboard", async ({ page }, info) => {
  test.skip(info.project.name === "mobile", "Keyboard flow runs on desktop")

  // Reach "Add quote" by tabbing from the top: sidebar, header, stay, then the
  // summary row's Edit stay and Add quote.
  const path = [
    page.getByRole("button", { name: /Sample trip/ }),
    page.getByRole("link", { name: "Stays", exact: true }),
    page.getByRole("link", { name: "Itinerary" }),
    page.getByRole("button", { name: "Switch to dark mode" }),
    page.getByRole("button", { name: "Toggle Sidebar" }),
    page.getByRole("button", { name: "Backup" }),
    page.getByRole("tab", { name: /Old Town.*May 5/ }),
    page.getByRole("button", { name: "New stay" }),
    page.getByRole("tabpanel"), // focusable per the ARIA tabs pattern
    page.getByRole("button", { name: "Edit stay" }),
    page.getByRole("button", { name: "Add quote" }),
  ]
  for (const target of path) {
    await page.keyboard.press("Tab")
    await expect(target).toBeFocused()
  }
  await page.keyboard.press("Enter")
  const sheet = page.getByRole("dialog", { name: "Add quote" })
  await expect(sheet.getByLabel("Name")).toBeFocused()
  await page.keyboard.type("Keyboard flat")

  // Tab forward to the price toggle and choose "Per night" with arrow keys.
  const perNight = sheet.getByRole("button", { name: "Per night" })
  for (let i = 0; i < 20 && !(await sheet.getByRole("button", { name: "Total for stay" }).evaluate((el) => el === document.activeElement)); i++) {
    await page.keyboard.press("Tab")
  }
  await page.keyboard.press("ArrowRight")
  await expect(perNight).toBeFocused()
  await page.keyboard.press("Space")
  await expect(perNight).toHaveAttribute("aria-pressed", "true")

  await page.keyboard.press("Tab") // currency
  await page.keyboard.press("Tab") // amount
  await expect(sheet.getByLabel("Price per night")).toBeFocused()
  await page.keyboard.type("12000")
  await page.keyboard.press("Tab")
  await page.keyboard.type("4000")
  await expect(sheet.getByTestId("preview-total")).toHaveText("¥40,000")
  await expect(sheet.getByTestId("preview-nightly")).toHaveText("¥13,333")
  await page.keyboard.press("Enter")
  await expect(sheet).toBeHidden()

  const row = page.getByTestId("quote-row").filter({ hasText: "Keyboard flat" })
  await expect(row.getByTestId("row-total")).toHaveText("¥40,000")
  await expect(row.getByText("Fees unknown")).toBeVisible()

  await page.reload()
  await expect(row).toBeVisible()

  // Edit through the row's action menu.
  await page.getByRole("button", { name: "Actions for Keyboard flat" }).focus()
  await page.keyboard.press("Enter")
  await expect(page.getByRole("menuitem", { name: "Edit" })).toBeFocused()
  await page.keyboard.press("Enter")
  const edit = page.getByRole("dialog", { name: "Edit quote" })
  await expect(edit).toBeVisible()
  await edit.getByLabel("Price per night").fill("11000")
  await page.keyboard.press("Enter")
  await expect(edit).toBeHidden()
  // Opened from the row menu, so focus returns to the menu trigger.
  await expect(page.getByRole("button", { name: "Actions for Keyboard flat" })).toBeFocused()
  await expect(row.getByTestId("row-total")).toHaveText("¥37,000")

  // Escape closes without saving.
  await row.getByRole("button", { name: "Keyboard flat", exact: true }).focus()
  await page.keyboard.press("Enter")
  await expect(edit).toBeVisible()
  await edit.getByLabel("Price per night").fill("1")
  await page.keyboard.press("Escape")
  await expect(edit).toBeHidden()
  // Focus returns to the control that opened the panel.
  await expect(row.getByRole("button", { name: "Keyboard flat", exact: true })).toBeFocused()
  await expect(row.getByTestId("row-total")).toHaveText("¥37,000")

  // Delete, then undo.
  await page.getByRole("button", { name: "Actions for Keyboard flat" }).focus()
  await page.keyboard.press("Enter")
  await expect(page.getByRole("menuitem", { name: "Edit" })).toBeFocused()
  await page.keyboard.press("ArrowDown")
  await expect(page.getByRole("menuitem", { name: "Mark as booked" })).toBeFocused()
  await page.keyboard.press("ArrowDown")
  await expect(page.getByRole("menuitem", { name: "Delete" })).toBeFocused()
  await page.keyboard.press("Enter")
  await expect(row).toHaveCount(0)
  await page.getByRole("button", { name: "Undo" }).click()
  await expect(row).toHaveCount(1)
  await page.reload()
  await expect(row).toHaveCount(1)
})

test("switches stays with arrow keys and defaults new quotes to the selected stay", async ({ page }, info) => {
  test.skip(info.project.name === "mobile", "Keyboard flow runs on desktop")
  await page.getByRole("tab", { name: /Old Town.*May 5/ }).focus()
  await page.keyboard.press("ArrowRight")
  await page.keyboard.press("Enter")
  await expect(page.getByRole("tab", { name: /Lakeside/ })).toHaveAttribute("aria-selected", "true")
  await expect(page.getByText("Wed, May 8 to Fri, May 10, 2030")).toBeVisible()
  await page.getByRole("button", { name: "Add quote" }).first().click()
  const sheet = page.getByRole("dialog", { name: "Add quote" })
  await expect(sheet.getByLabel("Check-in")).toHaveValue("2030-05-08")
  await expect(sheet.getByLabel("Check-out")).toHaveValue("2030-05-10")
  await expect(sheet.getByLabel("Guests")).toHaveValue("4")
})

test("fits a phone screen without horizontal scrolling", async ({ page }, info) => {
  test.skip(info.project.name !== "mobile", "Layout check runs on mobile")
  await page.evaluate(() => {
    const listing = (id: string, extra: object) => ({
      id, groupId: "sample-old-town-1", name: `A rather long listing title for ${id} near the station`, area: "Riverside",
      source: "Booking.com", url: "https://example.com/" + id, checkIn: "2030-05-05", checkOut: "2030-05-08", guests: 2,
      currency: "PHP", amount: 123456.78, basis: "stay", extraFees: 4500, feeCertainty: "estimated",
      notes: "Elevator, two proper beds, 6 minute walk to Riverside station with one rest stop.",
      createdAt: "2026-10-01T00:00:00.000Z", updatedAt: "2026-10-01T00:00:00.000Z", ...extra,
    })
    localStorage.setItem("japan-stay-compare:v1", JSON.stringify({
      version: 1, trip: { name: "Sample trip", destination: "Example City", start: "2030-05-01", end: "2030-05-14" },
      groups: [
        { id: "sample-old-town-1", area: "Old Town", checkIn: "2030-05-05", checkOut: "2030-05-08", guests: 2 },
        { id: "sample-lakeside", area: "Lakeside", checkIn: "2030-05-08", checkOut: "2030-05-10", guests: 4 },
        { id: "sample-old-town-2", area: "Old Town", checkIn: "2030-05-10", checkOut: "2030-05-14", guests: 4 },
      ],
      listings: [listing("a", {}), listing("b", { currency: "JPY", amount: 1234567 }), listing("c", { checkIn: "2030-05-06" })],
      comparison: { target: "PHP", rates: {} },
    }))
  })
  await page.reload()
  await expect(page.getByTestId("quote-row")).toHaveCount(3)
  await noHorizontalScroll(page)
  // Wide prices scroll inside each table's frame, which stays within the screen.
  await insideViewport(page, "[data-testid=quote-frame]")

  await page.getByRole("button", { name: "Add quote" }).first().click()
  const sheet = page.getByRole("dialog", { name: "Add quote" })
  await expect(sheet).toBeVisible()
  await page.waitForFunction(() => document.getAnimations().every((a) => a.timeline !== document.timeline || a.playState === "finished"))
  const box = (await sheet.boundingBox())!
  expect(box.width).toBeGreaterThanOrEqual(page.viewportSize()!.width - 1)
  await insideViewport(page, "[role=dialog] input, [role=dialog] select, [role=dialog] button")
  await noHorizontalScroll(page)
})

test.describe("in a timezone with DST", () => {
  test.use({ timezoneId: "America/New_York" })
  test("counts nights by calendar date across a DST change", async ({ page }) => {
    await page.getByRole("button", { name: "Add quote" }).first().click()
    const sheet = page.getByRole("dialog", { name: "Add quote" })
    await sheet.getByLabel("Check-in").fill("2026-03-07")
    await sheet.getByLabel("Check-out").fill("2026-03-10")
    await sheet.getByLabel("Price for the stay").fill("30000")
    await expect(sheet.getByText("Stay price, 3 nights")).toBeVisible()
    await expect(sheet.getByTestId("preview-nightly")).toHaveText("¥10,000")
  })
})

test.describe("theme", () => {
  // The device prefers dark; the app must still default to light.
  test.use({ colorScheme: "dark" })

  const LIGHT_BG = "oklch(0.9818 0.0054 95.0986)"
  const DARK_BG = "oklch(0.2679 0.0036 106.6427)"

  /** Theme state as the browser resolves it, with the supplied tokens resolved the same way for comparison. */
  async function themeState(page: Page) {
    return page.evaluate(
      ([lightBg, darkBg]) => {
        const resolve = (color: string) => {
          const probe = document.createElement("div")
          probe.style.backgroundColor = color
          document.body.append(probe)
          const value = getComputedStyle(probe).backgroundColor
          probe.remove()
          return value
        }
        const body = getComputedStyle(document.body).backgroundColor
        return {
          dark: document.documentElement.classList.contains("dark"),
          colorScheme: getComputedStyle(document.documentElement).colorScheme,
          meta: document.querySelector('meta[name="color-scheme"]')?.getAttribute("content"),
          background: body === resolve(lightBg) ? "light" : body === resolve(darkBg) ? "dark" : body,
        }
      },
      [LIGHT_BG, DARK_BG],
    )
  }

  const light = { dark: false, colorScheme: "light", meta: "light", background: "light" }
  const dark = { dark: true, colorScheme: "dark", meta: "dark", background: "dark" }

  test("defaults to light on first paint and after load when nothing is saved", async ({ browser, page }) => {
    const noScripts = await browser.newContext({ colorScheme: "dark", javaScriptEnabled: false })
    const firstPaint = await noScripts.newPage()
    await firstPaint.goto("/")
    expect(await themeState(firstPaint)).toEqual(light)
    await noScripts.close()

    await withThemeButton(page, "Switch to dark mode", (button) => expect(button).toBeVisible())
    expect(await themeState(page)).toEqual(light)
  })

  test("toggles both ways, themes native controls and toasts, and persists without a flash", async ({ page }) => {
    await withThemeButton(page, "Switch to dark mode", async (button) => {
      await button.click()
      await expect(page.getByRole("button", { name: "Switch to light mode" })).toBeVisible()
    })
    expect(await themeState(page)).toEqual(dark)

    // Native controls and toasts follow the selection.
    await page.getByRole("main").getByRole("button", { name: "Add quote" }).click()
    const sheet = page.getByRole("dialog", { name: "Add quote" })
    expect(await sheet.getByLabel("Check-in").evaluate((el) => getComputedStyle(el).colorScheme)).toBe("dark")
    await sheet.getByLabel("Name").fill("Theme test")
    await sheet.getByLabel("Price for the stay").fill("30000")
    await sheet.getByRole("button", { name: "Add quote" }).click()
    await expect(page.getByText("Quote added")).toBeVisible()
    await expect(page.locator("[data-sonner-toaster]")).toHaveAttribute("data-sonner-theme", "dark")

    // Saved dark choice is applied by the inline script before any app code runs.
    await page.route("**/assets/*.js", (route) => route.abort())
    await page.reload()
    expect(await themeState(page)).toEqual(dark)
    await page.unroute("**/assets/*.js")
    await page.reload()
    await withThemeButton(page, "Switch to light mode", (button) => expect(button).toBeVisible())
    expect(await themeState(page)).toEqual(dark)

    await withThemeButton(page, "Switch to light mode", (button) => button.click())
    expect(await themeState(page)).toEqual(light)
    await page.reload()
    await withThemeButton(page, "Switch to dark mode", (button) => expect(button).toBeVisible())
    expect(await themeState(page)).toEqual(light)
    expect(await page.evaluate(() => localStorage.getItem("japan-stay-compare:theme"))).toBe("light")
  })

  test("switches every surface at once, with no color transitions mid-switch", async ({ page }) => {
    for (const name of ["Switch to dark mode", "Switch to light mode"]) {
      await withThemeButton(page, name, async (button) => {
        const running = await button.evaluate((el) => {
          ;(el as HTMLButtonElement).click()
          return document.getAnimations().filter((a) => a instanceof CSSTransition).length
        })
        expect(running, `${name}: transitions started by the theme change`).toBe(0)
        const next = name.includes("dark") ? "Switch to light mode" : "Switch to dark mode"
        await expect(page.getByRole("button", { name: next })).toBeVisible()
      })
    }
  })

  test("the toggle works from the keyboard", async ({ page }, info) => {
    test.skip(info.project.name === "mobile", "Keyboard flow runs on desktop")
    // Trip selector, Stays, Itinerary, then the theme toggle.
    for (let i = 0; i < 4; i++) await page.keyboard.press("Tab")
    await expect(page.getByRole("button", { name: "Switch to dark mode" })).toBeFocused()
    await page.keyboard.press("Enter")
    await expect(page.getByRole("button", { name: "Switch to light mode" })).toBeFocused()
    expect(await themeState(page)).toEqual(dark)
    await page.keyboard.press("Space")
    expect(await themeState(page)).toEqual(light)
  })
})

test.describe("scrolling", () => {
  async function waitForAnimations(page: Page) {
    await page.waitForFunction(() => document.getAnimations().every((a) => a.timeline !== document.timeline || a.playState === "finished"))
  }

  for (const size of [null, { width: 1024, height: 560 }]) {
    test(`add/edit panel keeps every field and action reachable${size ? " on a short screen" : ""}`, async ({ page }, info) => {
      test.skip(size !== null && info.project.name === "mobile", "Short-screen case runs on desktop")
      if (size) await page.setViewportSize(size)

      await page.getByRole("main").getByRole("button", { name: "Add quote" }).click()
      const sheet = page.getByRole("dialog", { name: "Add quote" })
      await expect(sheet).toBeVisible()
      await waitForAnimations(page)
      const viewport = sheet.locator("[data-testid=listing-sheet-scroll] [data-slot=scroll-area-viewport]")
      const { scrollHeight, clientHeight } = await viewport.evaluate((el) => ({
        scrollHeight: el.scrollHeight,
        clientHeight: el.clientHeight,
      }))
      expect(scrollHeight).toBeGreaterThan(clientHeight) // the panel really overflows

      // Tab through the whole panel: every focused control must be scrolled into view, not hidden under the footer.
      const reached: string[] = []
      for (let i = 0; i < 40; i++) {
        const info = await page.evaluate(() => {
          const el = document.activeElement as HTMLElement
          const vp = document.querySelector("[data-testid=listing-sheet-scroll] [data-slot=scroll-area-viewport]")!
          const box = el.getBoundingClientRect()
          const area = vp.contains(el) ? vp.getBoundingClientRect() : { top: 0, bottom: innerHeight }
          const label =
            el.getAttribute("aria-label") ||
            (el.id && document.querySelector(`label[for="${el.id}"]`)?.textContent) ||
            el.textContent ||
            el.tagName
          return { label: label.trim(), visible: box.top >= area.top - 1 && box.bottom <= area.bottom + 1 }
        })
        expect(info.visible, `${info.label} is visible when focused`).toBe(true)
        reached.push(info.label)
        if (info.label === "Add quote") break
        await page.keyboard.press("Tab")
      }
      for (const label of ["Name", "Area", "Source", "Link", "Check-in", "Check-out", "Guests", "Price for the stay", "Extra fees not included above", "Notes", "Cancel", "Add quote"]) {
        expect(reached).toContain(label)
      }
      await page.keyboard.press("Shift+Tab")
      await page.keyboard.press("Shift+Tab")
      await expect(sheet.getByLabel("Notes")).toBeFocused()

      // Scroll back to the top by pointer (wheel on desktop, touch swipe on mobile).
      const box = (await viewport.boundingBox())!
      if (info.project.name === "mobile") {
        const cdp = await page.context().newCDPSession(page)
        await cdp.send("Input.synthesizeScrollGesture", {
          x: Math.round(box.x + box.width / 2),
          y: Math.round(box.y + 40),
          yDistance: 2000,
          gestureSourceType: "touch",
          speed: 3000,
        })
      } else {
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
        await page.mouse.wheel(0, -3000)
      }
      await expect.poll(() => viewport.evaluate((el) => el.scrollTop)).toBe(0)
      await expect(sheet.getByLabel("Stay", { exact: true })).toBeInViewport()

      // And down again to the last field.
      if (info.project.name === "mobile") {
        const cdp = await page.context().newCDPSession(page)
        await cdp.send("Input.synthesizeScrollGesture", {
          x: Math.round(box.x + box.width / 2),
          y: Math.round(box.y + box.height - 40),
          yDistance: -2000,
          gestureSourceType: "touch",
          speed: 3000,
        })
      } else {
        await page.mouse.wheel(0, 3000)
      }
      await expect(sheet.getByLabel("Notes")).toBeInViewport()
      await expect(sheet.getByRole("button", { name: "Add quote" })).toBeInViewport()
    })
  }

  test("the main page scrolls as a normal document", async ({ page }) => {
    await page.evaluate(() => {
      const listings = Array.from({ length: 12 }, (_, i) => ({
        id: `l${i}`, groupId: "sample-old-town-1", name: `Listing ${i}`, area: "Riverside", source: "Airbnb", url: "",
        checkIn: "2030-05-05", checkOut: "2030-05-08", guests: 2, currency: "JPY", amount: 30000 + i * 1000,
        basis: "stay", extraFees: 0, feeCertainty: "confirmed", notes: "", createdAt: "2026-10-01T00:00:00.000Z",
        updatedAt: "2026-10-01T00:00:00.000Z",
      }))
      const groups = [
        { id: "sample-old-town-1", area: "Old Town", checkIn: "2030-05-05", checkOut: "2030-05-08", guests: 2 },
        { id: "sample-lakeside", area: "Lakeside", checkIn: "2030-05-08", checkOut: "2030-05-10", guests: 4 },
        { id: "sample-old-town-2", area: "Old Town", checkIn: "2030-05-10", checkOut: "2030-05-14", guests: 4 },
        { id: "kyoto", area: "Kyoto", checkIn: "2030-05-15", checkOut: "2030-05-17", guests: 2 },
      ]
      localStorage.setItem("japan-stay-compare:v1", JSON.stringify({ version: 1, trip: { name: "Sample trip", destination: "Example City", start: "2030-05-01", end: "2030-05-14" }, groups, listings, comparison: { target: null, rates: {} } }))
    })
    await page.reload()
    await expect(page.locator("main")).not.toHaveAttribute("data-slot", "scroll-area")
    expect(await page.locator("[data-slot=scroll-area] main").count()).toBe(0)
    // Tables scroll sideways in their own scroll areas, never vertically, so the page keeps the wheel.
    const tableViewports = page.locator("[data-testid=quote-frame] [data-slot=scroll-area-viewport]")
    await expect(tableViewports.first()).toBeVisible()
    for (const vp of await tableViewports.all()) {
      expect(await vp.evaluate((el) => el.scrollHeight - el.clientHeight)).toBeLessThanOrEqual(0)
    }
    await page.mouse.wheel(0, 5000)
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0)
    await expect(page.getByText(/saved in this browser only/i)).toBeInViewport()
  })

  test("stay tabs scroll sideways on a phone without moving the page", async ({ page }, info) => {
    test.skip(info.project.name !== "mobile", "Narrow-screen case")
    await page.evaluate(() => {
      const groups = [
        { id: "sample-old-town-1", area: "Old Town", checkIn: "2030-05-05", checkOut: "2030-05-08", guests: 2 },
        { id: "sample-lakeside", area: "Lakeside", checkIn: "2030-05-08", checkOut: "2030-05-10", guests: 4 },
        { id: "sample-old-town-2", area: "Old Town", checkIn: "2030-05-10", checkOut: "2030-05-14", guests: 4 },
        { id: "kyoto", area: "Kyoto", checkIn: "2030-05-15", checkOut: "2030-05-17", guests: 2 },
      ]
      localStorage.setItem("japan-stay-compare:v1", JSON.stringify({ version: 1, trip: { name: "Sample trip", destination: "Example City", start: "2030-05-01", end: "2030-05-14" }, groups, listings: [], comparison: { target: null, rates: {} } }))
    })
    await page.reload()
    const kyoto = page.getByRole("tab", { name: /Kyoto/ })
    await page.getByRole("tab", { name: /Old Town.*May 5/ }).focus()
    for (let i = 0; i < 3; i++) await page.keyboard.press("ArrowRight")
    await expect(kyoto).toBeFocused()
    await expect(kyoto).toBeInViewport({ ratio: 1 })
    await page.keyboard.press("Enter")
    await expect(kyoto).toHaveAttribute("aria-selected", "true")
    await noHorizontalScroll(page)
  })
})

test.describe("sidebar", () => {
  const sidebar = (page: Page) => page.locator("[data-slot=sidebar-container]")
  const sidebarState = (page: Page) => page.locator("[data-slot=sidebar]").first().getAttribute("data-state")

  test("inset layout with trip selector and links between Stays and Itinerary", async ({ page }, info) => {
    test.skip(info.project.name === "mobile", "Desktop layout")
    await expect(sidebar(page)).toBeVisible()
    const inset = page.locator("[data-slot=sidebar-inset]")
    const insetStyle = await inset.evaluate((el) => {
      const style = getComputedStyle(el)
      return { radius: parseFloat(style.borderTopLeftRadius), top: el.getBoundingClientRect().top }
    })
    expect(insetStyle.radius).toBeGreaterThan(0)
    expect(insetStyle.top).toBeGreaterThan(0) // inset from the window edge
    await expect(inset.locator("header").getByRole("button", { name: "Toggle Sidebar" })).toBeVisible()
    await expect(inset.getByRole("heading", { level: 1 })).toHaveText("Stays")

    const trip = page.getByRole("button", { name: /Sample trip/ })
    await expect(trip).toContainText("Sample trip")
    await expect(trip).toContainText("May 1–14 · 14 days")
    await trip.click()
    const items = page.getByRole("menuitemradio")
    await expect(items).toHaveCount(1)
    await expect(items.first()).toHaveAttribute("aria-checked", "true")
    await expect(page.getByRole("menuitem")).toHaveText(["Edit trip"])
    await page.keyboard.press("Escape")
    await expect(items).toHaveCount(0)
    await expect(trip).toBeFocused()

    await expect(page.getByRole("link", { name: "Stays", exact: true })).toHaveAttribute("aria-current", "page")
    const itinerary = page.getByRole("link", { name: "Itinerary" })
    await expect(itinerary).not.toHaveAttribute("aria-current")
    await itinerary.click()
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Itinerary")
    await expect(page).toHaveURL(/#\/itinerary$/)
    await expect(itinerary).toHaveAttribute("aria-current", "page")
    await expect(page.getByRole("tablist", { name: "Days" })).toBeVisible()
    // Back returns to Stays; a reload keeps the page.
    await page.goBack()
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Stays")
    await page.goForward()
    await page.reload()
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Itinerary")
  })

  test("collapses to icons, keeps the theme toggle usable, and remembers the state", async ({ page }, info) => {
    test.skip(info.project.name === "mobile", "Desktop collapse")
    const trigger = page.getByRole("button", { name: "Toggle Sidebar" })
    await trigger.focus()
    await page.keyboard.press("Enter")
    expect(await sidebarState(page)).toBe("collapsed")
    await expect(trigger).toBeFocused()
    await expect.poll(async () => (await sidebar(page).boundingBox())!.width).toBeLessThan(80)

    // Icons remain, with tooltips naming them.
    const theme = page.getByRole("button", { name: "Switch to dark mode" })
    await expect(theme).toBeInViewport()
    await theme.hover()
    await expect(page.locator("[data-slot=tooltip-content]").filter({ hasText: "Switch to dark mode" })).toBeVisible()
    await theme.click()
    await expect(page.locator("html")).toHaveClass(/dark/)
    await page.getByRole("link", { name: "Stays", exact: true }).hover()
    await expect(page.locator("[data-slot=tooltip-content]").filter({ hasText: /^Stays$/ })).toBeVisible()

    await page.reload()
    expect(await sidebarState(page)).toBe("collapsed")
    await expect(page.locator("html")).toHaveClass(/dark/)

    await page.keyboard.press("ControlOrMeta+b")
    expect(await sidebarState(page)).toBe("expanded")
    await page.reload()
    expect(await sidebarState(page)).toBe("expanded")
    await expect(page.getByRole("button", { name: /Sample trip/ })).toContainText("May 1–14 · 14 days")
  })

  test("opens as a drawer on mobile", async ({ page }, info) => {
    test.skip(info.project.name !== "mobile", "Mobile drawer")
    await expect(page.getByRole("button", { name: /Sample trip/ })).toHaveCount(0)
    await noHorizontalScroll(page)

    const trigger = page.getByRole("button", { name: "Toggle Sidebar" })
    await trigger.click()
    const drawer = page.getByRole("dialog", { name: "Navigation" })
    await expect(drawer).toBeVisible()
    await expect(drawer.getByRole("button", { name: /Sample trip/ })).toContainText("May 1–14 · 14 days")
    await expect(drawer.getByRole("link", { name: "Stays", exact: true })).toHaveAttribute("aria-current", "page")
    await expect(drawer.getByRole("link", { name: "Itinerary" })).not.toHaveAttribute("aria-current")

    // Theme toggle works from the drawer, and there is no second toggle in the page.
    await drawer.getByRole("button", { name: "Switch to dark mode" }).click()
    await expect(page.locator("html")).toHaveClass(/dark/)
    await expect(page.getByRole("button", { name: /Switch to (dark|light) mode/ })).toHaveCount(1)

    // Escape closes and returns focus to the trigger.
    await page.keyboard.press("Escape")
    await expect(drawer).toBeHidden()
    await expect(trigger).toBeFocused()

    // Choosing the current page closes the drawer.
    await trigger.click()
    await expect(drawer).toBeVisible()
    await drawer.getByRole("link", { name: "Stays", exact: true }).click()
    await expect(drawer).toBeHidden()
    await noHorizontalScroll(page)

    // Choosing another page goes there and closes the drawer.
    await trigger.click()
    await drawer.getByRole("link", { name: "Itinerary" }).click()
    await expect(drawer).toBeHidden()
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Itinerary")
    await noHorizontalScroll(page)
  })

  test("edits the trip details from the trip selector, and the dialog fits a phone", async ({ page }) => {
    const mobile = page.viewportSize()!.width < 768
    const scope = mobile ? page.getByRole("dialog", { name: "Navigation" }) : page
    if (mobile) await page.getByRole("button", { name: "Toggle Sidebar" }).click()
    const trip = scope.getByRole("button", { name: /Sample trip/ })
    await trip.click()
    await page.getByRole("menuitem", { name: "Edit trip" }).click()
    const dialog = page.getByRole("dialog", { name: "Edit trip" })
    await expect(dialog).toBeVisible()
    await expect(dialog.getByLabel("Name")).toBeFocused()
    await insideViewport(page, "[data-slot=dialog-content]")
    await noHorizontalScroll(page)

    await dialog.getByLabel("Name").fill("Spring trip")
    await dialog.getByLabel("First day").fill("2030-05-03")
    await dialog.getByLabel("Last day").fill("2030-05-09")
    await expect(dialog.getByTestId("trip-length")).toHaveText("7 days")
    await dialog.getByRole("button", { name: "Save trip" }).click()
    await expect(dialog).toBeHidden()
    const renamed = scope.getByRole("button", { name: /Spring trip/ })
    await expect(renamed).toContainText("May 3–9 · 7 days")
    if (!mobile) await expect(renamed).toBeFocused()

    if (mobile) await page.keyboard.press("Escape")
    await page.goto("/#/itinerary")
    await expect(page.getByTestId("day-tab")).toHaveCount(7)
    await page.reload()
    await expect(page.getByTestId("day-tab").first()).toContainText("May 3")
  })

  test("uses the theme's sidebar and background tokens in light and dark", async ({ page }, info) => {
    test.skip(info.project.name === "mobile", "Desktop surfaces")
    const tokens = {
      light: { sidebar: "oklch(0.9663 0.008 98.8792)", background: "oklch(0.9818 0.0054 95.0986)" },
      dark: { sidebar: "oklch(0.2357 0.0024 98.8792)", background: "oklch(0.2679 0.0036 106.6427)" },
    }
    for (const mode of ["light", "dark"] as const) {
      if (mode === "dark") await page.getByRole("button", { name: "Switch to dark mode" }).click()
      const result = await page.evaluate((expected) => {
        const resolve = (color: string) => {
          const probe = document.createElement("div")
          probe.style.backgroundColor = color
          document.body.append(probe)
          const value = getComputedStyle(probe).backgroundColor
          probe.remove()
          return value
        }
        const bg = (selector: string) => getComputedStyle(document.querySelector(selector)!).backgroundColor
        return {
          sidebar: bg("[data-slot=sidebar-inner]") === resolve(expected.sidebar),
          wrapper: bg("[data-slot=sidebar-wrapper]") === resolve(expected.sidebar),
          inset: bg("[data-slot=sidebar-inset]") === resolve(expected.background),
        }
      }, tokens[mode])
      expect(result, mode).toEqual({ sidebar: true, wrapper: true, inset: true })
    }
  })

  test("keeps quotes, settings, the selected stay, and the theme saved before the sidebar existed", async ({ page }) => {
    const saved = await page.evaluate(() => {
      const data = {
        version: 1,
        groups: [
          { id: "sample-old-town-1", area: "Old Town", checkIn: "2030-05-05", checkOut: "2030-05-08", guests: 2 },
          { id: "sample-lakeside", area: "Lakeside", checkIn: "2030-05-08", checkOut: "2030-05-10", guests: 4 },
          { id: "sample-old-town-2", area: "Old Town", checkIn: "2030-05-10", checkOut: "2030-05-14", guests: 4 },
        ],
        listings: [
          { id: "a", groupId: "sample-lakeside", name: "Lake house", area: "Lakeshore", source: "Airbnb", url: "",
            checkIn: "2030-05-08", checkOut: "2030-05-10", guests: 4, currency: "JPY", amount: 60000, basis: "stay",
            extraFees: 0, feeCertainty: "confirmed", notes: "", createdAt: "2026-10-01T00:00:00.000Z",
            updatedAt: "2026-10-01T00:00:00.000Z" },
          { id: "b", groupId: "sample-lakeside", name: "Peso cabin", area: "", source: "Agoda", url: "",
            checkIn: "2030-05-08", checkOut: "2030-05-10", guests: 4, currency: "PHP", amount: 20000, basis: "stay",
            extraFees: 0, feeCertainty: "confirmed", notes: "", createdAt: "2026-10-01T00:00:00.000Z",
            updatedAt: "2026-10-01T00:00:00.000Z" },
        ],
        comparison: { target: "PHP", rates: { "JPY:PHP": 0.37 } },
      }
      localStorage.setItem("japan-stay-compare:v1", JSON.stringify(data))
      localStorage.setItem("japan-stay-compare:v1:selected-stay", "sample-lakeside")
      localStorage.setItem("japan-stay-compare:theme", "dark")
      return JSON.stringify(data)
    })
    await page.reload()
    await expect(page.locator("html")).toHaveClass(/dark/)
    // Saved before trip details existed: asked for, not guessed.
    await expect(page.getByText("Confirm your trip details")).toBeVisible()
    await expect(page.getByRole("tab", { name: /Lakeside/ })).toHaveAttribute("aria-selected", "true")
    const converted = page.getByRole("table", { name: "Converted to PHP" })
    await expect(converted.getByTestId("quote-row")).toHaveCount(2)
    await expect(converted.getByTestId("row-total").first()).toHaveText("₱20,000.00")
    await expect(page.getByLabel("Currencies")).toHaveValue("PHP")
    // Loading must not rewrite the saved data.
    expect(await page.evaluate(() => localStorage.getItem("japan-stay-compare:v1"))).toBe(saved)
  })
})

test("shows the per-person split under the nightly rate on wide and narrow layouts", async ({ page }) => {
  await page.evaluate(() => {
    const quote = (id: string, guests: number, amount: number) => ({
      id, groupId: "sample-lakeside", name: `Cabin ${id}`, area: "", source: "Airbnb", url: "", checkIn: "2030-05-08",
      checkOut: "2030-05-10", guests, currency: "JPY", amount, basis: "stay", extraFees: 1000, feeCertainty: "estimated",
      notes: "", createdAt: "2026-10-01T00:00:00.000Z", updatedAt: "2026-10-01T00:00:00.000Z",
    })
    localStorage.setItem("japan-stay-compare:v1", JSON.stringify({
      version: 1, trip: { name: "Sample trip", destination: "Example City", start: "2030-05-01", end: "2030-05-14" },
      groups: [{ id: "sample-lakeside", area: "Lakeside", checkIn: "2030-05-08", checkOut: "2030-05-10", guests: 5 }],
      // (59,000 + 1,000) / 2 nights / 5 guests; the 4-guest quote splits by its own count.
      listings: [quote("five", 5, 59000), quote("four", 4, 59000)],
      comparison: { target: null, rates: {} },
    }))
  })
  await page.reload()
  const five = page.getByTestId("quote-row").filter({ hasText: "Cabin five" })
  const four = page.getByTestId("quote-row").filter({ hasText: "Cabin four" })
  await expect(five.getByTestId("row-per-person")).toHaveText("¥6,000")
  await expect(four.getByTestId("row-per-person")).toHaveText("¥7,500")

  // One price group: whole-place nightly rate first, the per-person split under it.
  await expect(page.getByText(/per person \/ night/i)).toHaveCount(0)
  const nightly = await five.getByTestId("row-nightly").boundingBox()
  const perPerson = five.getByTestId("row-per-person")
  const split = await perPerson.locator("..").boundingBox() // the amount plus its "/ person" suffix
  expect(split!.y).toBeGreaterThan(nightly!.y + nightly!.height - 1)
  const size = (locator: Locator) => locator.evaluate((el) => parseFloat(getComputedStyle(el).fontSize))
  expect(await size(perPerson)).toBeLessThan(await size(five.getByTestId("row-nightly")))
  await expect(five.getByText("/ person")).toBeVisible()
  // Screen readers hear "per person per night" instead of the visual shorthand.
  await expect(five.getByText("/ person")).toHaveAttribute("aria-hidden", "true")
  expect((await five.getByText("per person per night").boundingBox())!.width).toBeLessThanOrEqual(1)

  // The column header names the price on every width, so there is no inline label.
  await expect(five.getByText("per night", { exact: true })).toHaveCount(0)
  const header = page.getByRole("columnheader", { name: "Per night" }).first()
  await expect(header).toBeVisible()
  // Both figures right-align with the "Per night" heading text.
  const headingRight = await header.evaluate((el) => {
    const range = document.createRange()
    range.selectNodeContents(el)
    return range.getBoundingClientRect().right
  })
  for (const box of [nightly!, split!]) expect(Math.abs(headingRight - (box.x + box.width))).toBeLessThan(2)
  await noHorizontalScroll(page)
})

test.describe("listings toolbar", () => {
  async function seedQuotes(page: Page, comparison: object = { target: null, rates: {} }) {
    await page.evaluate((settings) => {
      const quote = (id: string, currency: string, amount: number) => ({
        id, groupId: "sample-old-town-1", name: `Flat ${id}`, area: "", source: "Airbnb", url: "", checkIn: "2030-05-05",
        checkOut: "2030-05-08", guests: 2, currency, amount, basis: "stay", extraFees: 0, feeCertainty: "confirmed",
        notes: "", createdAt: "2026-10-01T00:00:00.000Z", updatedAt: "2026-10-01T00:00:00.000Z",
      })
      localStorage.setItem("japan-stay-compare:v1", JSON.stringify({
        version: 1, trip: { name: "Sample trip", destination: "Example City", start: "2030-05-01", end: "2030-05-14" },
        groups: [
          { id: "sample-old-town-1", area: "Old Town", checkIn: "2030-05-05", checkOut: "2030-05-08", guests: 2 },
          { id: "sample-lakeside", area: "Lakeside", checkIn: "2030-05-08", checkOut: "2030-05-10", guests: 4 },
        ],
        listings: [quote("a", "JPY", 42000), quote("b", "PHP", 14500), quote("c", "USD", 300)],
        comparison: settings,
      }))
    }, comparison)
    await page.reload()
  }
  const center = (box: { y: number; height: number }) => box.y + box.height / 2

  test("keeps Edit stay inline after the summary and Add quote beside it, outside the table", async ({ page }) => {
    await seedQuotes(page)
    const frame = page.getByTestId("quote-frame")
    const add = page.getByRole("button", { name: "Add quote" })
    await expect(add).toHaveCount(1)
    await expect(frame.getByRole("button", { name: "Add quote" })).toHaveCount(0)
    await expect(page.getByTestId("summary-row").getByRole("button", { name: "Add quote" })).toBeVisible()
    await expect(page.getByLabel("Sort")).toHaveCount(0)
    await expect(page.locator("header").getByRole("button", { name: "Add quote" })).toHaveCount(0)
    await expect(page.locator("header").getByRole("button", { name: "Backup" })).toBeVisible()

    // A small icon button right after the summary text, named and with a tooltip.
    const summary = page.getByText(/\d+ nights? · \d+ guests?$/)
    await expect(summary).toBeVisible()
    await expect(page.getByText("whole-place", { exact: false })).toHaveCount(0)
    const edit = page.getByRole("button", { name: "Edit stay" })
    await expect(edit).toHaveText("")
    const editBox = (await edit.boundingBox())!
    expect(editBox.width).toBe(28)
    expect(editBox.height).toBe(28)
    // The pencil matches the plus in New stay.
    const glyph = (button: Locator) => button.locator("svg").evaluate((el) => el.getBoundingClientRect().toJSON())
    const pencil = await glyph(edit)
    const plus = await glyph(page.getByRole("button", { name: "New stay" }))
    expect(pencil.width).toBe(plus.width)
    expect(pencil.height).toBe(plus.height)
    const textEnd = await summary.evaluate((el) => {
      const range = document.createRange()
      range.selectNodeContents(el)
      const rects = [...range.getClientRects()]
      return rects[rects.length - 1].toJSON() as DOMRect
    })
    expect(editBox.x).toBeGreaterThan(textEnd.right)
    expect(editBox.x - textEnd.right).toBeLessThan(12)
    expect(Math.abs(center(editBox) - (textEnd.top + textEnd.height / 2))).toBeLessThan(2)
    await edit.hover()
    await expect(page.locator("[data-slot=tooltip-content]").filter({ hasText: "Edit stay" })).toBeVisible()

    // Add quote sits opposite the summary, flush with the frame's right edge and above it, on phones too.
    const button = (await add.boundingBox())!
    const text = (await page.getByTestId("summary-row").locator("p").boundingBox())!
    const frameBox = (await frame.boundingBox())!
    expect(Math.abs(center(button) - center(text))).toBeLessThan(1)
    expect(button.x).toBeGreaterThan(editBox.x + editBox.width)
    expect(Math.abs(frameBox.x + frameBox.width - (button.x + button.width))).toBeLessThan(1)
    expect(button.y + button.height).toBeLessThan(frameBox.y)
    await noHorizontalScroll(page)
  })

  test("leaves no toolbar in the frame when there is nothing to convert", async ({ page }) => {
    await page.evaluate(() => {
      const quote = (id: string, amount: number) => ({
        id, groupId: "sample-old-town-1", name: `Flat ${id}`, area: "", source: "Airbnb", url: "", checkIn: "2030-05-05",
        checkOut: "2030-05-08", guests: 2, currency: "JPY", amount, basis: "stay", extraFees: 0, feeCertainty: "confirmed",
        notes: "", booked: false, createdAt: "2026-10-01T00:00:00.000Z", updatedAt: "2026-10-01T00:00:00.000Z",
      })
      localStorage.setItem("japan-stay-compare:v1", JSON.stringify({
        version: 1, trip: { name: "Sample trip", destination: "Example City", start: "2030-05-01", end: "2030-05-14" },
        groups: [{ id: "sample-old-town-1", area: "Old Town", checkIn: "2030-05-05", checkOut: "2030-05-08", guests: 2 }],
        listings: [quote("a", 42000), quote("b", 39000)],
        comparison: { target: null, rates: {} },
        activities: [],
        quoteOrder: "manual",
      }))
    })
    await page.reload()
    const frame = page.getByTestId("quote-frame")
    await expect(frame.getByRole("group")).toHaveCount(0)
    await expect(frame.locator("select, input")).toHaveCount(0)
    // The table header starts at the top of the frame.
    const frameBox = (await frame.boundingBox())!
    const header = (await frame.getByRole("columnheader", { name: "Listing" }).boundingBox())!
    expect(header.y - frameBox.y).toBeLessThan(2)
  })

  test("shows a bordered empty state with one centered Add quote", async ({ page }) => {
    await seedQuotes(page)
    await page.getByRole("tab", { name: /Lakeside/ }).click()
    const message = page.getByText("No quotes for this stay yet.")
    await expect(message).toBeVisible()
    // No unused table, headers, or controls; one Add quote, inside the empty container.
    await expect(page.getByTestId("quote-frame")).toHaveCount(0)
    await expect(page.getByRole("table")).toHaveCount(0)
    await expect(page.getByTestId("summary-row").getByRole("button", { name: "Add quote" })).toHaveCount(0)
    await expect(page.getByRole("button", { name: "Edit stay" })).toBeVisible()
    const add = page.getByRole("button", { name: "Add quote" })
    await expect(add).toHaveCount(1)

    const box = message.locator("..")
    const style = await box.evaluate((el) => {
      const cs = getComputedStyle(el)
      return { border: cs.borderTopWidth, rounded: parseFloat(cs.borderTopLeftRadius) > 0 }
    })
    expect(style).toEqual({ border: "1px", rounded: true })
    const container = (await box.boundingBox())!
    const text = (await message.boundingBox())!
    const button = (await add.boundingBox())!
    const mid = container.x + container.width / 2
    for (const item of [text, button]) expect(Math.abs(item.x + item.width / 2 - mid)).toBeLessThan(1)
    expect(button.y).toBeGreaterThan(text.y + text.height)
    expect(button.y + button.height).toBeLessThan(container.y + container.height)
    await noHorizontalScroll(page)

    // It opens the add panel for this stay.
    await add.click()
    const sheet = page.getByRole("dialog", { name: "Add quote" })
    await expect(sheet.getByLabel("Stay", { exact: true })).toHaveValue("sample-lakeside")
  })

  test("keeps currency controls in a compact toolbar at the top of the frame", async ({ page }) => {
    await seedQuotes(page, { target: "PHP", rates: { "JPY:PHP": 0.37 } })
    const frame = page.getByTestId("quote-frame")
    const toolbar = frame.getByRole("group", { name: "Currency conversion" })
    const frameBox = (await frame.boundingBox())!
    const currencies = (await toolbar.getByLabel("Currencies").boundingBox())!
    expect(currencies.y - frameBox.y).toBeLessThanOrEqual(13)
    const firstHeading = (await frame.getByRole("heading").first().boundingBox())!
    const toolbarBox = (await toolbar.boundingBox())!
    expect(firstHeading.y).toBeGreaterThan(toolbarBox.y + toolbarBox.height)

    // Every control keeps its accessible name, without visible field labels.
    const controls = ["Currencies", "Manual JPY rate", "Manual USD rate"]
    for (const label of controls) await expect(toolbar.getByLabel(label, { exact: true })).toBeVisible()
    for (const text of controls) await expect(page.getByText(text, { exact: true })).not.toBeInViewport()
    await expect(toolbar.getByText("USD quotes stay separate until you enter a rate.")).toBeVisible()

    // Nothing overlaps, and nothing widens the page.
    const boxes = await Promise.all(controls.map(async (label) => (await toolbar.getByLabel(label, { exact: true }).boundingBox())!))
    for (const [i, a] of boxes.entries()) {
      for (const b of boxes.slice(i + 1)) {
        const overlaps = a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height
        expect(overlaps).toBe(false)
      }
      expect(a.x + a.width).toBeLessThanOrEqual(frameBox.x + frameBox.width)
    }
    await noHorizontalScroll(page)

    // Controls still work: comparing separately splits the converted list by currency again.
    await expect(page.getByRole("table", { name: "Converted to PHP" })).toBeVisible()
    await toolbar.getByLabel("Currencies").selectOption("")
    await expect(page.getByRole("table", { name: "Converted to PHP" })).toHaveCount(0)
    for (const currency of ["JPY", "PHP", "USD"]) await expect(page.getByRole("table", { name: `Priced in ${currency}` })).toBeVisible()
  })

  test("reaches Edit stay, Add quote, the currency toolbar, then the list by keyboard and gets focus back on close", async ({ page }, info) => {
    test.skip(info.project.name === "mobile", "Keyboard flow runs on desktop")
    await seedQuotes(page)
    const edit = page.getByRole("button", { name: "Edit stay" })
    const add = page.getByRole("button", { name: "Add quote" })
    await edit.focus()
    await expect(page.locator("[data-slot=tooltip-content]").filter({ hasText: "Edit stay" })).toBeVisible()
    for (const next of [
      add,
      page.getByLabel("Currencies"),
      page.getByRole("button", { name: "Reorder Flat a" }),
      page.getByRole("button", { name: "Flat a", exact: true }),
    ]) {
      await page.keyboard.press("Tab")
      await expect(next).toBeFocused()
    }
    // Edit stay opens the stay dialog and returns focus to the pencil.
    await edit.focus()
    await page.keyboard.press("Enter")
    await expect(page.getByRole("dialog", { name: "Edit stay" })).toBeVisible()
    await page.keyboard.press("Escape")
    await expect(edit).toBeFocused()
    await add.focus()
    await page.keyboard.press("Enter")
    const sheet = page.getByRole("dialog", { name: "Add quote" })
    await expect(sheet.getByLabel("Name")).toBeFocused()
    await page.keyboard.press("Escape")
    await expect(sheet).toBeHidden()
    await expect(add).toBeFocused()
  })
})

test.describe("quote ordering", () => {
  // Saved in the user's own order: not cheapest first, with a PHP quote and one for other dates.
  async function seedOrdered(page: Page) {
    await page.evaluate(() => {
      const quote = (id: string, name: string, extra: object = {}) => ({
        id, groupId: "sample-old-town-1", name, area: "Riverside", source: "Airbnb", url: "", checkIn: "2030-05-05",
        checkOut: "2030-05-08", guests: 2, currency: "JPY", amount: 42000, basis: "stay", extraFees: 0,
        feeCertainty: "confirmed", notes: "", booked: false, createdAt: "2026-10-01T00:00:00.000Z",
        updatedAt: "2026-10-01T00:00:00.000Z", ...extra,
      })
      localStorage.setItem("japan-stay-compare:v1", JSON.stringify({
        version: 1, trip: { name: "Sample trip", destination: "Example City", start: "2030-05-01", end: "2030-05-14" },
        groups: [{ id: "sample-old-town-1", area: "Old Town", checkIn: "2030-05-05", checkOut: "2030-05-08", guests: 2 }],
        listings: [
          quote("a", "Favorite loft", { amount: 60000 }),
          quote("p", "Peso place", { currency: "PHP", amount: 15000 }),
          quote("b", "Budget room", { amount: 30000 }),
          quote("c", "Corner flat", { amount: 45000 }),
          quote("o", "Other dates", { checkIn: "2030-05-06" }),
        ],
        comparison: { target: null, rates: {} },
        activities: [],
        quoteOrder: "manual",
      }))
    })
    await page.reload()
  }
  const names = (page: Page, table = "Priced in JPY") =>
    page
      .getByRole("table", { name: table })
      .getByTestId("quote-row")
      .evaluateAll((rows) => rows.map((row) => row.querySelectorAll("button")[1].textContent))
  const saved = (page: Page) =>
    page.evaluate(() => JSON.parse(localStorage.getItem("japan-stay-compare:v1")!).listings.map((l: { id: string }) => l.id))
  const lowest = (page: Page) =>
    page.getByTestId("quote-row").filter({ has: page.getByText("Lowest", { exact: true }) }).locator("button").nth(1)

  test("shows the saved order and drags a quote with the mouse, within its own list", async ({ page }, info) => {
    test.skip(info.project.name === "mobile", "Mouse dragging runs on desktop")
    await seedOrdered(page)
    await expect.poll(() => names(page)).toEqual(["Favorite loft", "Budget room", "Corner flat"])
    await expect(lowest(page)).toHaveText("Budget room")
    const totals = await page.getByTestId("row-total").allTextContents()

    const handle = page.getByRole("button", { name: "Reorder Corner flat" })
    const from = (await handle.boundingBox())!
    const target = (await page.getByRole("button", { name: "Reorder Favorite loft" }).boundingBox())!
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2)
    await page.mouse.down()
    await page.mouse.move(from.x + from.width / 2, from.y - 10, { steps: 4 })
    const row = page.getByTestId("quote-row").filter({ hasText: "Corner flat" })
    await expect(row).toHaveAttribute("data-dragging", "")
    // Far past the table: the row stays inside its own list.
    await page.mouse.move(from.x + from.width / 2 + 60, target.y - 400, { steps: 10 })
    const jpy = (await page.getByRole("table", { name: "Priced in JPY" }).locator("tbody").boundingBox())!
    expect((await row.boundingBox())!.y).toBeGreaterThanOrEqual(jpy.y - 1)
    await page.mouse.move(from.x + from.width / 2, target.y - 6, { steps: 6 })
    await page.mouse.up()
    await expect.poll(() => names(page)).toEqual(["Corner flat", "Favorite loft", "Budget room"])
    await expect(page.getByRole("dialog")).toHaveCount(0) // dragging does not open the quote
    // Other lists, prices, and the Lowest label are untouched.
    expect(await names(page, "Priced in PHP")).toEqual(["Peso place"])
    expect(await names(page, "Different dates or guests")).toEqual(["Other dates"])
    await expect(lowest(page)).toHaveText("Budget room")
    expect((await page.getByTestId("row-total").allTextContents()).sort()).toEqual([...totals].sort())
    expect(await saved(page)).toEqual(["c", "p", "a", "b", "o"])

    await page.reload()
    await expect.poll(() => names(page)).toEqual(["Corner flat", "Favorite loft", "Budget room"])
  })

  test("reorders with the keyboard from the handle, and from the row menu", async ({ page }, info) => {
    test.skip(info.project.name === "mobile", "Keyboard flow runs on desktop")
    await seedOrdered(page)
    const handle = page.getByRole("button", { name: "Reorder Favorite loft" })
    await expect(handle).toHaveAccessibleDescription(/press Space or Enter/)
    // Each list has its own live region; wait for each step to be announced, as a screen reader user would.
    const press = async (key: string, said: string) => {
      await page.keyboard.press(key)
      await expect(page.locator("[id^=DndLiveRegion]").filter({ hasText: said })).toHaveCount(1)
      if (key === "Space") await page.waitForTimeout(50)
    }
    await handle.focus()
    await press("Space", "Picked up Favorite loft at position 1 of 3.")
    await press("ArrowDown", "Favorite loft is over position 2 of 3.")
    await press("Space", "Moved Favorite loft to position 2 of 3.")
    await expect.poll(() => names(page)).toEqual(["Budget room", "Favorite loft", "Corner flat"])
    await expect(handle).toBeFocused()

    const actions = page.getByRole("button", { name: "Actions for Corner flat" })
    await actions.click()
    const menu = page.getByRole("menu")
    await expect(menu.getByRole("menuitem")).toHaveText(["Edit", "Mark as booked", "Move up", "Move down", "Delete"])
    await expect(menu.getByRole("menuitem", { name: "Move down" })).toHaveAttribute("aria-disabled", "true")
    await menu.getByRole("menuitem", { name: "Move up" }).click()
    await expect.poll(() => names(page)).toEqual(["Budget room", "Corner flat", "Favorite loft"])
    await expect(actions).toBeFocused()
    expect(await saved(page)).toEqual(["b", "p", "c", "a", "o"])
  })

  test("drags the handle on touch without scrolling the page or opening the quote", async ({ page }, info) => {
    test.skip(info.project.name !== "mobile", "Touch runs on phones")
    await seedOrdered(page)
    await noHorizontalScroll(page)
    await insideViewport(page, "[data-testid=quote-frame]")
    const cdp = await page.context().newCDPSession(page)
    const touch = (type: "touchStart" | "touchMove" | "touchEnd", point?: { x: number; y: number }) =>
      cdp.send("Input.dispatchTouchEvent", { type, touchPoints: point ? [{ x: Math.round(point.x), y: Math.round(point.y) }] : [] })
    await page.getByRole("button", { name: "Reorder Favorite loft" }).scrollIntoViewIfNeeded()
    const scrollY = await page.evaluate(() => window.scrollY)
    const from = (await page.getByRole("button", { name: "Reorder Favorite loft" }).boundingBox())!
    const to = (await page.getByRole("button", { name: "Reorder Corner flat" }).boundingBox())!
    const start = { x: from.x + from.width / 2, y: from.y + from.height / 2 }
    await touch("touchStart", start)
    for (let i = 1; i <= 10; i++) await touch("touchMove", { x: start.x, y: start.y + ((to.y + to.height - start.y + 6) * i) / 10 })
    await touch("touchEnd")
    await expect.poll(() => names(page)).toEqual(["Budget room", "Corner flat", "Favorite loft"])
    expect(await page.evaluate(() => window.scrollY)).toBe(scrollY)
    await expect(page.getByRole("dialog")).toHaveCount(0)
    await expect(lowest(page)).toHaveText("Budget room")
    await noHorizontalScroll(page)
  })
})

test.describe("tactile theme effects", () => {
  test.skip(({ isMobile }) => isMobile, "Computed styles are the same on mobile; checked on desktop")

  // The theme's layers, identified by their geometry in the computed box-shadow.
  const layers = (shadow: string) => ({
    edge: shadow.includes("0px 1px 0px 0px inset"), // raised or filled top highlight
    recess: shadow.includes("0px 1px 2px 0px inset"), // recessed field or pressed control
    elevation: /oklch\(0 0 0 \/ 0\.05\) 0px 1px 3px 0px(?! inset)/.test(shadow), // --shadow-layers-xs
    ring: shadow.includes("0px 0px 0px 3px"),
  })
  const read = (locator: Locator) =>
    locator.evaluate((el) => ({ shadow: getComputedStyle(el).boxShadow, image: getComputedStyle(el).backgroundImage }))

  for (const mode of ["light", "dark"] as const) {
    test(`applies to targeted controls only, in ${mode}`, async ({ page }) => {
      if (mode === "dark") await page.getByRole("button", { name: "Switch to dark mode" }).click()
      await page.evaluate(() => {
        localStorage.setItem("japan-stay-compare:v1", JSON.stringify({
          version: 1, trip: { name: "Sample trip", destination: "Example City", start: "2030-05-01", end: "2030-05-14" },
          groups: [{ id: "sample-old-town-1", area: "Old Town", checkIn: "2030-05-05", checkOut: "2030-05-08", guests: 2 }],
          listings: [{ id: "a", groupId: "sample-old-town-1", name: "Flat a", area: "", source: "Airbnb", url: "",
            checkIn: "2030-05-05", checkOut: "2030-05-08", guests: 2, currency: "JPY", amount: 42000, basis: "stay",
            extraFees: 0, feeCertainty: "confirmed", notes: "", createdAt: "2026-10-01T00:00:00.000Z",
            updatedAt: "2026-10-01T00:00:00.000Z" }],
          // A conversion target, so the currency fields show.
          comparison: { target: "PHP", rates: {} },
        }))
      })
      await page.reload()
      await page.mouse.move(1, 1)
      const add = page.getByRole("main").getByRole("button", { name: "Add quote" })
      await expect(add).toHaveAttribute("data-variant", "default")
      await expect(add).toHaveAttribute("data-size", "sm")

      // Default: filled edge, lift gradient, and the xs elevation.
      let s = await read(add)
      expect(layers(s.shadow)).toMatchObject({ edge: true, elevation: true })
      expect(s.image).toContain("linear-gradient")
      // Outline: raised edge, no elevation.
      s = await read(page.getByRole("button", { name: "Backup" }))
      expect(layers(s.shadow)).toMatchObject({ edge: true, elevation: false })
      // Fields and the tab track: recessed.
      for (const field of [page.getByLabel("Currencies"), page.locator("[data-slot=tabs-list]")]) {
        expect(layers((await read(field)).shadow).recess).toBe(true)
      }
      // Not targeted: ghost buttons, the sidebar, and listing rows stay flat.
      for (const flat of [
        page.getByRole("button", { name: "Edit stay" }),
        page.getByRole("button", { name: "Actions for Flat a" }),
        page.getByRole("button", { name: "Toggle Sidebar" }),
        page.getByRole("button", { name: /Sample trip/ }),
        page.getByRole("link", { name: "Stays", exact: true }),
        page.locator("[data-slot=sidebar-inner]"),
        page.getByTestId("quote-row"),
      ]) {
        s = await read(flat)
        expect(s.shadow).toBe("none")
        expect(s.image).toBe("none")
      }

      // Hover shifts --primary by the theme's mix, not a translucent wash.
      const expected = await page.evaluate(() => {
        const root = getComputedStyle(document.documentElement)
        const probe = document.createElement("div")
        probe.style.color = `color-mix(in oklab, ${root.getPropertyValue("--primary")}, ${root.getPropertyValue("--foreground")} 10%)`
        document.body.append(probe)
        const value = getComputedStyle(probe).color
        probe.remove()
        return value
      })
      await add.hover()
      await expect.poll(() => add.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe(expected)

      // Pressed: sinks, losing the edge and elevation.
      await page.mouse.down()
      await expect.poll(async () => layers((await read(add)).shadow)).toMatchObject({ recess: true, edge: false, elevation: false })
      await page.mouse.up()
      await page.keyboard.press("Escape")
      await page.mouse.move(1, 1)

      // Keyboard focus: the ring sits on top of the tactile layers.
      await page.keyboard.press("Shift")
      await add.focus()
      await expect.poll(async () => layers((await read(add)).shadow)).toMatchObject({ edge: true, elevation: true, ring: true })

      // Disabled and opted-out controls are flat.
      await add.blur()
      for (const attribute of ["disabled", "data-tactile"]) {
        await add.evaluate((el, name) => el.setAttribute(name, name === "disabled" ? "" : "flat"), attribute)
        // box-shadow transitions, so wait for it to settle.
        await expect.poll(() => read(add), { message: attribute }).toEqual({ shadow: "none", image: "none" })
        await add.evaluate((el, name) => el.removeAttribute(name), attribute)
      }
    })
  }

  for (const mode of ["light", "dark"] as const) {
    test(`the price basis toggle shows its selected option clearly in ${mode}`, async ({ page }) => {
      if (mode === "dark") await page.getByRole("button", { name: "Switch to dark mode" }).click()
      await page.getByRole("main").getByRole("button", { name: "Add quote" }).click()
      const group = page.getByRole("dialog", { name: "Add quote" }).getByRole("group", { name: "Price shown as" })
      await page.waitForFunction(() => document.getAnimations().every((a) => a.timeline !== document.timeline || a.playState === "finished"))
      // WCAG contrast between an item's painted fill (over the sheet) and its label, and between the two fills.
      const measure = () =>
        group.locator("[data-slot=toggle-group-item]").evaluateAll((items) => {
          const canvas = document.createElement("canvas")
          canvas.width = canvas.height = 1
          const ctx = canvas.getContext("2d", { willReadFrequently: true })!
          const paint = (...colors: string[]) => {
            ctx.clearRect(0, 0, 1, 1)
            for (const color of colors) { ctx.fillStyle = color; ctx.fillRect(0, 0, 1, 1) }
            return [...ctx.getImageData(0, 0, 1, 1).data].slice(0, 3)
          }
          const lum = (rgb: number[]) => {
            const [r, g, b] = rgb.map((c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4 })
            return 0.2126 * r + 0.7152 * g + 0.0722 * b
          }
          const contrast = (a: number[], b: number[]) => {
            const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x)
            return (hi + 0.05) / (lo + 0.05)
          }
          const surface = getComputedStyle(items[0].closest("[role=dialog]")!).backgroundColor
          const parts = items.map((el) => {
            const style = getComputedStyle(el)
            const fill = paint(surface, style.backgroundColor)
            return { pressed: el.getAttribute("aria-pressed") === "true", fill, text: paint(surface, style.backgroundColor, style.color) }
          })
          const on = parts.find((p) => p.pressed)!
          const off = parts.find((p) => !p.pressed)!
          return { fills: contrast(on.fill, off.fill), labels: contrast(on.text, off.text), offLabel: contrast(off.text, off.fill) }
        })
      for (const option of ["Total for stay", "Per night"]) {
        await group.getByRole("button", { name: option }).click()
        await page.mouse.move(1, 1)
        await expect(group.getByRole("button", { name: option })).toHaveAttribute("aria-pressed", "true")
        await expect.poll(async () => (await measure()).fills, { message: `${option} fill` }).toBeGreaterThan(1.25)
        const result = await measure()
        expect(result.labels, `${option} label difference`).toBeGreaterThan(1.3)
        expect(result.offLabel, "unselected label stays readable (AA)").toBeGreaterThan(4.5)
      }
    })
  }

  test("transitions follow reduced motion", async ({ browser }) => {
    for (const [reducedMotion, duration] of [["no-preference", "0.15s"], ["reduce", "0s"]] as const) {
      const context = await browser.newContext({ reducedMotion })
      const page = await context.newPage()
      await page.goto("/")
      const add = page.getByRole("main").getByRole("button", { name: "Add quote" })
      await expect(add).toBeVisible()
      expect(await add.evaluate((el) => getComputedStyle(el).transitionDuration)).toBe(duration)
      await context.close()
    }
  })
})

test.describe("comparison table", () => {
  const longName = "Spacious family apartment with tatami room and two bathrooms near Kuramae station"
  async function seed(page: Page, comparison: object = { target: null, rates: {} }) {
    await page.evaluate(([settings, name]) => {
      const quote = (id: string, extra: object) => ({
        id, groupId: "sample-old-town-1", name: `Flat ${id}`, area: "Riverside", source: "Airbnb", url: "https://example.com/" + id,
        checkIn: "2030-05-05", checkOut: "2030-05-08", guests: 2, currency: "JPY", amount: 42000, basis: "stay",
        extraFees: 0, feeCertainty: "confirmed", notes: "", createdAt: "2026-10-01T00:00:00.000Z",
        updatedAt: "2026-10-01T00:00:00.000Z", ...extra,
      })
      localStorage.setItem("japan-stay-compare:v1", JSON.stringify({
        version: 1, trip: { name: "Sample trip", destination: "Example City", start: "2030-05-01", end: "2030-05-14" },
        groups: [{ id: "sample-old-town-1", area: "Old Town", checkIn: "2030-05-05", checkOut: "2030-05-08", guests: 2 }],
        listings: [
          quote("a", { name }),
          quote("b", { amount: 15000, basis: "nightly", extraFees: 6000, feeCertainty: "estimated" }),
          quote("c", { currency: "PHP", amount: 14500 }),
        ],
        comparison: settings,
      }))
    }, [comparison, longName] as const)
    await page.reload()
  }

  test("is a compact bordered table on wide layouts", async ({ page }, info) => {
    test.skip(info.project.name === "mobile", "Table layout")
    await seed(page)
    const table = page.getByRole("table", { name: "Priced in JPY" })
    const headers = table.getByRole("columnheader")
    await expect(headers).toHaveText(["Reorder", "Listing", "Stay total", "Per night", "Actions"])
    await expect(headers.first()).toHaveAccessibleName("Reorder")
    await expect(headers.last()).toHaveAccessibleName("Actions")
    await expect(table.getByRole("row")).toHaveCount(3) // header + 2 listings
    // The listed-price summary is gone; the original quote stays in the edit panel.
    await expect(page.getByText(/^Listed /)).toHaveCount(0)

    const row = table.getByTestId("quote-row").filter({ hasText: "Flat b" })
    const style = (testId: string) =>
      row.getByTestId(testId).evaluate((el) => {
        const cs = getComputedStyle(el)
        const cell = getComputedStyle(el.closest("td")!)
        return { size: cs.fontSize, weight: cs.fontWeight, numerals: cs.fontVariantNumeric, align: cell.textAlign }
      })
    const total = await style("row-total")
    expect(total).toEqual(await style("row-nightly"))
    expect(total).toMatchObject({ numerals: "tabular-nums", align: "right" })
    await expect(row.getByText("Fees estimated")).toBeVisible()

    // Columns line up across the currency sections.
    const right = (name: string, header: string) =>
      page.getByRole("table", { name }).getByRole("columnheader", { name: header }).evaluate((el) => el.getBoundingClientRect().right)
    for (const header of ["Stay total", "Per night"]) expect(await right("Priced in JPY", header)).toBe(await right("Priced in PHP", header))

    // Long names wrap inside the listing column instead of widening the page.
    const name = table.getByRole("button", { name: longName, exact: true })
    expect((await name.boundingBox())!.height).toBeGreaterThan(30)
    await noHorizontalScroll(page)

    // Bordered, rounded frame; plain header with a divider beneath it and none above; compact cells; dividers.
    const surfaces = await table.evaluate((el) => {
      const frame = getComputedStyle(el.closest("[data-testid=quote-frame]")!)
      const th = el.querySelector("th")!
      const td = el.querySelector("tbody td")!
      return {
        frame: { border: frame.borderTopWidth, rounded: parseFloat(frame.borderTopLeftRadius) > 0, clipped: frame.overflow },
        headerBg: getComputedStyle(el.querySelector("thead")!).backgroundColor,
        headerDivider: getComputedStyle(el.querySelector("thead tr")!).borderBottomWidth,
        toolbarDivider: getComputedStyle(el.closest("[data-testid=quote-frame]")!.firstElementChild!).borderBottomWidth,
        header: { height: Math.round(th.getBoundingClientRect().height), size: getComputedStyle(th).fontSize, weight: getComputedStyle(th).fontWeight },
        body: getComputedStyle(el).fontSize,
        cell: { y: getComputedStyle(td).paddingTop, x: getComputedStyle(td).paddingLeft, align: getComputedStyle(td).verticalAlign },
        divider: getComputedStyle(el.querySelector("tbody tr")!).borderBottomWidth,
      }
    })
    expect(surfaces).toEqual({
      frame: { border: "1px", rounded: true, clipped: "hidden" },
      headerBg: "rgba(0, 0, 0, 0)",
      headerDivider: "1px",
      toolbarDivider: "0px",
      header: { height: 40, size: "12px", weight: "500" },
      body: "14px",
      cell: { y: "12px", x: "16px", align: "middle" },
      divider: "1px",
    })
    // Rows are not clickable, so they get no hover fill; their buttons still respond.
    const actions = row.getByRole("button", { name: "Actions for Flat b" })
    const actionsBg = () => actions.evaluate((el) => getComputedStyle(el).backgroundColor)
    const restingActions = await actionsBg()
    await row.getByText("Fees estimated").hover()
    await page.waitForTimeout(250)
    expect(await row.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe("rgba(0, 0, 0, 0)")
    await actions.hover()
    await expect.poll(actionsBg).not.toBe(restingActions)
    expect(await row.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe("rgba(0, 0, 0, 0)")
    await actions.click()
    await expect(page.getByRole("menuitem", { name: "Edit" })).toBeVisible()
    expect(await row.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe("rgba(0, 0, 0, 0)")
    await page.keyboard.press("Escape")
  })

  test("keeps converted originals and lowest labels in table cells", async ({ page }, info) => {
    test.skip(info.project.name === "mobile", "Table layout")
    await seed(page, { target: "PHP", rates: { "JPY:PHP": 0.37 } })
    const table = page.getByRole("table", { name: "Converted to PHP" })
    const row = table.getByTestId("quote-row").filter({ hasText: "Flat b" })
    await expect(row.getByTestId("row-total")).toHaveText("≈ ₱18,870.00")
    await expect(row.getByText("¥51,000", { exact: true })).toBeVisible()
    await expect(row.getByText("¥17,000", { exact: true })).toBeVisible()
    await expect(table.getByText("Lowest at your rate")).toHaveCount(1)
  })

  test("stays a table and scrolls inside its frame when space is narrow", async ({ page }, info) => {
    if (info.project.name !== "mobile") {
      // Desktop window narrowed by the open sidebar.
      await page.setViewportSize({ width: 900, height: 900 })
    }
    await seed(page)
    const table = page.getByRole("table", { name: "Priced in JPY" })
    await expect(table.getByRole("columnheader")).toHaveText(["Reorder", "Listing", "Stay total", "Per night", "Actions"])
    await expect(table.getByRole("columnheader", { name: "Listing" })).toBeVisible()
    const row = table.getByTestId("quote-row").filter({ hasText: "Flat b" })
    await expect(row.getByText("per night", { exact: true })).toHaveCount(0)

    // The table scrolls sideways in its scroll area; the table's own container and the page do not.
    const scroller = table.locator("xpath=ancestor::*[@data-slot='scroll-area-viewport']")
    expect(await table.locator("xpath=..").evaluate((el) => getComputedStyle(el).overflowX)).toBe("visible")
    const fits = () => scroller.evaluate((el) => ({ scrolls: el.scrollWidth > el.clientWidth, left: el.scrollLeft }))
    expect(await fits()).toEqual({ scrolls: true, left: 0 })
    await insideViewport(page, "[data-testid=quote-frame]")
    await noHorizontalScroll(page)

    // Off-screen actions scroll fully into view when reached by keyboard.
    const actions = row.getByRole("button", { name: "Actions for Flat b" })
    await row.getByRole("button", { name: "Flat b", exact: true }).focus()
    await page.keyboard.press("Tab")
    await expect(row.getByRole("link", { name: /^Open Flat b/ })).toBeFocused()
    await page.keyboard.press("Tab")
    await expect(actions).toBeFocused()
    expect((await fits()).left).toBeGreaterThan(0)
    const frame = (await scroller.boundingBox())!
    const button = (await actions.boundingBox())!
    expect(button.x + button.width).toBeLessThanOrEqual(frame.x + frame.width + 0.5)
    await page.keyboard.press("Enter")
    await expect(page.getByRole("menuitem", { name: "Edit" })).toBeVisible()
    await page.keyboard.press("Escape")
    await expect(actions).toBeFocused()
    await noHorizontalScroll(page)
  })
})

test.describe("scrollbars and layout", () => {
  async function seedWide(page: Page) {
    await page.evaluate(() => {
      const quote = (id: string) => ({
        id, groupId: "sample-old-town-1", name: `Flat ${id}`, area: "Riverside", source: "Airbnb", url: "", checkIn: "2030-05-05",
        checkOut: "2030-05-08", guests: 2, currency: "JPY", amount: 42000, basis: "stay", extraFees: 0,
        feeCertainty: "confirmed", notes: "", createdAt: "2026-10-01T00:00:00.000Z", updatedAt: "2026-10-01T00:00:00.000Z",
      })
      localStorage.setItem("japan-stay-compare:v1", JSON.stringify({
        version: 1, trip: { name: "Sample trip", destination: "Example City", start: "2030-05-01", end: "2030-05-14" },
        groups: [{ id: "sample-old-town-1", area: "Old Town", checkIn: "2030-05-05", checkOut: "2030-05-08", guests: 2 }],
        listings: [quote("a"), quote("b")],
        comparison: { target: null, rates: {} },
      }))
    })
    await page.reload()
  }
  const opacity = (locator: Locator) => locator.evaluate((el) => getComputedStyle(el).opacity)

  test("table scrollbars stay hidden until hover, scrolling, or keyboard focus", async ({ page, context }, info) => {
    if (info.project.name !== "mobile") await page.setViewportSize({ width: 900, height: 900 })
    await seedWide(page)
    const area = page.getByTestId("quote-frame").locator("[data-slot=scroll-area]")
    const viewport = area.locator("[data-slot=scroll-area-viewport]")
    const bar = area.locator("[data-slot=scroll-area-scrollbar][data-orientation=horizontal]")
    await expect(bar).toHaveCount(1) // one horizontal scrollbar, from the scroll area only
    await page.mouse.move(1, 1)
    await expect.poll(() => opacity(bar)).toBe("0")

    if (info.project.name === "mobile") {
      // A real touch swipe scrolls the table and shows the bar, which fades again afterwards.
      await viewport.scrollIntoViewIfNeeded()
      const box = (await viewport.boundingBox())!
      const cdp = await context.newCDPSession(page)
      const swipe = cdp.send("Input.synthesizeScrollGesture", {
        x: Math.round(box.x + box.width / 2), y: Math.round(box.y + 60), xDistance: -120, yDistance: 0,
        gestureSourceType: "touch", speed: 400,
      })
      await expect.poll(() => opacity(bar), { intervals: [50] }).toBe("1")
      await swipe
      expect(await viewport.evaluate((el) => el.scrollLeft)).toBeGreaterThan(0)
      await expect.poll(() => opacity(bar)).toBe("0")
    } else {
      await area.hover()
      await expect.poll(() => opacity(bar)).toBe("1")
      await page.mouse.move(1, 1)
      await expect.poll(() => opacity(bar)).toBe("0")
      await area.hover()
      await page.mouse.wheel(60, 0)
      await expect.poll(() => viewport.evaluate((el) => el.scrollLeft)).toBeGreaterThan(0)
      await page.mouse.move(1, 1)
      await expect.poll(() => opacity(bar)).toBe("0")
    }

    // Keyboard: visible while focus is inside the table, hidden once it leaves.
    await page.getByRole("button", { name: "Flat a", exact: true }).focus()
    await page.keyboard.press("Shift+Tab")
    await page.keyboard.press("Tab")
    await expect(page.getByRole("button", { name: "Flat a", exact: true })).toBeFocused()
    await expect.poll(() => opacity(bar)).toBe("1")
    await page.getByRole("button", { name: "Add quote" }).focus()
    await expect.poll(() => opacity(bar)).toBe("0")
    await noHorizontalScroll(page)
  })

  test("other scroll areas use the same idle-hidden scrollbars", async ({ page }, info) => {
    test.skip(info.project.name !== "mobile", "Stay tabs only overflow on narrow screens")
    await page.evaluate(() => {
      const groups = ["Old Town", "Lakeside", "Kyoto", "Osaka"].map((area, i) => ({
        id: `g${i}`, area, checkIn: "2030-05-05", checkOut: "2030-05-08", guests: 2,
      }))
      localStorage.setItem("japan-stay-compare:v1", JSON.stringify({ version: 1, trip: { name: "Sample trip", destination: "Example City", start: "2030-05-01", end: "2030-05-14" }, groups, listings: [], comparison: { target: null, rates: {} } }))
    })
    await page.reload()
    const bar = page.locator("[data-slot=scroll-area]").filter({ has: page.getByRole("tablist") })
      .locator("[data-slot=scroll-area-scrollbar][data-orientation=horizontal]")
    await expect.poll(() => opacity(bar)).toBe("0")
    await page.getByRole("tab", { name: /Old Town/ }).focus()
    await page.keyboard.press("ArrowRight")
    await expect.poll(() => opacity(bar)).toBe("1")
  })

  test("tab strips fade only an edge with more tabs beyond it", async ({ page }, info) => {
    const strip = page.getByTestId("tab-strip")
    const viewport = strip.locator("[data-slot=scroll-area-viewport]")
    const fades = () =>
      viewport.evaluate((el) => {
        const style = getComputedStyle(el)
        return [style.getPropertyValue("--scroll-fade-s"), style.getPropertyValue("--scroll-fade-e")]
      })
    const scrollTo = (fraction: number) =>
      viewport.evaluate((el, f) => el.scrollTo({ left: (el.scrollWidth - el.clientWidth) * f }), fraction)

    // Three stays fit on a desktop and overflow on a phone.
    if (info.project.name === "mobile") {
      expect(await fades()).toEqual(["0px", "24px"])
      await scrollTo(1)
      await expect.poll(fades).toEqual(["24px", "0px"])
    } else {
      expect(await fades()).toEqual(["0px", "0px"])
    }

    await page.goto("/#/itinerary")
    await scrollTo(0)
    await expect.poll(fades).toEqual(["0px", "24px"])
    await scrollTo(0.5)
    await expect.poll(fades).toEqual(["24px", "24px"])
    await scrollTo(1)
    await expect.poll(fades).toEqual(["24px", "0px"])

    // Keyboard focus brings each day fully clear of the fade, until the strip reaches its end.
    await scrollTo(0)
    await page.getByRole("tab").first().focus()
    for (let i = 0; i < 13; i++) {
      await page.keyboard.press("ArrowRight")
      const { clear, atEnd } = await page.evaluate(() => {
        const vp = document.querySelector("[data-testid=tab-strip] [data-slot=scroll-area-viewport]")!
        const tab = document.activeElement!.getBoundingClientRect()
        const box = vp.getBoundingClientRect()
        return {
          clear: tab.left - box.left >= 23 && box.right - tab.right >= 23,
          atEnd: vp.scrollLeft >= vp.scrollWidth - vp.clientWidth - 1,
        }
      })
      expect(clear || atEnd).toBe(true)
    }

    // The mask would hide the viewport's own focus ring, so the strip shows one while the viewport has focus.
    await page.getByRole("tab").first().focus()
    await page.keyboard.press("Shift+Tab")
    await expect(viewport).toBeFocused()
    expect(await strip.evaluate((el) => getComputedStyle(el).boxShadow)).toContain("inset")
  })

  test("centers the content column and spans the header across the panel", async ({ page }, info) => {
    // Wide enough that the panel is larger than the column's max width.
    if (info.project.name !== "mobile") await page.setViewportSize({ width: 1440, height: 900 })
    await seedWide(page)
    const layout = await page.evaluate(() => {
      const inset = document.querySelector("[data-slot=sidebar-inset]")!.getBoundingClientRect()
      const frame = document.querySelector("[data-testid=quote-frame]")!.getBoundingClientRect()
      const tabs = document.querySelector("[data-slot=tabs-list]")!.getBoundingClientRect()
      const footer = document.querySelector("footer")!.getBoundingClientRect()
      const header = document.querySelector("header")!.getBoundingClientRect()
      const backup = document.querySelector("header [aria-label=Backup]")!.getBoundingClientRect()
      const trigger = document.querySelector("header [data-sidebar=trigger]")!.getBoundingClientRect()
      return {
        leftGap: frame.left - inset.left, rightGap: inset.right - frame.right, frameWidth: frame.width,
        tabsLeft: tabs.left - frame.left, footer: [footer.left - frame.left, footer.right - frame.right],
        header: [header.left - inset.left, inset.right - header.right],
        backupGap: inset.right - backup.right, triggerGap: trigger.left - inset.left,
      }
    })
    // The header spans the panel: trigger at the left, Backup at the right, both at normal edge padding.
    expect(layout.header.map(Math.round)).toEqual([0, 0])
    expect(Math.round(layout.backupGap)).toBe(16)
    expect(layout.triggerGap).toBeLessThan(16)
    // The column is centered, keeps its max width, and its contents (tabs, frame, footer) share a left edge.
    expect(Math.abs(layout.leftGap - layout.rightGap)).toBeLessThan(1)
    expect(layout.frameWidth).toBeLessThanOrEqual(1024 - 32)
    if (info.project.name !== "mobile") expect(layout.leftGap).toBeGreaterThan(60)
    expect(Math.abs(layout.tabsLeft)).toBeLessThan(1)
    expect(layout.footer.map((n) => Math.round(n))).toEqual([0, 0])
    await noHorizontalScroll(page)
  })
})

test.describe("stay tab reordering", () => {
  const order = (page: Page) => page.getByRole("tab").evaluateAll((tabs) => tabs.map((tab) => tab.getAttribute("data-stay-id")))
  const selected = (page: Page) => page.getByRole("tab", { selected: true }).getAttribute("data-stay-id")
  const centerOf = async (locator: Locator) => {
    const box = (await locator.boundingBox())!
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
  }
  const lakeside = (page: Page) => page.getByRole("tab", { name: /Lakeside/ })
  const firstOldTown = (page: Page) => page.getByRole("tab", { name: /May 5–8/ })

  test("drags a tab with the mouse without selecting it, and keeps the order after reload", async ({ page }, info) => {
    test.skip(info.project.name === "mobile", "Mouse dragging runs on desktop")
    expect(await order(page)).toEqual(["sample-old-town-1", "sample-lakeside", "sample-old-town-2"])

    // A click with a little hand tremor still just selects.
    const from = await centerOf(lakeside(page))
    await page.mouse.move(from.x, from.y)
    await page.mouse.down()
    await page.mouse.move(from.x + 3, from.y + 1)
    await page.mouse.up()
    await expect(lakeside(page)).toHaveAttribute("aria-selected", "true")
    await firstOldTown(page).click()
    expect(await selected(page)).toBe("sample-old-town-1")

    // Drag Lakeside in front of the first Old Town.
    const to = await centerOf(firstOldTown(page))
    await page.mouse.move(from.x, from.y)
    await page.mouse.down()
    await page.mouse.move(from.x - 10, from.y, { steps: 3 })
    await expect(lakeside(page)).toHaveAttribute("data-dragging", "")
    await page.mouse.move(to.x - 30, from.y + 40, { steps: 12 })
    const dragged = (await lakeside(page).boundingBox())!
    expect(Math.abs(dragged.y + dragged.height / 2 - from.y)).toBeLessThan(1) // stays on the strip's axis
    await page.mouse.up()
    await expect.poll(() => order(page)).toEqual(["sample-lakeside", "sample-old-town-1", "sample-old-town-2"])
    expect(await selected(page)).toBe("sample-old-town-1")
    await expect(lakeside(page)).not.toHaveAttribute("data-dragging", "")

    // Selecting by click works again right after.
    await page.waitForTimeout(450)
    await lakeside(page).click()
    expect(await selected(page)).toBe("sample-lakeside")

    await page.reload()
    await expect.poll(() => order(page)).toEqual(["sample-lakeside", "sample-old-town-1", "sample-old-town-2"])
    expect(await selected(page)).toBe("sample-lakeside")
  })

  test("moves the focused tab with Alt+Arrow and keeps arrow-key navigation", async ({ page }, info) => {
    test.skip(info.project.name === "mobile", "Keyboard flow runs on desktop")
    await firstOldTown(page).focus()
    await page.keyboard.press("Alt+ArrowRight")
    await expect.poll(() => order(page)).toEqual(["sample-lakeside", "sample-old-town-1", "sample-old-town-2"])
    await expect(firstOldTown(page)).toBeFocused()
    expect(await firstOldTown(page).evaluate((el) => el.matches(":focus-visible"))).toBe(true)
    await expect(page.getByText("Moved Old Town, May 5–8 to position 2 of 3.")).toBeAttached()
    await page.keyboard.press("ArrowLeft")
    await expect(lakeside(page)).toBeFocused()
    await page.keyboard.press("Enter")
    expect(await selected(page)).toBe("sample-lakeside")
    await page.reload()
    await expect.poll(() => order(page)).toEqual(["sample-lakeside", "sample-old-town-1", "sample-old-town-2"])
  })

  test("press-and-hold drags on touch; a swipe scrolls the strip and a tap selects", async ({ page }, info) => {
    test.skip(info.project.name !== "mobile", "Touch runs on phones")
    const cdp = await page.context().newCDPSession(page)
    const touch = (type: "touchStart" | "touchMove" | "touchEnd", point?: { x: number; y: number }) =>
      cdp.send("Input.dispatchTouchEvent", { type, touchPoints: point ? [{ x: Math.round(point.x), y: Math.round(point.y) }] : [] })
    const viewport = page.locator("[data-slot=scroll-area]").filter({ has: page.getByRole("tablist") })
      .locator("[data-slot=scroll-area-viewport]")

    // Press and hold Lakeside, then drag it in front of the first Old Town.
    const from = await centerOf(lakeside(page))
    const to = await centerOf(firstOldTown(page))
    await touch("touchStart", from)
    await page.waitForTimeout(350)
    await expect(lakeside(page)).toHaveAttribute("data-dragging", "")
    for (let i = 1; i <= 10; i++) await touch("touchMove", { x: from.x + ((to.x - 30 - from.x) * i) / 10, y: from.y })
    await touch("touchEnd")
    await expect.poll(() => order(page)).toEqual(["sample-lakeside", "sample-old-town-1", "sample-old-town-2"])
    expect(await selected(page)).toBe("sample-old-town-1")
    expect(await viewport.evaluate((el) => el.scrollLeft)).toBe(0)

    // A tap still selects.
    await page.waitForTimeout(450)
    await lakeside(page).tap()
    expect(await selected(page)).toBe("sample-lakeside")

    // A quick horizontal swipe scrolls the strip, without reordering or selecting.
    const strip = (await page.getByRole("tablist").boundingBox())!
    await cdp.send("Input.synthesizeScrollGesture", {
      x: Math.round(strip.x + strip.width / 2), y: Math.round(strip.y + strip.height / 2),
      xDistance: -150, yDistance: 0, gestureSourceType: "touch", speed: 1500,
    })
    await expect.poll(() => viewport.evaluate((el) => el.scrollLeft)).toBeGreaterThan(0)
    expect(await order(page)).toEqual(["sample-lakeside", "sample-old-town-1", "sample-old-town-2"])
    expect(await selected(page)).toBe("sample-lakeside")
    await page.reload()
    await expect.poll(() => order(page)).toEqual(["sample-lakeside", "sample-old-town-1", "sample-old-town-2"])
    expect(await selected(page)).toBe("sample-lakeside")
    await noHorizontalScroll(page)
  })
})

test.describe("itinerary", () => {
  const act = (id: string, name: string, time = "", extra: Record<string, string> = {}) => ({
    id, date: "2030-05-06", name, time, location: "", url: "", notes: "",
    createdAt: "2026-10-01T00:00:00.000Z", updatedAt: "2026-10-01T00:00:00.000Z", ...extra,
  })
  async function seedPlan(page: Page, activities = [act("a", "Breakfast", "07:30", { location: "Central Market" }), act("b", "Art museum", "10:00", { url: "https://maps.app.goo.gl/x" }), act("c", "Old Town walk")]) {
    await page.evaluate((list) => {
      const data = JSON.parse(localStorage.getItem("japan-stay-compare:v1") ?? "null") ?? {
        version: 1, trip: { name: "Sample trip", destination: "Example City", start: "2030-05-01", end: "2030-05-14" },
        groups: [{ id: "sample-old-town-1", area: "Old Town", checkIn: "2030-05-05", checkOut: "2030-05-08", guests: 2 }],
        listings: [],
        comparison: { target: null, rates: {} },
      }
      localStorage.setItem("japan-stay-compare:v1", JSON.stringify({ ...data, activities: list }))
      localStorage.setItem("japan-stay-compare:v1:selected-day", "2030-05-06")
    }, activities)
    await page.goto("/#/itinerary")
    await page.reload()
    await expect(page.getByRole("heading", { level: 1, name: "Itinerary" })).toBeVisible()
  }
  const names = (page: Page) =>
    page.getByTestId("activity-row").evaluateAll((rows) => rows.map((row) => row.querySelectorAll("button")[1].textContent))
  const savedNames = (page: Page) =>
    page.evaluate(() => JSON.parse(localStorage.getItem("japan-stay-compare:v1")!).activities.map((a: { name: string }) => a.name))

  test("starts empty with chronological day tabs and one Add activity", async ({ page }) => {
    await page.goto("/#/itinerary")
    const tabs = page.getByRole("tablist", { name: "Days" }).getByRole("tab")
    await expect(tabs).toHaveCount(14)
    await expect(tabs.first()).toContainText("May 1")
    await expect(tabs.last()).toContainText("May 14")
    await expect(tabs.first()).toHaveAttribute("aria-selected", "true")
    await expect(page.getByText("No activities for this day yet.")).toBeVisible()
    await expect(page.getByRole("button", { name: "Add activity" })).toHaveCount(1)
    await expect(page.getByRole("table")).toHaveCount(0)
    await noHorizontalScroll(page)

    // The last day can be reached and is brought into view when it is the remembered day.
    await tabs.last().click()
    await page.reload()
    await expect(tabs.last()).toHaveAttribute("aria-selected", "true")
    await expect(tabs.last()).toBeInViewport({ ratio: 1 })
  })

  test("day tabs show a count on every day and keep one width, even at two digits", async ({ page }) => {
    const many = Array.from({ length: 12 }, (_, i) => act(`m${i}`, `Stop ${i + 1}`))
    await seedPlan(page, [...many, act("x", "Dinner", "19:00", { date: "2030-05-08" })])
    const tabs = page.getByTestId("day-tab")
    await expect(tabs).toHaveCount(14)
    await expect(page.getByRole("tab", { name: "Monday, May 6, 12 activities" })).toHaveAttribute("aria-selected", "true")
    await expect(page.getByRole("tab", { name: "Wednesday, May 8, 1 activity" })).toBeVisible()
    await expect(page.getByRole("tab", { name: "Wednesday, May 1, 0 activities" })).toBeAttached()
    expect(await page.getByTestId("day-count").allTextContents()).toEqual(
      ["0", "0", "0", "0", "0", "12", "0", "1", "0", "0", "0", "0", "0", "0"],
    )
    await expect(page.getByRole("tablist", { name: "Days" })).not.toContainText("activit")

    const widths = await tabs.evaluateAll((els) => els.map((el) => Math.round(el.getBoundingClientRect().width)))
    expect(new Set(widths).size).toBe(1)
    // The icon sits in the same place on every day, with clear space after the weekday even at two digits.
    const layout = await tabs.evaluateAll((els) =>
      els.map((el) => {
        const tab = el.getBoundingClientRect()
        const icon = el.querySelector("svg")!.getBoundingClientRect()
        const weekday = el.querySelector("span > span")!.getBoundingClientRect()
        const count = el.querySelector("[data-testid=day-count]")!
        const range = document.createRange()
        range.selectNodeContents(count)
        return {
          iconOffset: Math.round(icon.left - tab.left),
          gap: icon.left - weekday.right,
          numberGap: Math.round(range.getBoundingClientRect().left - icon.right),
        }
      }),
    )
    expect(new Set(layout.map((item) => item.iconOffset)).size).toBe(1)
    expect(new Set(layout.map((item) => item.numberGap)).size).toBe(1)
    expect(Math.min(...layout.map((item) => item.gap))).toBeGreaterThanOrEqual(8)
    // The count never crowds the weekday, and nothing spills out of the tab.
    for (const tab of await tabs.all()) {
      expect(await tab.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true)
    }

    // Arrow keys still move between days; Enter selects.
    await page.getByRole("tab", { name: /May 6,/ }).focus()
    await page.keyboard.press("ArrowRight")
    await expect(page.getByRole("tab", { name: /May 7,/ })).toBeFocused()
    await page.keyboard.press("ArrowRight")
    await page.keyboard.press("Enter")
    await expect(page.getByRole("tab", { name: /May 8,/ })).toHaveAttribute("aria-selected", "true")
    await expect(page.getByTestId("activity-row")).toHaveCount(1)
    await noHorizontalScroll(page)
  })

  test("shares the Stays summary row, frame, and column alignment", async ({ page }) => {
    await seedPlan(page)
    const frame = page.getByTestId("activity-frame")
    await expect(page.getByRole("button", { name: "Add activity" })).toHaveCount(1)
    await expect(frame.getByRole("button", { name: "Add activity" })).toHaveCount(0)
    const summary = page.getByTestId("summary-row")
    const add = summary.getByRole("button", { name: "Add activity" })
    await expect(add).toHaveAttribute("data-size", "sm")
    const frameBox = (await frame.boundingBox())!
    const addBox = (await add.boundingBox())!
    const textBox = (await summary.locator("p").boundingBox())!
    // Right-aligned with the frame, beside the day summary and above the table, which starts at the frame's top.
    expect(Math.abs(frameBox.x + frameBox.width - (addBox.x + addBox.width))).toBeLessThan(1)
    expect(Math.abs(addBox.y + addBox.height / 2 - (textBox.y + textBox.height / 2))).toBeLessThan(1)
    expect(addBox.y + addBox.height).toBeLessThan(frameBox.y)
    const header = (await frame.getByRole("columnheader", { name: "Time" }).boundingBox())!
    expect(header.y - frameBox.y).toBeLessThan(2)
    if (page.viewportSize()!.width >= 768) {
      // On phones the strip runs edge to edge. The strip scrolls to the chosen day, so compare its scroll area.
      const tabs = (await page
        .getByRole("tablist", { name: "Days" })
        .locator("xpath=ancestor::*[@data-slot='scroll-area']")
        .boundingBox())!
      expect(Math.abs(tabs.x - frameBox.x)).toBeLessThan(1)
    }
    await expect(page.getByText("Staying in Old Town")).toBeVisible()
    const style = await frame.evaluate((el) => ({ radius: parseFloat(getComputedStyle(el).borderTopLeftRadius), border: getComputedStyle(el).borderTopWidth }))
    expect(style.radius).toBeGreaterThan(0)
    expect(style.border).toBe("1px")
    await expect(page.getByRole("columnheader", { name: "Time" })).toBeVisible()
    await expect(page.getByRole("link", { name: "Open in Google Maps for Art museum" })).toHaveAttribute("target", "_blank")
    await noHorizontalScroll(page)
  })

  test("reorders by dragging the handle with a mouse, and keeps the order", async ({ page }, info) => {
    test.skip(info.project.name === "mobile", "Mouse dragging runs on desktop")
    await seedPlan(page)
    const handle = page.getByRole("button", { name: "Reorder Old Town walk" })
    const from = (await handle.boundingBox())!
    const target = (await page.getByRole("button", { name: "Reorder Breakfast" }).boundingBox())!
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2)
    await page.mouse.down()
    await page.mouse.move(from.x + from.width / 2 + 40, from.y - 10, { steps: 4 })
    const row = page.getByTestId("activity-row").filter({ hasText: "Old Town walk" })
    await expect(row).toHaveAttribute("data-dragging", "")
    const box = (await row.boundingBox())!
    await page.mouse.move(from.x + from.width / 2 + 40, target.y - 6, { steps: 10 })
    const moved = (await row.boundingBox())!
    expect(Math.abs(moved.x - box.x)).toBeLessThan(1) // stays in its column
    await page.mouse.up()
    await expect.poll(() => names(page)).toEqual(["Old Town walk", "Breakfast", "Art museum"])
    await expect(page.getByRole("dialog")).toHaveCount(0) // dragging does not open the row
    await page.reload()
    await expect.poll(() => names(page)).toEqual(["Old Town walk", "Breakfast", "Art museum"])
  })

  test("reorders with the keyboard from the handle, and from the row menu", async ({ page }, info) => {
    test.skip(info.project.name === "mobile", "Keyboard flow runs on desktop")
    await seedPlan(page)
    const handle = page.getByRole("button", { name: "Reorder Breakfast" })
    await expect(handle).toHaveAccessibleDescription(/press Space or Enter/)
    // Each step is announced; wait for it as a screen reader user would.
    const live = page.locator("[id^=DndLiveRegion]")
    const press = async (key: string, said: string | RegExp) => {
      await page.keyboard.press(key)
      await expect(live).toHaveText(said)
      // dnd-kit starts listening for arrow keys on the tick after pickup; people never press that fast.
      if (key === "Space") await page.waitForTimeout(50)
    }
    await handle.focus()
    await press("Space", "Picked up Breakfast at position 1 of 3.")
    await press("ArrowDown", "Breakfast is over position 2 of 3.")
    await press("ArrowDown", "Breakfast is over position 3 of 3.")
    await press("Space", "Moved Breakfast to position 3 of 3.")
    await expect.poll(() => names(page)).toEqual(["Art museum", "Old Town walk", "Breakfast"])
    await expect(handle).toBeFocused()

    // Escape cancels a pickup.
    await press("Space", "Picked up Breakfast at position 3 of 3.")
    await press("ArrowUp", "Breakfast is over position 2 of 3.")
    await press("Escape", "Breakfast was not moved.")
    await expect.poll(() => names(page)).toEqual(["Art museum", "Old Town walk", "Breakfast"])

    const actions = page.getByRole("button", { name: "Actions for Breakfast" })
    await actions.click()
    await page.getByRole("menuitem", { name: "Move up" }).click()
    await expect.poll(() => names(page)).toEqual(["Art museum", "Breakfast", "Old Town walk"])
    await expect(actions).toBeFocused()
    expect(await savedNames(page)).toEqual(["Art museum", "Breakfast", "Old Town walk"])
  })

  test("drags the handle on touch, while the table still scrolls sideways in its frame", async ({ page }, info) => {
    test.skip(info.project.name !== "mobile", "Touch runs on phones")
    await seedPlan(page)
    const viewport = page.getByRole("table").locator("xpath=ancestor::*[@data-slot='scroll-area-viewport']")
    const overflow = await viewport.evaluate((el) => el.scrollWidth - el.clientWidth)
    expect(overflow).toBeGreaterThan(0)
    expect(await page.getByRole("table").locator("xpath=..").evaluate((el) => getComputedStyle(el).overflowX)).toBe("visible")
    await noHorizontalScroll(page)
    await insideViewport(page, "[data-testid=activity-frame]")

    // A swipe on the table scrolls it sideways without reordering.
    const cdp = await page.context().newCDPSession(page)
    const tableBox = (await page.getByRole("table").boundingBox())!
    await cdp.send("Input.synthesizeScrollGesture", {
      x: Math.round(tableBox.x + 250), y: Math.round(tableBox.y + 70), xDistance: -150, yDistance: 0, gestureSourceType: "touch", speed: 1500,
    })
    await expect.poll(() => viewport.evaluate((el) => el.scrollLeft)).toBeGreaterThan(0)
    expect(await names(page)).toEqual(["Breakfast", "Art museum", "Old Town walk"])
    await viewport.evaluate((el) => el.scrollTo({ left: 0 }))
    await page.waitForTimeout(600)
    await viewport.evaluate((el) => el.scrollTo({ left: 0 }))

    const touch = (type: "touchStart" | "touchMove" | "touchEnd", point?: { x: number; y: number }) =>
      cdp.send("Input.dispatchTouchEvent", { type, touchPoints: point ? [{ x: Math.round(point.x), y: Math.round(point.y) }] : [] })
    const from = (await page.getByRole("button", { name: "Reorder Breakfast" }).boundingBox())!
    const to = (await page.getByRole("button", { name: "Reorder Old Town walk" }).boundingBox())!
    const start = { x: from.x + from.width / 2, y: from.y + from.height / 2 }
    await touch("touchStart", start)
    for (let i = 1; i <= 10; i++) await touch("touchMove", { x: start.x, y: start.y + ((to.y + to.height - start.y + 6) * i) / 10 })
    await touch("touchEnd")
    await expect.poll(() => names(page)).toEqual(["Art museum", "Old Town walk", "Breakfast"])
    await noHorizontalScroll(page)
  })

  test("backs up activities and imports older backups without losing plans", async ({ page }, info) => {
    test.skip(info.project.name === "mobile", "Backup flow runs on desktop")
    await seedPlan(page)
    await page.getByRole("button", { name: "Backup" }).click()
    const download = page.waitForEvent("download")
    await page.getByRole("menuitem", { name: "Export backup" }).click()
    const file = JSON.parse(await (await (await download).createReadStream()).toArray().then((chunks) => Buffer.concat(chunks).toString()))
    expect(file.activities.map((a: { name: string }) => a.name)).toEqual(["Breakfast", "Art museum", "Old Town walk"])

    // A backup from before the itinerary: one new quote, no activities.
    const old = {
      format: "japan-stay-compare", version: 1,
      groups: [{ id: "sample-old-town-1", area: "Old Town", checkIn: "2030-05-05", checkOut: "2030-05-08", guests: 2 }],
      listings: [{
        id: "old-quote", groupId: "sample-old-town-1", name: "Old flat", area: "", source: "Airbnb", url: "",
        checkIn: "2030-05-05", checkOut: "2030-05-08", guests: 2, currency: "JPY", amount: 30000, basis: "stay",
        extraFees: 0, feeCertainty: "confirmed", notes: "", createdAt: "2026-10-01T00:00:00.000Z", updatedAt: "2026-10-01T00:00:00.000Z",
      }],
      comparison: { target: null, rates: {} },
    }
    await page.getByTestId("import-input").setInputFiles({ name: "old.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(old)) })
    const dialog = page.getByRole("dialog", { name: "Import backup" })
    await expect(dialog).toContainText("1 new quote to add")
    await dialog.getByRole("button", { name: "Import" }).click()
    await expect(dialog).toBeHidden()
    expect(await savedNames(page)).toEqual(["Breakfast", "Art museum", "Old Town walk"])

    // Importing our own export again adds nothing new.
    await page.getByTestId("import-input").setInputFiles({ name: "same.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(file)) })
    await expect(dialog).toContainText("3 activities already here, skipped")
    await expect(dialog.getByRole("button", { name: "Import" })).toBeDisabled()
    await dialog.getByRole("button", { name: "Cancel" }).click()

    await page.getByRole("link", { name: "Stays", exact: true }).click()
    await expect(page.getByTestId("quote-row")).toHaveCount(1)
  })
})

test.describe("booked quotes", () => {
  const quote = (id: string, name: string, amount: number) => ({
    id, groupId: "sample-old-town-1", name, area: "Harborside", source: "Airbnb", url: "https://www.airbnb.com/rooms/1",
    checkIn: "2030-05-05", checkOut: "2030-05-08", guests: 2, currency: "JPY", amount, basis: "stay",
    extraFees: 0, feeCertainty: "confirmed", notes: "", createdAt: "2026-10-01T00:00:00.000Z", updatedAt: "2026-10-01T00:00:00.000Z",
  })

  test("marks and unmarks from the row menu, with a Booked badge beside the name", async ({ page }) => {
    // Saved before booking existed: no booked field at all.
    await page.evaluate((listings) => {
      localStorage.setItem("japan-stay-compare:v1", JSON.stringify({
        version: 1, trip: { name: "Sample trip", destination: "Example City", start: "2030-05-01", end: "2030-05-14" },
        groups: [{ id: "sample-old-town-1", area: "Old Town", checkIn: "2030-05-05", checkOut: "2030-05-08", guests: 2 }],
        listings,
        comparison: { target: null, rates: {} },
      }))
    }, [quote("a", "Harborside loft", 30000), quote("b", "Riverside apartment with a long name near Sumida Park", 45000)])
    await page.reload()
    const row = page.getByTestId("quote-row").filter({ hasText: "Riverside" })
    await expect(page.getByTestId("booked-badge")).toHaveCount(0)

    await row.getByRole("button", { name: /^Actions for Riverside/ }).click()
    await page.getByRole("menuitem", { name: "Mark as booked" }).click()
    const badge = row.getByTestId("booked-badge")
    await expect(badge).toHaveText("Booked")
    await expect(page.getByText(/^Marked Riverside .* as booked$/)).toBeVisible()
    await expect(page.getByTestId("quote-row").filter({ hasText: "Harborside loft" })).toContainText("Lowest")
    await expect(row.getByRole("button", { name: /^Actions for Riverside/ })).toBeFocused()

    // Beside the name, inside the frame, with no page-level overflow on any screen.
    const name = (await row.getByRole("button", { name: /^Riverside/ }).boundingBox())!
    const badgeBox = (await badge.boundingBox())!
    expect(badgeBox.x).toBeGreaterThanOrEqual(name.x)
    expect(badgeBox.y).toBeGreaterThanOrEqual(name.y - 4)
    await noHorizontalScroll(page)

    // A visible outline in both themes.
    for (const theme of ["light", "dark"]) {
      if (theme === "dark") await withThemeButton(page, "Switch to dark mode", (button) => button.click())
      const style = await badge.evaluate((el) => {
        const cs = getComputedStyle(el)
        return { border: cs.borderTopWidth, color: cs.borderTopColor, bg: cs.backgroundColor }
      })
      expect(style.border).toBe("1px")
      expect(style.color).not.toBe("rgba(0, 0, 0, 0)")
      expect(style.bg).toBe("rgba(0, 0, 0, 0)")
    }

    await page.reload()
    await expect(row.getByTestId("booked-badge")).toBeVisible()
    await row.getByRole("button", { name: /^Actions for Riverside/ }).click()
    await page.getByRole("menuitem", { name: "Mark as not booked" }).click()
    await expect(page.getByTestId("booked-badge")).toHaveCount(0)
  })
})
