import { fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"
import { App } from "@/App"
import { Toaster } from "@/components/ui/sonner"
import { TooltipProvider } from "@/components/ui/tooltip"
import { STORAGE_KEY, defaultData, serializeExport } from "@/lib/storage"
import { THEME_KEY } from "@/lib/theme"
import type { Activity, AppData, Listing } from "@/lib/types"

function renderApp() {
  return render(
    <TooltipProvider>
      <App />
      <Toaster />
    </TooltipProvider>,
  )
}

function seed(listings: Partial<Listing>[]): AppData {
  const data = defaultData()
  data.listings = listings.map((overrides, index) => ({
    id: `seed-${index}`,
    groupId: "sample-old-town-1",
    name: `Seed ${index}`,
    area: "",
    source: "Airbnb",
    url: "",
    checkIn: "2030-05-05",
    checkOut: "2030-05-08",
    guests: 2,
    currency: "JPY",
    amount: 30000,
    basis: "stay",
    extraFees: 0,
    feeCertainty: "confirmed",
    notes: "",
    booked: false,
    createdAt: "2026-10-01T00:00:00.000Z",
    updatedAt: "2026-10-01T00:00:00.000Z",
    ...overrides,
  }))
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
  return data
}

function rows() {
  return screen.queryAllByTestId("quote-row")
}

/** Quote names in one table, top to bottom. The first button in a row is its reorder handle; the name is next. */
function namesIn(tableName: string) {
  const table = screen.getByRole("table", { name: tableName })
  return within(table)
    .getAllByTestId("quote-row")
    .map((row) => within(row).getAllByRole("button")[1].textContent)
}

async function openAddSheet(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "Add quote" }))
  return await screen.findByRole("dialog", { name: "Add quote" })
}

