# Travel Planner

A personal web app I built for planning a trip. It does two things:

- **Stays:** compares accommodation quotes collected by hand from Airbnb, Google Maps, and other sites. Each quote is normalized to a full-stay total and an effective nightly rate, so prices shown per night and per stay can be compared side by side.
- **Itinerary:** a simple day-by-day list of activities for the trip.

A fresh browser starts with a sample trip and three sample stays, all made up, which you edit or replace.

It runs entirely in the browser: no accounts, backend, scraping, or live exchange rates.

## Stack

React 19, TypeScript, Vite, Tailwind CSS v4, shadcn/ui (Base UI), and dnd-kit for reordering. Tests use Vitest with Testing Library, and Playwright in Chromium.

The theme in `src/styles/theme.css` was generated with my own theme-generator tool.

## Run locally

Verified with Node 22.22.2 and pnpm 12.8.1. Other versions may work but have not been tested.

```sh
pnpm install
pnpm dev            # development server at http://localhost:5173
pnpm build          # typecheck and production build into dist/
pnpm preview        # serve the production build at http://localhost:4173
pnpm test           # unit and interaction tests (Vitest, jsdom)
pnpm test:e2e       # browser tests against the production build (Playwright)
```

`pnpm test:e2e` needs a built `dist/` and Playwright's Chromium (`pnpm exec playwright install chromium` if missing).

## How prices are compared

- Nights are calendar days between check-in and check-out, computed from date-only day numbers so time zones and DST cannot shift them.
- A per-night price gives a stay total of price × nights + extra fees. A stay price gives price + extra fees. Extra fees are one-time amounts not already included in the price.
- Effective nightly rate = stay total ÷ nights, with no rounding before the total. Per person per night splits that evenly across the quote's guest count, for reference only.
- Quotes are ranked only against quotes for the same dates and guest count. Others are listed separately and never ranked.
- Different currencies (JPY, PHP, and USD) are ranked separately unless you choose a comparison currency and enter a manual rate. Converted amounts are marked with ≈ and keep the original price beside them.
- Only a quote marked "All-in confirmed" can be labeled lowest. If an unconfirmed quote looks cheaper, the confirmed one is labeled "Lowest confirmed".
- Quotes, stays, and activities can be put in any order by hand. The order never affects prices or labels.

## Trip details

The trip has a name, an optional destination, and a first and last day, set from the trip selector at the top of the sidebar: "Set trip details" when none are set yet, and "Edit trip" afterwards. The length in days is worked out from the dates. There is one trip for now.

- The itinerary shows every day of the trip, including days with nothing planned.
- Changing the trip dates never moves, changes, or removes stays or activities. An activity that ends up outside the new dates keeps its day: that day still appears in the itinerary, marked "Outside trip dates", and the activity can be opened, edited, or moved as usual.

## Data

Everything is saved in the browser's localStorage, under keys prefixed `japan-stay-compare:` (kept from the project's original name so existing data still loads). The Backup menu exports a JSON file, including the trip details, and imports one. Imports are validated, invalid entries are skipped, and existing entries are never overwritten: for conflicts you choose Keep mine or Keep both.

- **Trip details on import:** if the file's trip details differ from yours, the import asks whether to keep yours or use the file's; yours is the default. If you have none yet, using the file's is offered as the default. Older backups have no trip details and never change yours.
- **Data saved before trip details existed:** the app does not guess the trip dates from stays and activities, since days with nothing planned leave no trace. It asks you to confirm the trip details instead. Until then, the itinerary shows only the days that have activities.
- **Entries that cannot be read:** when saved data contains entries that fail validation, the app leaves them out and says which kinds were left out. Before anything is saved over it, an unchanged copy of the original is kept in localStorage under a key starting `japan-stay-compare:v1:skipped:`, which the notice names. Data that cannot be read at all is kept the same way under a `japan-stay-compare:v1:unreadable:` key.
- **When that copy cannot be made** (for example, browser storage is full), the app pauses saving so the original is never overwritten, and says that changes are not being saved. From the notice you can try again after freeing space (saving resumes once the copy is kept), download the original as a file, or discard it, which asks for confirmation before saving over it.

## Limitations

- One trip at a time. There is no way to create or switch between trips yet.
- Only JPY, PHP, and USD are supported, and exchange rates are entered by hand.
- Data lives in one browser for one address. The development server (port 5173) and the preview (port 4173) keep separate data, and clearing site data removes it, so export a backup now and then.
- The scrolling tab strips fade their edges only in browsers that support scroll-driven animations, such as current Chrome and Safari. Elsewhere the edges are simply clipped.
- Browser tests run in Chromium only.
