import type { Currency } from "./types"

const formatters = new Map<Currency, Intl.NumberFormat>()

function formatter(currency: Currency) {
  let format = formatters.get(currency)
  if (!format) {
    format = new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      currencyDisplay: "narrowSymbol",
    })
    formatters.set(currency, format)
  }
  return format
}

/** ¥45,000 / ₱12,345.50 / $120.00, using each currency's standard minor units. */
export function formatMoney(value: number, currency: Currency) {
  return formatter(currency).format(value)
}

export const CURRENCY_LABELS: Record<Currency, string> = {
  JPY: "JPY ¥",
  PHP: "PHP ₱",
  USD: "USD $",
}

/** Parse user-entered amounts like "12,500" or "12500.50". Returns NaN for anything else. */
export function parseAmount(raw: string): number {
  const cleaned = raw.trim().replace(/,/g, "")
  if (cleaned === "" || !/^\d*\.?\d+$|^\d+\.$/.test(cleaned)) return Number.NaN
  return Number(cleaned)
}