describe("App", () => {
  it("prefills the three trip stays and starts empty", () => {
    renderApp()
    const tabs = screen.getAllByRole("tab")
    expect(tabs.map((tab) => tab.textContent)).toEqual([
      "Old TownMay 5–8 · 2 guests",
      "LakesideMay 8–10 · 4 guests",
      "Old TownMay 10–14 · 4 guests",
    ])
    expect(screen.getByText("No quotes for this stay yet.")).toBeInTheDocument()
    expect(screen.getByText(/saved in this browser only/i)).toBeInTheDocument()
  })

  it("shows the trip selector and links to the Stays and Itinerary pages", async () => {
    const user = userEvent.setup()
    renderApp()
    const nav = screen.getByRole("list", { name: "Pages" })
    const stays = within(nav).getByRole("link", { name: "Stays" })
    expect(stays).toHaveAttribute("aria-current", "page")
    const itinerary = within(nav).getByRole("link", { name: "Itinerary" })
    expect(itinerary).toHaveAttribute("href", "#/itinerary")
    expect(itinerary).not.toHaveAttribute("aria-current")
    expect(screen.getByRole("heading", { level: 1, name: "Stays" })).toBeInTheDocument()

    await user.click(itinerary)
    expect(await screen.findByRole("heading", { level: 1, name: "Itinerary" })).toBeInTheDocument()
    expect(within(nav).getByRole("link", { name: "Itinerary" })).toHaveAttribute("aria-current", "page")
    expect(screen.getByRole("tablist", { name: "Days" })).toBeInTheDocument()
    expect(document.title).toBe("Itinerary · Travel Planner")
    await user.click(within(nav).getByRole("link", { name: "Stays" }))
    expect(await screen.findByRole("heading", { level: 1, name: "Stays" })).toBeInTheDocument()
    expect(screen.getByRole("tablist", { name: "Stays" })).toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: /Sample trip/ }))
    const items = await screen.findAllByRole("menuitemradio")
    expect(items).toHaveLength(1)
    expect(items[0]).toHaveTextContent("Sample tripExample City · May 1–14, 2030")
    expect(items[0]).toHaveAttribute("aria-checked", "true")
  })

  it("puts one Add quote button beside the summary or in the empty state, and has no Sort", async () => {
    seed([{ name: "Ueno studio" }, { name: "Riverside flat", amount: 40000 }])
    const user = userEvent.setup()
    const { container } = renderApp()
    const addButtons = () =>
      [...container.querySelectorAll("button")].filter((button) => button.textContent?.trim() === "Add quote")
    expect(addButtons()).toHaveLength(1)
    expect(container.querySelector("header")).not.toHaveTextContent("Add quote")
    expect(within(container.querySelector("header")!).getByRole("button", { name: "Backup" })).toBeInTheDocument()
    expect(screen.queryByLabelText("Sort")).not.toBeInTheDocument()
    // Beside the stay summary, outside the table frame; one currency needs no conversion controls.
    const summary = screen.getByTestId("summary-row")
    expect(within(summary).getByRole("button", { name: "Add quote" })).toBeInTheDocument()
    expect(within(summary).getByRole("button", { name: "Edit stay" })).toBeInTheDocument()
    expect(within(screen.getByTestId("quote-frame")).queryByRole("button", { name: "Add quote" })).not.toBeInTheDocument()
    expect(screen.queryByRole("group", { name: "Currency conversion" })).not.toBeInTheDocument()

    // An empty stay has the button only in its empty state.
    await user.click(screen.getByRole("tab", { name: /Lakeside/ }))
    expect(screen.getByText("No quotes for this stay yet.")).toBeInTheDocument()
    expect(within(screen.getByTestId("summary-row")).queryByRole("button", { name: "Add quote" })).not.toBeInTheDocument()
    expect(addButtons()).toHaveLength(1)

    // New quotes default to the selected stay, and focus returns to the button on close.
    const emptyAdd = screen.getByRole("button", { name: "Add quote" })
    await user.click(emptyAdd)
    const sheet = await screen.findByRole("dialog", { name: "Add quote" })
    expect(within(sheet).getByLabelText("Stay")).toHaveValue("sample-lakeside")
    expect(within(sheet).getByLabelText("Check-in")).toHaveValue("2030-05-08")
    expect(within(sheet).getByLabelText("Guests")).toHaveValue(4)
    await user.click(within(sheet).getByRole("button", { name: "Cancel" }))
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Add quote" })).not.toBeInTheDocument())
    await waitFor(() => expect(emptyAdd).toHaveFocus())
  })

  it("has exactly one theme toggle", () => {
    renderApp()
    expect(screen.getAllByRole("button", { name: /Switch to (dark|light) mode/ })).toHaveLength(1)
  })

  it("starts light and toggles the theme both ways from the sidebar", async () => {
    const user = userEvent.setup()
    renderApp()
    const root = document.documentElement
    expect(root).not.toHaveClass("dark")

    await user.click(screen.getByRole("button", { name: "Switch to dark mode" }))
    expect(root).toHaveClass("dark")
    expect(localStorage.getItem(THEME_KEY)).toBe("dark")

    await user.click(screen.getByRole("button", { name: "Switch to light mode" }))
    expect(root).not.toHaveClass("dark")
    expect(localStorage.getItem(THEME_KEY)).toBe("light")
    expect(screen.getByRole("button", { name: "Switch to dark mode" })).toBeInTheDocument()
  })

  it("adds a nightly quote with fees, shows the live total, and persists it", async () => {
    const user = userEvent.setup()
    const { unmount } = renderApp()
    const sheet = await openAddSheet(user)

    // Defaults to the selected stay.
    expect(within(sheet).getByLabelText("Stay")).toHaveValue("sample-old-town-1")
    expect(within(sheet).getByLabelText("Check-in")).toHaveValue("2030-05-05")
    expect(within(sheet).getByLabelText("Guests")).toHaveValue(2)

    await user.type(within(sheet).getByLabelText("Name"), "Riverside flat")
    await user.click(within(sheet).getByRole("button", { name: "Per night" }))
    await user.selectOptions(within(sheet).getByLabelText("Currency"), "JPY")
    await user.type(within(sheet).getByLabelText("Price per night"), "15,000")
    await user.type(within(sheet).getByLabelText("Extra fees not included above"), "6000")
    await user.click(within(sheet).getByRole("radio", { name: "All-in confirmed" }))

    expect(within(sheet).getByTestId("preview-total")).toHaveTextContent("¥51,000")
    expect(within(sheet).getByTestId("preview-nightly")).toHaveTextContent("¥17,000")
    expect(within(sheet).getByTestId("preview-per-person")).toHaveTextContent("¥8,500")
    expect(within(sheet).getByText("Per person / night, 2 guests")).toBeInTheDocument()

    // The split follows the guest field live.
    const guests = within(sheet).getByLabelText("Guests")
    await user.clear(guests)
    expect(within(sheet).getByTestId("preview-per-person")).toHaveTextContent("Enter guests")
    await user.type(guests, "3")
    expect(within(sheet).getByTestId("preview-per-person")).toHaveTextContent("¥5,667")
    await user.clear(guests)
    await user.type(guests, "2")

    await user.click(within(sheet).getByRole("button", { name: "Add quote" }))
    await waitFor(() => expect(rows()).toHaveLength(1))
    expect(within(rows()[0]).getByTestId("row-total")).toHaveTextContent("¥51,000")
    expect(within(rows()[0]).getByTestId("row-nightly")).toHaveTextContent("¥17,000")
    expect(within(rows()[0]).getByTestId("row-per-person")).toHaveTextContent("¥8,500")
    // The row no longer repeats the listed price; the original quote lives in the edit panel and saved data.
    expect(within(rows()[0]).queryByText(/Listed/)).not.toBeInTheDocument()
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY)!).listings[0]
    expect(saved).toMatchObject({ amount: 15000, basis: "nightly", extraFees: 6000 })

    unmount()
    renderApp()
    expect(rows()).toHaveLength(1)
    await user.click(screen.getByRole("button", { name: "Riverside flat" }))
    const edit = await screen.findByRole("dialog", { name: "Edit quote" })
    expect(within(edit).getByRole("button", { name: "Per night" })).toHaveAttribute("aria-pressed", "true")
    expect(within(edit).getByLabelText("Price per night")).toHaveValue("15000")
    expect(within(edit).getByLabelText("Extra fees not included above")).toHaveValue("6000")
  })

  it("rejects invalid input before saving", async () => {
    const user = userEvent.setup()
    renderApp()
    const sheet = await openAddSheet(user)
    await user.type(within(sheet).getByLabelText("Link"), "javascript:alert(1)")
    await user.clear(within(sheet).getByLabelText("Check-out"))
    await user.type(within(sheet).getByLabelText("Check-out"), "2030-05-05")
    await user.click(within(sheet).getByRole("button", { name: "Add quote" }))

    expect(within(sheet).getByText("Enter a name.")).toBeInTheDocument()
    expect(within(sheet).getByText("Use a full http:// or https:// link.")).toBeInTheDocument()
    expect(within(sheet).getByText("Check-out must be at least one night after check-in.")).toBeInTheDocument()
    expect(within(sheet).getByText("Enter a price above 0.")).toBeInTheDocument()
    expect(within(sheet).getByLabelText("Name")).toHaveFocus()
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null")).toBeNull()
  })

  it("edits a quote", async () => {
    seed([{ name: "Ueno studio", amount: 42000 }])
    const user = userEvent.setup()
    renderApp()
    await user.click(screen.getByRole("button", { name: "Ueno studio" }))
    const sheet = await screen.findByRole("dialog", { name: "Edit quote" })
    const price = within(sheet).getByLabelText("Price for the stay")
    expect(price).toHaveValue("42000")
    await user.clear(price)
    await user.type(price, "39000")
    await user.click(within(sheet).getByRole("button", { name: "Save changes" }))
    await waitFor(() => expect(within(rows()[0]).getByTestId("row-total")).toHaveTextContent("¥39,000"))
    expect(rows()).toHaveLength(1)
  })

  it("returns focus to whatever opened the edit panel or stay dialog", async () => {
    seed([{ name: "Ueno studio" }])
    const user = userEvent.setup()
    renderApp()

    const name = screen.getByRole("button", { name: "Ueno studio" })
    await user.click(name)
    await screen.findByRole("dialog", { name: "Edit quote" })
    await user.keyboard("{Escape}")
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Edit quote" })).not.toBeInTheDocument())
    await waitFor(() => expect(name).toHaveFocus())

    const actions = screen.getByRole("button", { name: "Actions for Ueno studio" })
    await user.click(actions)
    await user.click(await screen.findByRole("menuitem", { name: "Edit" }))
    await screen.findByRole("dialog", { name: "Edit quote" })
    await user.keyboard("{Escape}")
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Edit quote" })).not.toBeInTheDocument())
    await waitFor(() => expect(actions).toHaveFocus())

    const editStay = screen.getByRole("button", { name: "Edit stay" })
    await user.click(editStay)
    await screen.findByRole("dialog")
    await user.keyboard("{Escape}")
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())
    await waitFor(() => expect(editStay).toHaveFocus())
  })

  it("deletes a quote with undo", async () => {
    seed([{ name: "Keep me" }, { name: "Delete me", amount: 50000 }])
    const user = userEvent.setup()
    renderApp()
    expect(rows()).toHaveLength(2)
    await user.click(screen.getByRole("button", { name: "Actions for Delete me" }))
    await user.click(await screen.findByRole("menuitem", { name: "Delete" }))
    await waitFor(() => expect(rows()).toHaveLength(1))
    expect(screen.queryByText("Delete me")).not.toBeInTheDocument()
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).listings).toHaveLength(1)

    await user.click(await screen.findByRole("button", { name: "Undo" }))
    await waitFor(() => expect(rows()).toHaveLength(2))
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).listings).toHaveLength(2)
  })

  it("marks a quote booked from its menu without changing prices, order, Lowest, or editing", async () => {
    seed([
      { name: "Cheaper flat", amount: 30000 },
      { name: "Pricier flat", amount: 50000, feeCertainty: "unknown" },
    ])
    const user = userEvent.setup()
    renderApp()
    const names = () => namesIn("Quotes")
    const before = { names: names(), totals: screen.getAllByTestId("row-total").map((cell) => cell.textContent) }
    expect(screen.queryByText("Booked")).not.toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: "Actions for Pricier flat" }))
    await user.click(await screen.findByRole("menuitem", { name: "Mark as booked" }))
    const row = rows().find((item) => item.textContent?.includes("Pricier flat"))!
    await waitFor(() => expect(within(row).getByText("Booked")).toBeInTheDocument())
    expect(await screen.findByText("Marked Pricier flat as booked")).toBeInTheDocument()
    // Booking says nothing about fees, and the comparison is unchanged.
    expect(within(row).getByText("Fees unknown")).toBeInTheDocument()
    expect(names()).toEqual(before.names)
    expect(screen.getAllByTestId("row-total").map((cell) => cell.textContent)).toEqual(before.totals)
    const cheaper = rows().find((item) => item.textContent?.includes("Cheaper flat"))!
    expect(within(cheaper).getByText(/^Lowest/)).toBeInTheDocument()
    expect(within(cheaper).queryByText("Booked")).not.toBeInTheDocument()
    let saved = JSON.parse(localStorage.getItem(STORAGE_KEY)!) as AppData
    expect(saved.listings.map((l) => [l.name, l.booked])).toEqual([["Cheaper flat", false], ["Pricier flat", true]])
    expect(saved.listings[1].updatedAt).toBe("2026-10-01T00:00:00.000Z")

    // Still editable, and editing keeps the booking.
    await user.click(screen.getByRole("button", { name: "Pricier flat" }))
    const sheet = await screen.findByRole("dialog", { name: "Edit quote" })
    await user.type(within(sheet).getByLabelText("Notes"), "Check-in 3pm")
    await user.click(within(sheet).getByRole("button", { name: "Save changes" }))
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())
    saved = JSON.parse(localStorage.getItem(STORAGE_KEY)!) as AppData
    expect(saved.listings[1]).toMatchObject({ booked: true, notes: "Check-in 3pm" })

    await user.click(screen.getByRole("button", { name: "Actions for Pricier flat" }))
    await user.click(await screen.findByRole("menuitem", { name: "Mark as not booked" }))
    await waitFor(() => expect(screen.queryByText("Booked")).not.toBeInTheDocument())
    expect((JSON.parse(localStorage.getItem(STORAGE_KEY)!) as AppData).listings[1].booked).toBe(false)
  })

  it("orders quotes by hand within each list, keeping prices, Lowest, and booking independent of position", async () => {
    seed([
      { name: "Ueno studio", amount: 30000 },
      { name: "Riverside flat", amount: 40000 },
      { name: "Shinjuku room", amount: 20000, feeCertainty: "unknown" },
      { name: "Peso place", currency: "PHP", amount: 9000 },
      { name: "Other dates", checkIn: "2030-05-06" },
    ])
    const user = userEvent.setup()
    const view = renderApp()
    const totals = () =>
      Object.fromEntries(rows().map((row) => [within(row).getAllByRole("button")[1].textContent, within(row).getByTestId("row-total").textContent]))
    const before = totals()
    const saved = () => (JSON.parse(localStorage.getItem(STORAGE_KEY)!) as AppData).listings.map((l) => l.name)
    expect(namesIn("Priced in JPY")).toEqual(["Ueno studio", "Riverside flat", "Shinjuku room"])
    expect(screen.getByRole("button", { name: "Reorder Ueno studio" })).toHaveAttribute("aria-roledescription", "sortable")

    await user.click(screen.getByRole("button", { name: "Actions for Shinjuku room" }))
    expect(await screen.findByRole("menuitem", { name: "Move down" })).toHaveAttribute("aria-disabled", "true")
    await user.click(screen.getByRole("menuitem", { name: "Move up" }))
    await waitFor(() => expect(namesIn("Priced in JPY")).toEqual(["Ueno studio", "Shinjuku room", "Riverside flat"]))
    await waitFor(() => expect(screen.getByRole("button", { name: "Actions for Shinjuku room" })).toHaveFocus())
    await user.click(screen.getByRole("button", { name: "Actions for Ueno studio" }))
    await user.click(await screen.findByRole("menuitem", { name: "Move down" }))
    await waitFor(() => expect(namesIn("Priced in JPY")).toEqual(["Shinjuku room", "Ueno studio", "Riverside flat"]))
    expect(screen.getByText("Moved Ueno studio to position 2 of 3.")).toBeInTheDocument()

    // Same prices, same Lowest label on the same quote, other lists untouched.
    expect(totals()).toEqual(before)
    const ueno = rows().find((row) => row.textContent?.includes("Ueno studio"))!
    expect(within(ueno).getByText("Lowest confirmed")).toBeInTheDocument()
    expect(saved()).toEqual(["Shinjuku room", "Ueno studio", "Riverside flat", "Peso place", "Other dates"])

    // A single quote in its list has nothing to move past.
    await user.click(screen.getByRole("button", { name: "Actions for Other dates" }))
    expect(await screen.findByRole("menuitem", { name: "Delete" })).toBeInTheDocument()
    expect(screen.queryByRole("menuitem", { name: /Move/ })).not.toBeInTheDocument()
    await user.keyboard("{Escape}")

    // Booking does not move anything.
    await user.click(screen.getByRole("button", { name: "Actions for Riverside flat" }))
    await user.click(await screen.findByRole("menuitem", { name: "Mark as booked" }))
    await waitFor(() => expect(screen.getByTestId("booked-badge")).toBeInTheDocument())
    expect(namesIn("Priced in JPY")).toEqual(["Shinjuku room", "Ueno studio", "Riverside flat"])

    // An ordinary edit keeps the quote's place.
    await user.click(screen.getByRole("button", { name: "Ueno studio" }))
    let sheet = await screen.findByRole("dialog", { name: "Edit quote" })
    await user.type(within(sheet).getByLabelText("Notes"), "Near the park")
    const price = within(sheet).getByLabelText("Price for the stay")
    await user.clear(price)
    await user.type(price, "35000")
    await user.click(within(sheet).getByRole("button", { name: "Save changes" }))
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())
    expect(namesIn("Priced in JPY")).toEqual(["Shinjuku room", "Ueno studio", "Riverside flat"])

    // A new quote goes last in its list.
    sheet = await openAddSheet(user)
    await user.type(within(sheet).getByLabelText("Name"), "Ginza suite")
    await user.selectOptions(within(sheet).getByLabelText("Currency"), "JPY")
    await user.type(within(sheet).getByLabelText("Price for the stay"), "25000")
    await user.click(within(sheet).getByRole("button", { name: "Add quote" }))
    await waitFor(() => expect(namesIn("Priced in JPY")).toEqual(["Shinjuku room", "Ueno studio", "Riverside flat", "Ginza suite"]))

    // Changing the currency moves it to the end of its new list.
    await user.click(screen.getByRole("button", { name: "Shinjuku room" }))
    sheet = await screen.findByRole("dialog", { name: "Edit quote" })
    await user.selectOptions(within(sheet).getByLabelText("Currency"), "PHP")
    await user.click(within(sheet).getByRole("button", { name: "Save changes" }))
    await waitFor(() => expect(namesIn("Priced in PHP")).toEqual(["Peso place", "Shinjuku room"]))
    expect(namesIn("Priced in JPY")).toEqual(["Ueno studio", "Riverside flat", "Ginza suite"])

    // After a reload: the same order.
    view.unmount()
    renderApp()
    expect(namesIn("Priced in JPY")).toEqual(["Ueno studio", "Riverside flat", "Ginza suite"])
    expect(namesIn("Priced in PHP")).toEqual(["Peso place", "Shinjuku room"])
    expect(namesIn("Different dates or guests")).toEqual(["Other dates"])
  })

  it("only links to http(s) sources", () => {
    seed([{ name: "Linked", url: "https://www.airbnb.com/rooms/1" }, { name: "Plain" }])
    renderApp()
    const link = screen.getByRole("link", { name: "Open Linked on Airbnb" })
    expect(link).toHaveAttribute("href", "https://www.airbnb.com/rooms/1")
    expect(link).toHaveAttribute("rel", expect.stringContaining("noopener"))
    expect(screen.queryByRole("link", { name: /Open Plain/ })).not.toBeInTheDocument()
  })

  it("does not crown an unconfirmed quote and separates other dates", () => {
    seed([
      { name: "Cheap unknown", amount: 20000, feeCertainty: "unknown" },
      { name: "Confirmed", amount: 30000 },
      { name: "Other dates", amount: 10000, checkIn: "2030-05-06" },
    ])
    renderApp()
    const ranked = within(screen.getByRole("table", { name: "Quotes" })).getAllByTestId("quote-row")
    expect(ranked.map((row) => within(row).getByRole("button", { name: /^(Cheap unknown|Confirmed)$/ }).textContent)).toEqual([
      "Cheap unknown",
      "Confirmed",
    ])
    expect(within(ranked[0]).queryByText(/Lowest/)).not.toBeInTheDocument()
    expect(within(ranked[1]).getByText("Lowest confirmed")).toBeInTheDocument()
    const other = screen.getByRole("table", { name: "Different dates or guests" })
    expect(within(other).getByText("Other dates")).toBeInTheDocument()
    expect(within(other).queryByText(/Lowest/)).not.toBeInTheDocument()
  })

  it("keeps currencies apart until a manual rate is entered", async () => {
    seed([
      { name: "Yen place", currency: "JPY", amount: 45000 },
      { name: "Peso place", currency: "PHP", amount: 18000 },
    ])
    const user = userEvent.setup()
    renderApp()
    expect(screen.getByRole("table", { name: "Priced in JPY" })).toBeInTheDocument()
    expect(screen.getByRole("table", { name: "Priced in PHP" })).toBeInTheDocument()

    await user.selectOptions(screen.getByLabelText("Currencies"), "PHP")
    expect(screen.getByText("JPY quotes stay separate until you enter a rate.")).toBeInTheDocument()
    await user.type(screen.getByLabelText("Manual JPY rate"), "0.37")

    const converted = screen.getByRole("table", { name: "Converted to PHP" })
    const items = within(converted).getAllByTestId("quote-row")
    expect(within(items[0]).getByTestId("row-total")).toHaveTextContent("≈ ₱16,650.00")
    expect(within(items[0]).getByText("¥45,000")).toBeInTheDocument()
    expect(within(items[0]).getByText("Lowest at your rate")).toBeInTheDocument()
    expect(within(items[1]).getByTestId("row-total")).toHaveTextContent("₱18,000.00")
  })

  it("exports a backup and imports one without replacing existing data", async () => {
    const existing = seed([{ id: "mine", name: "Mine", amount: 30000 }])
    const user = userEvent.setup()
    let exported: Blob | null = null
    const createObjectURL = vi.fn((blob: Blob) => {
      exported = blob
      return "blob:test"
    })
    Object.assign(URL, { createObjectURL, revokeObjectURL: vi.fn() })
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {})

    renderApp()
    await user.click(screen.getByRole("button", { name: "Backup" }))
    await user.click(await screen.findByRole("menuitem", { name: "Export backup" }))
    expect(click).toHaveBeenCalled()
    const file = JSON.parse(await exported!.text())
    expect(file.listings).toEqual(existing.listings)

    const incoming = structuredClone(existing)
    incoming.listings = [
      { ...existing.listings[0], amount: 99999 },
      { ...existing.listings[0], id: "theirs", name: "Theirs" },
      { ...existing.listings[0], id: "bad", amount: -5 },
    ]
    const upload = new File([serializeExport(incoming)], "backup.json", { type: "application/json" })
    await user.upload(screen.getByTestId("import-input"), upload)

    const dialog = await screen.findByRole("dialog", { name: "Import backup" })
    expect(within(dialog).getByText("1 new quote")).toBeInTheDocument()
    expect(within(dialog).getByText("1 invalid entry skipped")).toBeInTheDocument()
    expect(within(dialog).getByText(/1 entry in the file differs/)).toBeInTheDocument()
    expect(within(dialog).getByRole("radio", { name: "Keep mine" })).toBeChecked()
    await user.click(within(dialog).getByRole("button", { name: "Import" }))

    await waitFor(() => expect(rows()).toHaveLength(2))
    expect(screen.getByText("Theirs")).toBeInTheDocument()
    const mine = rows().find((row) => within(row).queryByText("Mine"))!
    expect(within(mine).getByTestId("row-total")).toHaveTextContent("¥30,000")
    click.mockRestore()
  })

  it("rejects a file that is not a backup", async () => {
    const user = userEvent.setup()
    renderApp()
    await user.upload(
      screen.getByTestId("import-input"),
      new File(['{"hello":"world"}'], "x.json", { type: "application/json" }),
    )
    expect(await screen.findByText("This file is not a Travel Planner backup.")).toBeInTheDocument()
    expect(screen.queryByRole("dialog", { name: "Import backup" })).not.toBeInTheDocument()
  })

  it("reorders stay tabs with Alt+Arrow, keeps focus and selection, and saves the order", async () => {
    const user = userEvent.setup()
    seed([{ name: "Kept quote" }])
    const view = renderApp()
    const names = () => screen.getAllByRole("tab").map((tab) => tab.textContent)

    await user.click(screen.getByRole("tab", { name: /Lakeside/ }))
    const lakeside = screen.getByRole("tab", { name: /Lakeside/ })
    expect(lakeside).toHaveAccessibleDescription("Alt or Option with Left or Right Arrow moves this stay.")
    await user.keyboard("{Alt>}{ArrowLeft}{/Alt}")
    expect(names()).toEqual(["LakesideMay 8–10 · 4 guests", "Old TownMay 5–8 · 2 guests", "Old TownMay 10–14 · 4 guests"])
    expect(screen.getByRole("tab", { name: /Lakeside/ })).toHaveFocus()
    expect(screen.getByRole("tab", { name: /Lakeside/ })).toHaveAttribute("aria-selected", "true")
    expect(screen.getByText("Moved Lakeside, May 8–10 to position 1 of 3.")).toBeInTheDocument()

    await user.keyboard("{Alt>}{ArrowLeft}{/Alt}")
    expect(screen.getByText("Lakeside, May 8–10 is already first.")).toBeInTheDocument()

    // Plain arrows still move focus between tabs without reordering or selecting.
    await user.keyboard("{ArrowRight}")
    expect(screen.getByRole("tab", { name: /May 5–8/ })).toHaveFocus()
    expect(names()[0]).toBe("LakesideMay 8–10 · 4 guests")
    expect(screen.getByRole("tab", { name: /Lakeside/ })).toHaveAttribute("aria-selected", "true")

    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY)!) as AppData
    expect(saved.groups.map((group) => group.id)).toEqual(["sample-lakeside", "sample-old-town-1", "sample-old-town-2"])
    expect(saved.listings).toHaveLength(1)

    // After a reload: same order, same selected stay, quotes still under their stay.
    view.unmount()
    renderApp()
    expect(names()).toEqual(["LakesideMay 8–10 · 4 guests", "Old TownMay 5–8 · 2 guests", "Old TownMay 10–14 · 4 guests"])
    expect(screen.getByRole("tab", { name: /Lakeside/ })).toHaveAttribute("aria-selected", "true")
    await user.click(screen.getByRole("tab", { name: /May 5–8/ }))
    expect(screen.getByText("Kept quote")).toBeInTheDocument()
  })

  it("keeps showing the same stay when another tab is moved in front of it on a first visit", async () => {
    const user = userEvent.setup()
    renderApp()
    // Nothing has been picked yet, so the first tab is shown.
    expect(screen.getByRole("tab", { name: /May 5–8/ })).toHaveAttribute("aria-selected", "true")
    screen.getByRole("tab", { name: /Lakeside/ }).focus()
    await user.keyboard("{Alt>}{ArrowLeft}{/Alt}")
    expect(screen.getAllByRole("tab")[0]).toHaveTextContent("Lakeside")
    expect(screen.getByRole("tab", { name: /May 5–8/ })).toHaveAttribute("aria-selected", "true")
    expect(screen.getByRole("tabpanel")).toHaveTextContent("Sun, May 5 to Wed, May 8, 2030")
  })

  it("plans a day: adds, places by time, reorders, moves to another day, deletes with undo, and keeps it all", async () => {
    window.history.replaceState(null, "", "/#/itinerary")
    seed([{ name: "Quote stays put" }])
    const user = userEvent.setup()
    const view = renderApp()
    const activityRows = () => screen.queryAllByTestId("activity-row")
    const order = () => activityRows().map((row) => within(row).getAllByRole("button")[1].textContent)

    const tabs = screen.getAllByRole("tab")
    expect(tabs).toHaveLength(14)
    // Date, weekday, and a count on every day, zero included; the tab names say it in full.
    expect(tabs[0]).toHaveTextContent("May 1Wed0")
    expect(tabs[13]).toHaveTextContent("May 14Tue0")
    expect(tabs[0]).toHaveAccessibleName("Wednesday, May 1, 0 activities")
    expect(tabs[0]).not.toHaveTextContent(/activit/)
    expect(tabs[0]).toHaveAttribute("aria-selected", "true")
    expect(screen.getByText("No activities for this day yet.")).toBeInTheDocument()
    expect(screen.getAllByRole("button", { name: "Add activity" })).toHaveLength(1)

    async function add(name: string, fill?: (sheet: HTMLElement) => Promise<void> | void) {
      await user.click(screen.getByRole("button", { name: "Add activity" }))
      const sheet = await screen.findByRole("dialog", { name: "Add activity" })
      await user.type(within(sheet).getByLabelText("Name"), name)
      await fill?.(sheet)
      await user.click(within(sheet).getByRole("button", { name: "Add activity" }))
      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())
    }
    const setTime = (sheet: HTMLElement, time: string) => {
      fireEvent.change(within(sheet).getByLabelText("Time"), { target: { value: time } })
    }

    // Only the name is required; an empty time is flexible.
    await add("Harbor walk", async (sheet) => {
      await user.type(within(sheet).getByLabelText("Location"), "Riverside")
      await user.type(within(sheet).getByLabelText("Link"), "https://maps.app.goo.gl/harbor-walk")
    })
    expect(within(activityRows()[0]).getByTestId("activity-time")).toHaveTextContent("Flexible")
    expect(within(activityRows()[0]).getByText("Riverside")).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Open in Google Maps for Harbor walk" })).toHaveAttribute(
      "href",
      "https://maps.app.goo.gl/harbor-walk",
    )
    expect(screen.getAllByRole("tab")[0]).toHaveTextContent("May 1Wed1")
    expect(screen.getAllByRole("tab")[0]).toHaveAccessibleName("Wednesday, May 1, 1 activity")

    await add("Dinner", (sheet) => setTime(sheet, "19:00"))
    await add("Lunch", (sheet) => setTime(sheet, "12:30"))
    expect(order()).toEqual(["Harbor walk", "Lunch", "Dinner"])
    expect(within(activityRows()[1]).getByTestId("activity-time")).toHaveTextContent("12:30 PM")

    // Reorder from the row menu; focus returns to the moved row's menu button.
    await user.click(screen.getByRole("button", { name: "Actions for Dinner" }))
    expect(await screen.findByRole("menuitem", { name: "Move down" })).toHaveAttribute("aria-disabled", "true")
    await user.click(screen.getByRole("menuitem", { name: "Move up" }))
    await waitFor(() => expect(order()).toEqual(["Harbor walk", "Dinner", "Lunch"]))
    await waitFor(() => expect(screen.getByRole("button", { name: "Actions for Dinner" })).toHaveFocus())

    // Move Lunch to May 2 from the edit panel; the view follows it.
    await user.click(screen.getByRole("button", { name: "Lunch" }))
    const edit = await screen.findByRole("dialog", { name: "Edit activity" })
    expect(within(edit).getByLabelText("Time")).toHaveValue("12:30")
    await user.selectOptions(within(edit).getByLabelText("Day"), "2030-05-02")
    await user.click(within(edit).getByRole("button", { name: "Save changes" }))
    await waitFor(() => expect(screen.getByRole("tab", { name: /May 2,/ })).toHaveAttribute("aria-selected", "true"))
    expect(order()).toEqual(["Lunch"])
    expect(screen.getByRole("tab", { name: "Wednesday, May 1, 2 activities" })).toBeInTheDocument()

    // Clearing the time makes it flexible again.
    await user.click(screen.getByRole("button", { name: "Lunch" }))
    const again = await screen.findByRole("dialog", { name: "Edit activity" })
    await user.click(within(again).getByRole("button", { name: "Clear" }))
    expect(within(again).getByLabelText("Time")).toHaveValue("")
    await user.click(within(again).getByRole("button", { name: "Save changes" }))
    await waitFor(() => expect(screen.getByTestId("activity-time")).toHaveTextContent("Flexible"))

    await user.click(screen.getByRole("button", { name: "Actions for Lunch" }))
    await user.click(await screen.findByRole("menuitem", { name: "Delete" }))
    await waitFor(() => expect(screen.getByText("No activities for this day yet.")).toBeInTheDocument())
    const deleted = (await screen.findByText("Deleted Lunch")).closest<HTMLElement>("[data-sonner-toast]")!
    await user.click(within(deleted).getByRole("button", { name: "Undo" }))
    await waitFor(() => expect(order()).toEqual(["Lunch"]))

    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY)!) as AppData
    expect(saved.activities.map((a) => [a.name, a.date, a.time])).toEqual([
      ["Harbor walk", "2030-05-01", ""],
      ["Dinner", "2030-05-01", "19:00"],
      ["Lunch", "2030-05-02", ""],
    ])
    expect(saved.listings.map((l) => l.name)).toEqual(["Quote stays put"])

    // After a reload: same page, same day, same plans.
    view.unmount()
    renderApp()
    expect(screen.getByRole("heading", { level: 1, name: "Itinerary" })).toBeInTheDocument()
    expect(screen.getByRole("tab", { name: /May 2,/ })).toHaveAttribute("aria-selected", "true")
    await user.click(screen.getByRole("tab", { name: /May 1,/ }))
    expect(order()).toEqual(["Harbor walk", "Dinner"])
  })

  it("rejects an activity without a name and only links to http(s) pages", async () => {
    window.history.replaceState(null, "", "/#/itinerary")
    const user = userEvent.setup()
    renderApp()
    await user.click(screen.getByRole("button", { name: "Add activity" }))
    const sheet = await screen.findByRole("dialog", { name: "Add activity" })
    await user.type(within(sheet).getByLabelText("Link"), "javascript:alert(1)")
    await user.click(within(sheet).getByRole("button", { name: "Add activity" }))
    expect(within(sheet).getByText("Enter a name.")).toBeInTheDocument()
    expect(within(sheet).getByText("Use a full http:// or https:// link.")).toBeInTheDocument()
    expect(within(sheet).getByLabelText("Name")).toHaveFocus()
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}").activities ?? []).toHaveLength(0)
  })

  it("flags a quote entered with different guests than the stay", async () => {
    const user = userEvent.setup()
    renderApp()
    const sheet = await openAddSheet(user)
    await user.type(within(sheet).getByLabelText("Name"), "Big house")
    const guests = within(sheet).getByLabelText("Guests")
    await user.clear(guests)
    await user.type(guests, "4")
    expect(within(sheet).getByText(/It will be listed separately, not ranked/)).toBeInTheDocument()
    await user.type(within(sheet).getByLabelText("Price for the stay"), "60000")
    await user.click(within(sheet).getByRole("button", { name: "Add quote" }))
    const other = await screen.findByRole("table", { name: "Different dates or guests" })
    expect(within(other).getByText("Big house")).toBeInTheDocument()
  })
})

