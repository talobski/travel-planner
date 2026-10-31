import { type ReactNode, useId, useState } from "react"
import { PencilIcon, PlusIcon } from "lucide-react"
import { QuoteList } from "@/components/quote-list"
import { SummaryRow } from "@/components/summary-row"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { formatDateRange, formatDateRangeLong, pluralize } from "@/lib/dates"
import { stayNights } from "@/lib/labels"
import { parseAmount } from "@/lib/money"
import { buildComparison, getRate, setRate } from "@/lib/pricing"
import { CURRENCIES, type ComparisonSettings, type Currency, type Listing, type StayGroup } from "@/lib/types"

export function StayComparison({
  group,
  listings,
  comparison,
  onComparisonChange,
  onMove,
  onEdit,
  onDelete,
  onToggleBooked,
  onEditStay,
  onAddQuote,
}: {
  group: StayGroup
  listings: Listing[]
  comparison: ComparisonSettings
  onComparisonChange: (comparison: ComparisonSettings) => void
  /** Moves a quote to `index` among `sectionIds`, the quotes listed with it. */
  onMove: (id: string, index: number, sectionIds: string[]) => void
  onEdit: (listing: Listing, opener: HTMLElement | null) => void
  onDelete: (listing: Listing) => void
  onToggleBooked: (listing: Listing) => void
  onEditStay: (opener: HTMLElement) => void
  /** `opener` receives focus again when the add panel closes. */
  onAddQuote: (opener: HTMLElement) => void
}) {
  const result = buildComparison(group, listings, comparison)
  const total = result.sections.reduce((sum, section) => sum + section.rows.length, 0) + result.mismatched.length
  // Conversion only applies to ranked quotes, and only matters with more than one currency or a rate set.
  const showCurrencyControl = result.sections.length > 0 && (result.currencies.length > 1 || comparison.target !== null)
  const actions = { onEdit, onDelete, onToggleBooked }
  const moveWithin = (rows: { listing: Listing }[]) => (id: string, index: number) =>
    onMove(id, index, rows.map((row) => row.listing.id))
  // One Add quote per state: beside the summary, or under the empty-state message.
  const addQuote = (size: "default" | "sm" = "default") => (
    <Button size={size} onClick={(event) => onAddQuote(event.currentTarget)}>
      <PlusIcon data-icon="inline-start" />
      Add quote
    </Button>
  )

  return (
    <div className="flex flex-col gap-4">
      <SummaryRow action={total === 0 ? null : addQuote("sm")}>
        <span className="font-medium">{formatDateRangeLong(group.checkIn, group.checkOut)}</span>
        <span className="text-muted-foreground">{" · "}</span>
        {/* Nights, guests, and the pencil wrap as one, so a narrow screen breaks the line after the dates. */}
        <span className="whitespace-nowrap">
          <span className="text-muted-foreground">
            {pluralize(stayNights(group), "night")} · {pluralize(group.guests, "guest")}
          </span>
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Edit stay"
                  // Negative block margin keeps the button from growing the line it sits on.
                  className="-my-1.5 ml-1 align-middle text-muted-foreground"
                  onClick={(event) => onEditStay(event.currentTarget)}
                />
              }
            >
              {/* Same glyph size as the plus in New stay; the button keeps its 28px target. */}
              <PencilIcon className="size-3.5" />
            </TooltipTrigger>
            <TooltipContent>Edit stay</TooltipContent>
          </Tooltip>
        </span>
      </SummaryRow>

      {total === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-lg border px-4 py-10 text-center">
          <p className="text-sm text-muted-foreground">No quotes for this stay yet.</p>
          {addQuote()}
        </div>
      ) : (
        // One frame for every section, so the currency controls read as applying to all of them.
        <div className="overflow-hidden rounded-lg border" data-testid="quote-frame">
          {showCurrencyControl ? (
            <div
              role="group"
              aria-label="Currency conversion"
              className="flex flex-wrap items-start gap-x-4 gap-y-2 px-4 pt-3 pb-1"
            >
              <CurrencyControl
                comparison={comparison}
                currencies={result.currencies}
                missingRates={result.missingRates}
                onChange={onComparisonChange}
              />
            </div>
          ) : null}

          <div className="divide-y">
            {result.sections.map((section) => {
              const multiple = result.sections.length > 1 || section.converted
              const label = section.converted
                ? `Converted to ${section.currency}`
                : multiple
                  ? `Priced in ${section.currency}`
                  : "Quotes"
              return (
                <section key={`${section.currency}-${section.converted}`}>
                  {multiple ? (
                    <SectionHeading title={label}>
                      {section.converted ? "Estimates at your manual rate. Original prices are shown under each amount." : null}
                    </SectionHeading>
                  ) : null}
                  <QuoteList
                    rows={section.rows}
                    lowest={section.lowest}
                    converted={section.converted}
                    label={label}
                    onMove={moveWithin(section.rows)}
                    {...actions}
                  />
                  {!section.lowest && section.rows.length > 1 ? (
                    <p className="border-t px-4 py-2.5 text-xs text-muted-foreground">
                      No quote is confirmed all-in yet, so none is marked lowest.
                    </p>
                  ) : null}
                </section>
              )
            })}

            {result.mismatched.length > 0 ? (
              <section>
                <SectionHeading title="Different dates or guests">
                  Not ranked against {formatDateRange(group.checkIn, group.checkOut)}, {pluralize(group.guests, "guest")}.
                </SectionHeading>
                <QuoteList
                  rows={result.mismatched}
                  mismatched
                  label="Different dates or guests"
                  onMove={moveWithin(result.mismatched)}
                  {...actions}
                />
              </section>
            ) : null}
          </div>
        </div>
      )}
    </div>
  )
}

