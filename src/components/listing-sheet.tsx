import { useEffect, useId, useMemo, useRef, useState } from "react"
import { TriangleAlertIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { Textarea } from "@/components/ui/textarea"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { formatDateRange, nightsBetween, pluralize } from "@/lib/dates"
import { FEE_CERTAINTY_HINTS, FEE_CERTAINTY_LABELS, staySummary } from "@/lib/labels"
import { formatMoney, parseAmount } from "@/lib/money"
import { computeQuote, perPersonNightly } from "@/lib/pricing"
import { CURRENCIES, SOURCES, type Currency, type FeeCertainty, type Listing, type StayGroup } from "@/lib/types"
import {
  parseGuests,
  validateGuests,
  validateListingForm,
  type FieldErrors,
  type ListingDraft,
  type ListingFormValues,
} from "@/lib/validation"

const CERTAINTIES: FeeCertainty[] = ["confirmed", "estimated", "unknown"]

function valuesFromListing(listing: Listing): ListingFormValues {
  return {
    groupId: listing.groupId,
    name: listing.name,
    area: listing.area,
    source: listing.source,
    url: listing.url,
    checkIn: listing.checkIn,
    checkOut: listing.checkOut,
    guests: String(listing.guests),
    currency: listing.currency,
    amount: String(listing.amount),
    basis: listing.basis,
    extraFees: listing.extraFees ? String(listing.extraFees) : "",
    feeCertainty: listing.feeCertainty,
    notes: listing.notes,
  }
}

function valuesForGroup(group: StayGroup, currency: Currency): ListingFormValues {
  return {
    groupId: group.id,
    name: "",
    area: "",
    source: "Airbnb",
    url: "",
    checkIn: group.checkIn,
    checkOut: group.checkOut,
    guests: String(group.guests),
    currency,
    amount: "",
    basis: "stay",
    extraFees: "",
    feeCertainty: "unknown",
    notes: "",
  }
}

export interface ListingSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  groups: StayGroup[]
  /** Stay used for a new quote. */
  defaultGroup: StayGroup
  defaultCurrency: Currency
  /** Present when editing. */
  listing: Listing | null
  onSave: (draft: ListingDraft) => void
  /** Where focus goes when the panel closes. */
  finalFocus?: () => HTMLElement | boolean
}

export function ListingSheet(props: ListingSheetProps) {
  return (
    <Sheet open={props.open} onOpenChange={props.onOpenChange}>
      <SheetContent
        side="right"
        finalFocus={props.finalFocus}
        className="gap-0 data-[side=right]:w-full data-[side=right]:sm:max-w-lg"
      >
        {props.open && <ListingForm key={props.listing?.id ?? "new"} {...props} />}
      </SheetContent>
    </Sheet>
  )
}