function plan(id: string, date: string, overrides: Partial<Activity> = {}): Activity {
  return {
    id,
    date,
    name: id,
    time: "",
    location: "",
    url: "",
    notes: "",
    createdAt: "2026-10-01T00:00:00.000Z",
    updatedAt: "2026-10-01T00:00:00.000Z",
    ...overrides,
  }
}

/** Saved data in the shape written before trip details existed. */
function seedLegacy(activities: Activity[], listings: Partial<Listing>[] = []) {
  const data = seed(listings)
  const old: Record<string, unknown> = { ...data, activities }
  delete old.trip
  const raw = JSON.stringify(old)
  localStorage.setItem(STORAGE_KEY, raw)
  return raw
}

const savedData = () => JSON.parse(localStorage.getItem(STORAGE_KEY)!) as AppData
const dayTabs = () => screen.getAllByTestId("day-tab")

async function openTripMenu(user: ReturnType<typeof userEvent.setup>, name: RegExp) {
  await user.click(screen.getByRole("button", { name }))
  return await screen.findByRole("menu")
}

describe("trip details", () => {
  it("edits the trip from the sidebar without moving stays or activities", async () => {
    window.history.replaceState(null, "", "/#/itinerary")
    const data = seed([{ name: "Quote stays put" }])
    data.activities = [plan("Museum", "2030-05-03"), plan("Harbor walk", "2030-05-06")]
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
    const user = userEvent.setup()
    renderApp()

    const trigger = screen.getByRole("button", { name: /Sample trip/ })
    expect(trigger).toHaveTextContent("May 1–14 · 14 days")
    expect(dayTabs()).toHaveLength(14)

    await openTripMenu(user, /Sample trip/)
    await user.click(screen.getByRole("menuitem", { name: "Edit trip" }))
    const dialog = await screen.findByRole("dialog", { name: "Edit trip" })
    expect(within(dialog).getByLabelText("Name")).toHaveValue("Sample trip")
    expect(within(dialog).getByLabelText("Destination")).toHaveValue("Example City")
    expect(within(dialog).getByText("Changing the dates never moves or removes stays or activities.")).toBeInTheDocument()

    await user.clear(within(dialog).getByLabelText("Name"))
    await user.type(within(dialog).getByLabelText("Name"), "Spring trip")
    await user.clear(within(dialog).getByLabelText("Destination"))
    fireEvent.change(within(dialog).getByLabelText("First day"), { target: { value: "2030-05-04" } })
    fireEvent.change(within(dialog).getByLabelText("Last day"), { target: { value: "2030-05-08" } })
    // Duration comes from the dates.
    expect(within(dialog).getByTestId("trip-length")).toHaveTextContent(
      "5 days. 1 activity is outside these dates and stays on its own day.",
    )

    // An end before the start is caught before saving.
    fireEvent.change(within(dialog).getByLabelText("Last day"), { target: { value: "2030-05-02" } })
    await user.click(within(dialog).getByRole("button", { name: "Save trip" }))
    expect(within(dialog).getByText("The trip must end on or after its first day.")).toBeInTheDocument()
    expect(within(dialog).getByLabelText("Last day")).toHaveAttribute("aria-invalid", "true")
    fireEvent.change(within(dialog).getByLabelText("Last day"), { target: { value: "2030-05-08" } })
    await user.click(within(dialog).getByRole("button", { name: "Save trip" }))
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())
    await waitFor(() => expect(screen.getByRole("button", { name: /Spring trip/ })).toHaveFocus())
    expect(screen.getByRole("button", { name: /Spring trip/ })).toHaveTextContent("May 4–8 · 5 days")

    // Every trip day shows, empty ones included, and the day outside the trip keeps its activity.
    expect(dayTabs().map((tab) => tab.getAttribute("aria-label"))).toEqual([
      "Friday, May 3, 1 activity, outside trip dates",
      "Saturday, May 4, 0 activities",
      "Sunday, May 5, 0 activities",
      "Monday, May 6, 1 activity",
      "Tuesday, May 7, 0 activities",
      "Wednesday, May 8, 0 activities",
    ])

    // The outside activity can still be opened and edited.
    await user.click(dayTabs()[0])
    expect(screen.getByTestId("summary-row")).toHaveTextContent("Fri, May 3, 2030 · Outside trip dates")
    await user.click(screen.getByRole("button", { name: "Museum" }))
    const edit = await screen.findByRole("dialog", { name: "Edit activity" })
    expect(within(edit).getByLabelText("Day")).toHaveValue("2030-05-03")
    await user.type(within(edit).getByLabelText("Notes"), "Closed Mondays")
    await user.click(within(edit).getByRole("button", { name: "Save changes" }))
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())

    const saved = savedData()
    expect(saved.trip).toEqual({ name: "Spring trip", destination: "", start: "2030-05-04", end: "2030-05-08" })
    expect(saved.activities.map((a) => [a.id, a.date, a.notes])).toEqual([
      ["Museum", "2030-05-03", "Closed Mondays"],
      ["Harbor walk", "2030-05-06", ""],
    ])
    expect(saved.groups).toEqual(defaultData().groups)
    expect(saved.listings).toEqual(data.listings)
  })

  it("asks to confirm trip details for older saved data instead of guessing them", async () => {
    window.history.replaceState(null, "", "/#/itinerary")
    const raw = seedLegacy([plan("Harbor walk", "2030-05-06"), plan("Lakeshore walk", "2030-05-09")], [{ name: "Old quote" }])
    const user = userEvent.setup()
    renderApp()

    expect(screen.getByText("Confirm your trip details")).toBeInTheDocument()
    const trigger = screen.getByRole("button", { name: /Untitled trip/ })
    expect(trigger).toHaveTextContent("Dates not set")
    // Only days that have activities, until the trip dates are known.
    expect(dayTabs().map((tab) => tab.getAttribute("aria-label"))).toEqual([
      "Monday, May 6, 1 activity",
      "Thursday, May 9, 1 activity",
    ])
    // Nothing is written until the user changes something.
    expect(localStorage.getItem(STORAGE_KEY)).toBe(raw)

    await user.click(screen.getByRole("button", { name: "Set trip details" }))
    const dialog = await screen.findByRole("dialog", { name: "Set trip details" })
    expect(within(dialog).getByLabelText("Name")).toHaveValue("")
    expect(within(dialog).getByLabelText("First day")).toHaveValue("")
    expect(within(dialog).getByText("Your stays and activities run from Sun, May 5 to Tue, May 14, 2030.")).toBeInTheDocument()
    await user.click(within(dialog).getByRole("button", { name: "Save trip" }))
    expect(within(dialog).getByText("Enter a name.")).toBeInTheDocument()
    expect(within(dialog).getByText("Enter a valid start date.")).toBeInTheDocument()

    await user.type(within(dialog).getByLabelText("Name"), "Spring trip")
    fireEvent.change(within(dialog).getByLabelText("First day"), { target: { value: "2030-05-01" } })
    fireEvent.change(within(dialog).getByLabelText("Last day"), { target: { value: "2030-05-14" } })
    await user.click(within(dialog).getByRole("button", { name: "Save trip" }))
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())

    expect(screen.queryByText("Confirm your trip details")).not.toBeInTheDocument()
    expect(dayTabs()).toHaveLength(14)
    const saved = savedData()
    expect(saved.trip).toEqual({ name: "Spring trip", destination: "", start: "2030-05-01", end: "2030-05-14" })
    expect(saved.activities.map((a) => a.date)).toEqual(["2030-05-06", "2030-05-09"])
    expect(saved.listings.map((l) => l.name)).toEqual(["Old quote"])
  })

  it("offers to set trip dates when older data has no activities either", async () => {
    window.history.replaceState(null, "", "/#/itinerary")
    seedLegacy([])
    const user = userEvent.setup()
    renderApp()
    expect(screen.queryByRole("tablist", { name: "Days" })).not.toBeInTheDocument()
    expect(screen.getByText("Set the trip dates to plan each day.")).toBeInTheDocument()
    await user.click(screen.getAllByRole("button", { name: "Set trip details" })[1])
    expect(await screen.findByRole("dialog", { name: "Set trip details" })).toBeInTheDocument()
  })

  it("keeps the original saved data and says what was left out when entries cannot be read", async () => {
    const data = seed([{ name: "Good" }, { name: "Broken", amount: -1 }])
    data.activities = [plan("Bad time", "2030-05-02", { time: "99:99" })]
    const raw = JSON.stringify(data)
    localStorage.setItem(STORAGE_KEY, raw)
    const user = userEvent.setup()
    renderApp()

    const alert = screen.getByText("Some saved entries could not be read").closest<HTMLElement>("[data-slot=alert]")!
    expect(alert).toHaveTextContent("1 quote and 1 activity were left out.")
    const key = Object.keys(localStorage).find((k) => k.startsWith(`${STORAGE_KEY}:skipped:`))!
    expect(alert).toHaveTextContent(`kept unchanged in this browser's storage as ${key}`)
    expect(localStorage.getItem(key)).toBe(raw)

    // A later change saves only what was read; the copy stays.
    await user.click(screen.getByRole("button", { name: "Actions for Good" }))
    await user.click(await screen.findByRole("menuitem", { name: "Mark as booked" }))
    await waitFor(() => expect(savedData().listings.map((l) => l.name)).toEqual(["Good"]))
    expect(localStorage.getItem(key)).toBe(raw)
  })

  it("imports a backup with different trip details only when chosen", async () => {
    const user = userEvent.setup()
    renderApp()
    const theirs = { ...defaultData(), trip: { name: "Shared trip", destination: "", start: "2030-06-01", end: "2030-06-03" } }

    await user.upload(
      screen.getByTestId("import-input"),
      new File([serializeExport(theirs)], "backup.json", { type: "application/json" }),
    )
    const dialog = await screen.findByRole("dialog", { name: "Import backup" })
    expect(within(dialog).getByText("The file's trip details differ from yours.")).toBeInTheDocument()
    expect(within(dialog).getByRole("radio", { name: /Keep my trip details/ })).toBeChecked()
    expect(within(dialog).getByText("Sample trip, Example City · Wed, May 1 to Tue, May 14, 2030")).toBeInTheDocument()
    expect(within(dialog).getByText("Shared trip · Sat, Jun 1 to Mon, Jun 3, 2030")).toBeInTheDocument()
    // Keeping mine leaves nothing to import from this file.
    expect(within(dialog).getByRole("button", { name: "Import" })).toBeDisabled()
    await user.click(within(dialog).getByRole("radio", { name: /Use the file's trip details/ }))
    await user.click(within(dialog).getByRole("button", { name: "Import" }))
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())
    expect(await screen.findByText("Trip details updated")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /Shared trip/ })).toHaveTextContent("Jun 1–3 · 3 days")
    expect(savedData().trip).toEqual(theirs.trip)

    // An older backup has no trip details and cannot change them.
    const old: Record<string, unknown> = JSON.parse(serializeExport({ ...defaultData(), activities: [plan("Old plan", "2030-05-02")] }))
    delete old.trip
    await user.upload(
      screen.getByTestId("import-input"),
      new File([JSON.stringify(old)], "old.json", { type: "application/json" }),
    )
    const second = await screen.findByRole("dialog", { name: "Import backup" })
    expect(within(second).queryByRole("radio", { name: /trip details/ })).not.toBeInTheDocument()
    await user.click(within(second).getByRole("button", { name: "Import" }))
    await waitFor(() => expect(savedData().activities.map((a) => a.date)).toEqual(["2030-05-02"]))
    expect(savedData().trip).toEqual(theirs.trip)
  })
})