function SectionHeading({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="px-4 pt-4 pb-3">
      <h2 className="text-sm">{title}</h2>
      {children ? <p className="text-xs text-muted-foreground">{children}</p> : null}
    </div>
  )
}

function CurrencyControl({
  comparison,
  currencies,
  missingRates,
  onChange,
}: {
  comparison: ComparisonSettings
  currencies: Currency[]
  missingRates: Currency[]
  onChange: (comparison: ComparisonSettings) => void
}) {
  const id = useId()
  const target = comparison.target
  const others = target ? currencies.filter((currency) => currency !== target) : []

  return (
    <>
      <div>
        <Label htmlFor={id} className="sr-only">
          Currencies
        </Label>
        <NativeSelect
          id={id}
          size="sm"
          value={target ?? ""}
          onChange={(event) => {
            const value = event.target.value
            onChange({ ...comparison, target: value ? (value as Currency) : null })
          }}
        >
          <NativeSelectOption value="">Compare separately</NativeSelectOption>
          {CURRENCIES.map((currency) => (
            <NativeSelectOption key={currency} value={currency}>
              Convert to {currency}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </div>
      {target
        ? others.map((from) => (
            <RateInput
              key={`${from}:${target}`}
              from={from}
              to={target}
              missing={missingRates.includes(from)}
              value={getRate(comparison, from, target)}
              onChange={(rate) => onChange(setRate(comparison, from, target, rate))}
            />
          ))
        : null}
    </>
  )
}

function RateInput({
  from,
  to,
  value,
  missing,
  onChange,
}: {
  from: Currency
  to: Currency
  value: number | null
  missing: boolean
  onChange: (rate: number | null) => void
}) {
  const id = useId()
  const [text, setText] = useState(value === null ? "" : String(value))
  const parsed = parseAmount(text)
  const invalid = text.trim() !== "" && !(Number.isFinite(parsed) && parsed > 0)

  return (
    // The selects' options and "1 JPY = … PHP" name these controls visibly; the labels are for screen readers.
    <div className="flex flex-col gap-1">
      <Label htmlFor={id} className="sr-only">
        Manual {from} rate
      </Label>
      <div className="flex items-center gap-2 text-sm">
        <span className="whitespace-nowrap">1 {from} =</span>
        <Input
          id={id}
          inputMode="decimal"
          className="h-7 w-24 tabular-nums"
          placeholder="Rate"
          value={text}
          aria-invalid={invalid || undefined}
          aria-describedby={invalid || missing ? `${id}-hint` : undefined}
          onChange={(event) => {
            const next = event.target.value
            setText(next)
            const rate = parseAmount(next)
            onChange(Number.isFinite(rate) && rate > 0 ? rate : null)
          }}
        />
        <span>{to}</span>
      </div>
      {invalid || missing ? (
        <p id={`${id}-hint`} className={invalid ? "text-xs text-destructive" : "text-xs text-muted-foreground"}>
          {invalid ? "Enter a rate above 0." : `${from} quotes stay separate until you enter a rate.`}
        </p>
      ) : null}
    </div>
  )
}