function ListingForm({ groups, defaultGroup, defaultCurrency, listing, onSave, onOpenChange }: ListingSheetProps) {
  const id = useId()
  const [values, setValues] = useState<ListingFormValues>(() =>
    listing ? valuesFromListing(listing) : valuesForGroup(defaultGroup, defaultCurrency),
  )
  const [submitted, setSubmitted] = useState(false)
  const formRef = useRef<HTMLFormElement>(null)

  const groupIds = useMemo(() => new Set(groups.map((group) => group.id)), [groups])
  const { draft, errors } = validateListingForm(values, groupIds)
  const shownErrors: FieldErrors = submitted ? errors : {}
  const group = groups.find((item) => item.id === values.groupId)

  useEffect(() => {
    if (!submitted) return
    formRef.current?.querySelector<HTMLElement>("[aria-invalid=true]")?.focus()
  }, [submitted])

  function set<K extends keyof ListingFormValues>(key: K, value: ListingFormValues[K]) {
    setValues((current) => ({ ...current, [key]: value }))
  }

  function changeGroup(groupId: string) {
    const next = groups.find((item) => item.id === groupId)
    setValues((current) =>
      next
        ? { ...current, groupId, checkIn: next.checkIn, checkOut: next.checkOut, guests: String(next.guests) }
        : { ...current, groupId },
    )
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (!draft) {
      if (submitted) formRef.current?.querySelector<HTMLElement>("[aria-invalid=true]")?.focus()
      setSubmitted(true)
      return
    }
    onSave(draft)
  }

  const guests = parseGuests(values.guests)
  const nights = nightsBetween(values.checkIn, values.checkOut)
  const datesDiffer = group && (values.checkIn !== group.checkIn || values.checkOut !== group.checkOut)
  const guestsDiffer = group && Number.isInteger(guests) && guests !== group.guests

  const field = (name: keyof ListingFormValues) => ({
    id: `${id}-${name}`,
    name,
    "aria-invalid": shownErrors[name] ? true : undefined,
    "aria-describedby": shownErrors[name] ? `${id}-${name}-error` : undefined,
  })
  const error = (name: keyof ListingFormValues) =>
    shownErrors[name] ? <FieldError id={`${id}-${name}-error`}>{shownErrors[name]}</FieldError> : null

  return (
    <form ref={formRef} onSubmit={handleSubmit} noValidate className="flex min-h-0 flex-1 flex-col">
      <SheetHeader className="border-b pr-12">
        <SheetTitle>{listing ? "Edit quote" : "Add quote"}</SheetTitle>
        <SheetDescription className="sr-only">
          Enter the price as the source shows it. The stay total and nightly rate update as you type.
        </SheetDescription>
      </SheetHeader>

      <ScrollArea className="min-h-0 flex-1" data-testid="listing-sheet-scroll">
        <FieldGroup className="px-4 py-5">
          <Field data-invalid={!!shownErrors.groupId || undefined}>
            <FieldLabel htmlFor={`${id}-groupId`}>Stay</FieldLabel>
            <NativeSelect
              className="w-full"
              {...field("groupId")}
              value={values.groupId}
              onChange={(event) => changeGroup(event.target.value)}
            >
              {groups.map((item) => (
                <NativeSelectOption key={item.id} value={item.id}>
                  {item.area} · {staySummary(item)}
                </NativeSelectOption>
              ))}
            </NativeSelect>
            {error("groupId")}
          </Field>

          <Field data-invalid={!!shownErrors.name || undefined}>
            <FieldLabel htmlFor={`${id}-name`}>Name</FieldLabel>
            <Input
              {...field("name")}
              value={values.name}
              onChange={(event) => set("name", event.target.value)}
              placeholder="Listing title"
              autoComplete="off"
              autoFocus
            />
            {error("name")}
          </Field>

          <div className="grid gap-5 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor={`${id}-area`}>Area</FieldLabel>
              <Input
                {...field("area")}
                value={values.area}
                onChange={(event) => set("area", event.target.value)}
                placeholder="Riverside"
                autoComplete="off"
              />
            </Field>
            <Field>
              <FieldLabel htmlFor={`${id}-source`}>Source</FieldLabel>
              <NativeSelect
                className="w-full"
                {...field("source")}
                value={values.source}
                onChange={(event) => set("source", event.target.value)}
              >
                {(SOURCES as readonly string[]).includes(values.source) ? null : (
                  <NativeSelectOption value={values.source}>{values.source}</NativeSelectOption>
                )}
                {SOURCES.map((source) => (
                  <NativeSelectOption key={source} value={source}>
                    {source}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </Field>
          </div>

          <Field data-invalid={!!shownErrors.url || undefined}>
            <FieldLabel htmlFor={`${id}-url`}>Link</FieldLabel>
            <Input
              {...field("url")}
              type="url"
              inputMode="url"
              value={values.url}
              onChange={(event) => set("url", event.target.value)}
              placeholder="https://"
              autoComplete="off"
            />
            {error("url")}
          </Field>

          <FieldSet className="min-w-0">
            <FieldLegend variant="label">Dates and guests</FieldLegend>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-[1fr_1fr_6rem]">
              <Field data-invalid={!!shownErrors.checkIn || undefined}>
                <FieldLabel htmlFor={`${id}-checkIn`} className="text-xs text-muted-foreground">
                  Check-in
                </FieldLabel>
                <Input
                  {...field("checkIn")}
                  type="date"
                  value={values.checkIn}
                  onChange={(event) => set("checkIn", event.target.value)}
                />
              </Field>
              <Field data-invalid={!!shownErrors.checkOut || undefined}>
                <FieldLabel htmlFor={`${id}-checkOut`} className="text-xs text-muted-foreground">
                  Check-out
                </FieldLabel>
                <Input
                  {...field("checkOut")}
                  type="date"
                  value={values.checkOut}
                  min={values.checkIn || undefined}
                  onChange={(event) => set("checkOut", event.target.value)}
                />
              </Field>
              <Field data-invalid={!!shownErrors.guests || undefined}>
                <FieldLabel htmlFor={`${id}-guests`} className="text-xs text-muted-foreground">
                  Guests
                </FieldLabel>
                <Input
                  {...field("guests")}
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={30}
                  step={1}
                  value={values.guests}
                  onChange={(event) => set("guests", event.target.value)}
                />
              </Field>
            </div>
            {error("checkIn")}
            {error("checkOut")}
            {error("guests")}
            {(datesDiffer || guestsDiffer) && group ? (
              <p className="flex gap-2 text-sm text-warning-foreground">
                <TriangleAlertIcon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                <span>
                  Differs from {group.area} {formatDateRange(group.checkIn, group.checkOut)},{" "}
                  {pluralize(group.guests, "guest")}. It will be listed separately, not ranked.
                </span>
              </p>
            ) : null}
          </FieldSet>

          <FieldSet className="min-w-0">
            <FieldLegend variant="label">Price</FieldLegend>
            <FieldDescription>
              As the source shows it, for the whole place
              {Number.isInteger(guests) && guests > 0 ? ` and ${pluralize(guests, "guest")}` : ""}. Not per
              person.
            </FieldDescription>
            <ToggleGroup
              variant="outline"
              spacing={0}
              className="w-full"
              aria-label="Price shown as"
              value={[values.basis]}
              onValueChange={(next) => {
                const basis = next[0]
                if (basis === "nightly" || basis === "stay") set("basis", basis)
              }}
            >
              <ToggleGroupItem value="stay" className="flex-1">
                Total for stay
              </ToggleGroupItem>
              <ToggleGroupItem value="nightly" className="flex-1">
                Per night
              </ToggleGroupItem>
            </ToggleGroup>
            <div className="grid grid-cols-[6.5rem_1fr] gap-3">
              <Field>
                <FieldLabel htmlFor={`${id}-currency`} className="sr-only">
                  Currency
                </FieldLabel>
                <NativeSelect
                  className="w-full"
                  {...field("currency")}
                  value={values.currency}
                  onChange={(event) => set("currency", event.target.value as Currency)}
                >
                  {CURRENCIES.map((currency) => (
                    <NativeSelectOption key={currency} value={currency}>
                      {currency}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </Field>
              <Field data-invalid={!!shownErrors.amount || undefined}>
                <FieldLabel htmlFor={`${id}-amount`} className="sr-only">
                  {values.basis === "nightly" ? "Price per night" : "Price for the stay"}
                </FieldLabel>
                <Input
                  {...field("amount")}
                  inputMode="decimal"
                  value={values.amount}
                  onChange={(event) => set("amount", event.target.value)}
                  placeholder={values.basis === "nightly" ? "Price per night" : "Price for the stay"}
                  autoComplete="off"
                  className="tabular-nums"
                />
              </Field>
            </div>
            {error("amount")}
          </FieldSet>

          <Field data-invalid={!!shownErrors.extraFees || undefined}>
            <FieldLabel htmlFor={`${id}-extraFees`}>Extra fees not included above</FieldLabel>
            <Input
              {...field("extraFees")}
              inputMode="decimal"
              value={values.extraFees}
              onChange={(event) => set("extraFees", event.target.value)}
              placeholder="0"
              autoComplete="off"
              className="tabular-nums"
              aria-describedby={[`${id}-extraFees-hint`, shownErrors.extraFees && `${id}-extraFees-error`]
                .filter(Boolean)
                .join(" ")}
            />
            <FieldDescription id={`${id}-extraFees-hint`}>
              Cleaning, service, and taxes, once for the whole stay in {values.currency}. Leave empty if the price
              already includes them, as Airbnb totals usually do.
            </FieldDescription>
            {error("extraFees")}
          </Field>

          <FieldSet className="min-w-0">
            <FieldLegend variant="label">Fees</FieldLegend>
            <RadioGroup
              aria-label="Fee status"
              value={values.feeCertainty}
              onValueChange={(value) => set("feeCertainty", value as FeeCertainty)}
              className="gap-3"
            >
              {CERTAINTIES.map((certainty) => (
                <Field key={certainty} orientation="horizontal">
                  <RadioGroupItem
                    value={certainty}
                    id={`${id}-fee-${certainty}`}
                    aria-describedby={`${id}-fee-${certainty}-hint`}
                  />
                  <FieldContent>
                    <FieldLabel htmlFor={`${id}-fee-${certainty}`}>{FEE_CERTAINTY_LABELS[certainty]}</FieldLabel>
                    <FieldDescription id={`${id}-fee-${certainty}-hint`}>
                      {FEE_CERTAINTY_HINTS[certainty]}
                    </FieldDescription>
                  </FieldContent>
                </Field>
              ))}
            </RadioGroup>
          </FieldSet>

          <Field>
            <FieldLabel htmlFor={`${id}-notes`}>Notes</FieldLabel>
            <Textarea
              {...field("notes")}
              value={values.notes}
              onChange={(event) => set("notes", event.target.value)}
              placeholder="Elevator, beds, walk to station"
              rows={3}
            />
          </Field>
        </FieldGroup>
      </ScrollArea>

      <SheetFooter className="mt-0 gap-3 border-t bg-popover">
        <LivePreview values={values} nights={nights} />
        <div className="flex gap-2">
          <Button type="button" variant="outline" size="lg" className="flex-1" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" size="lg" className="flex-1">
            {listing ? "Save changes" : "Add quote"}
          </Button>
        </div>
      </SheetFooter>
    </form>
  )
}

function LivePreview({ values, nights }: { values: ListingFormValues; nights: number | null }) {
  const amount = parseAmount(values.amount)
  const extraFees = values.extraFees.trim() === "" ? 0 : parseAmount(values.extraFees)
  const quote = computeQuote({
    checkIn: values.checkIn,
    checkOut: values.checkOut,
    amount,
    basis: values.basis,
    extraFees,
  })
  const money = (value: number) => formatMoney(value, values.currency)
  const guests = parseGuests(values.guests)
  const guestsValid = validateGuests(guests) === undefined

  if (!quote) {
    const reason =
      nights === null
        ? "Enter valid dates to see the total."
        : nights < 1
          ? "Check-out must be after check-in."
          : !Number.isFinite(extraFees) || extraFees < 0
            ? "Extra fees must be 0 or more."
            : "Enter a price to see the total."
    return (
      <p className="text-sm text-muted-foreground" aria-live="polite">
        {reason}
      </p>
    )
  }

  return (
    <div aria-live="polite" className="flex flex-col gap-1">
      <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 text-sm tabular-nums" aria-label="Calculated price">
        <dt className="text-muted-foreground">
          {values.basis === "nightly"
            ? `${money(amount)} × ${pluralize(quote.nights, "night")}`
            : `Stay price, ${pluralize(quote.nights, "night")}`}
        </dt>
        <dd className="text-right">{money(quote.baseTotal)}</dd>
        <dt className="text-muted-foreground">Extra fees</dt>
        <dd className="text-right">
          {values.feeCertainty === "unknown" && quote.extraFees === 0 ? "Unknown" : money(quote.extraFees)}
        </dd>
        <dt className="font-medium">Stay total</dt>
        <dd className="text-right text-base font-semibold" data-testid="preview-total">
          {money(quote.stayTotal)}
        </dd>
        <dt className="text-muted-foreground">Per night, incl. fees</dt>
        <dd className="text-right" data-testid="preview-nightly">
          {money(quote.effectiveNightly)}
        </dd>
        <dt className="text-muted-foreground">
          Per person / night{guestsValid ? `, ${pluralize(guests, "guest")}` : ""}
        </dt>
        <dd className="text-right" data-testid="preview-per-person">
          {guestsValid ? (
            money(perPersonNightly(quote.stayTotal, quote.nights, guests)!)
          ) : (
            <span className="text-muted-foreground">Enter guests</span>
          )}
        </dd>
      </dl>
      {values.feeCertainty !== "confirmed" ? (
        <p className="text-xs text-warning-foreground">
          {values.feeCertainty === "unknown"
            ? "Fees unknown, so the real total may be higher."
            : "Includes estimated fees."}
        </p>
      ) : null}
    </div>
  )
}