describe("saved data that cannot be copied", () => {
  // Spies come off even when a test fails, so one failure cannot leak into the next test.
  afterEach(() => vi.restoreAllMocks())

  /** Makes copies under recovery keys fail, as when storage is full, while ordinary saves still go through. */
  function blockRecoveryCopies() {
    const state = { full: true }
    const setItem = Storage.prototype.setItem
    const spy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (this: Storage, key, value) {
      if (state.full && /:(skipped|unreadable):/.test(key)) throw new DOMException("full", "QuotaExceededError")
      setItem.call(this, key, value)
    })
    return { state, restore: () => spy.mockRestore() }
  }
  const recoveryKeys = () => Object.keys(localStorage).filter((key) => /:(skipped|unreadable):/.test(key))

  function seedWithBadEntry() {
    const data = seed([{ name: "Good" }, { name: "Broken", amount: -1 }])
    const raw = JSON.stringify(data)
    localStorage.setItem(STORAGE_KEY, raw)
    return raw
  }

  it("pauses saving so an unrelated edit cannot overwrite the original, until a copy is kept", async () => {
    const raw = seedWithBadEntry()
    const blocked = blockRecoveryCopies()
    const user = userEvent.setup()
    renderApp()

    const alert = screen.getByText("Some saved entries could not be read").closest<HTMLElement>("[data-slot=alert]")!
    expect(alert).toHaveTextContent("1 quote was left out.")
    expect(alert).toHaveTextContent("saving is paused to avoid overwriting it. Changes you make now are not saved.")
    expect(alert).not.toHaveTextContent("was kept")
    expect(recoveryKeys()).toEqual([])

    // Unrelated edits change the screen but leave the saved original alone.
    await user.click(screen.getByRole("button", { name: "Actions for Good" }))
    await user.click(await screen.findByRole("menuitem", { name: "Mark as booked" }))
    await waitFor(() => expect(screen.getByText("Booked")).toBeInTheDocument())
    await user.click(screen.getByRole("button", { name: /Sample trip/ }))
    await user.click(await screen.findByRole("menuitem", { name: "Edit trip" }))
    const dialog = await screen.findByRole("dialog", { name: "Edit trip" })
    await user.clear(within(dialog).getByLabelText("Name"))
    await user.type(within(dialog).getByLabelText("Name"), "Renamed")
    await user.click(within(dialog).getByRole("button", { name: "Save trip" }))
    await waitFor(() => expect(screen.getByRole("button", { name: /Renamed/ })).toBeInTheDocument())
    expect(localStorage.getItem(STORAGE_KEY)).toBe(raw)

    // Still no room: nothing changes.
    await user.click(within(alert).getByRole("button", { name: "Try again" }))
    expect(await screen.findByText("Still not enough space. Nothing was overwritten.")).toBeInTheDocument()
    expect(localStorage.getItem(STORAGE_KEY)).toBe(raw)
    expect(recoveryKeys()).toEqual([])

    // With room, the copy is kept first and the edits made meanwhile are saved.
    blocked.state.full = false
    await user.click(within(alert).getByRole("button", { name: "Try again" }))
    expect(await screen.findByText("Copy kept. Changes are being saved again.")).toBeInTheDocument()
    const [key] = recoveryKeys()
    expect(localStorage.getItem(key)).toBe(raw)
    await waitFor(() => expect(savedData().trip?.name).toBe("Renamed"))
    expect(savedData().listings.map((l) => [l.name, l.booked])).toEqual([["Good", true]])
    expect(screen.getByText("Some saved entries could not be read").closest("[data-slot=alert]")).toHaveTextContent(
      `kept unchanged in this browser's storage as ${key}`,
    )
    blocked.restore()
  })

  it("overwrites the original only when the user confirms discarding it, and can download it first", async () => {
    const raw = seedWithBadEntry()
    const blocked = blockRecoveryCopies()
    let downloaded: Blob | null = null
    Object.assign(URL, {
      createObjectURL: vi.fn((blob: Blob) => ((downloaded = blob), "blob:test")),
      revokeObjectURL: vi.fn(),
    })
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {})
    const user = userEvent.setup()
    renderApp()

    await user.click(screen.getByRole("button", { name: "Download original" }))
    expect(await downloaded!.text()).toBe(raw)
    expect(localStorage.getItem(STORAGE_KEY)).toBe(raw)

    await user.click(screen.getByRole("button", { name: "Discard original" }))
    let confirm = await screen.findByRole("alertdialog", { name: "Discard the original saved data?" })
    await user.click(within(confirm).getByRole("button", { name: "Cancel" }))
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument())
    expect(localStorage.getItem(STORAGE_KEY)).toBe(raw)

    await user.click(screen.getByRole("button", { name: "Discard original" }))
    confirm = await screen.findByRole("alertdialog", { name: "Discard the original saved data?" })
    await user.click(within(confirm).getByRole("button", { name: "Discard and resume saving" }))
    await waitFor(() => expect(savedData().listings.map((l) => l.name)).toEqual(["Good"]))
    expect(screen.queryByText("Some saved entries could not be read")).not.toBeInTheDocument()

    // Saving is back to normal.
    await user.click(screen.getByRole("button", { name: "Actions for Good" }))
    await user.click(await screen.findByRole("menuitem", { name: "Mark as booked" }))
    await waitFor(() => expect(savedData().listings[0].booked).toBe(true))
    click.mockRestore()
    blocked.restore()
  })

  it("says so truthfully when unreadable data cannot be copied, and holds it the same way", async () => {
    localStorage.setItem(STORAGE_KEY, "{not json")
    const blocked = blockRecoveryCopies()
    const user = userEvent.setup()
    renderApp()

    const alert = screen.getByText("Saved data could not be read").closest<HTMLElement>("[data-slot=alert]")!
    expect(alert).toHaveTextContent("Browser storage is too full to keep a copy of the original")
    expect(alert).not.toHaveTextContent("was kept")
    expect(recoveryKeys()).toEqual([])

    await user.click(screen.getByRole("button", { name: /Sample trip/ }))
    await user.click(await screen.findByRole("menuitem", { name: "Edit trip" }))
    const dialog = await screen.findByRole("dialog", { name: "Edit trip" })
    await user.type(within(dialog).getByLabelText("Name"), " edited")
    await user.click(within(dialog).getByRole("button", { name: "Save trip" }))
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())
    expect(localStorage.getItem(STORAGE_KEY)).toBe("{not json")
    blocked.restore()
  })

  it("keeps saving normally when the copy succeeds", async () => {
    const raw = seedWithBadEntry()
    const user = userEvent.setup()
    renderApp()
    const [key] = recoveryKeys()
    expect(localStorage.getItem(key)).toBe(raw)
    expect(screen.queryByRole("button", { name: "Try again" })).not.toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "Actions for Good" }))
    await user.click(await screen.findByRole("menuitem", { name: "Mark as booked" }))
    await waitFor(() => expect(savedData().listings.map((l) => [l.name, l.booked])).toEqual([["Good", true]]))
    expect(localStorage.getItem(key)).toBe(raw)
  })
})
