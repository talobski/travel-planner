import { useId, useState } from "react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { nightsBetween, pluralize } from "@/lib/dates"
import type { StayGroup } from "@/lib/types"
import { parseGuests, validateDates, validateGuests, type FieldErrors } from "@/lib/validation"

export function StayDialog({
  open,
  onOpenChange,
  group,
  quoteCount,
  canDelete,
  onSave,
  onDelete,
  finalFocus,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Present when editing. */
  group: StayGroup | null
  quoteCount: number
  /** False when this is the only stay left. */
  canDelete: boolean
  onSave: (group: Omit<StayGroup, "id"> & { id?: string }) => void
  onDelete: (id: string) => void
  /** Where focus goes when the dialog closes. */
  finalFocus?: () => HTMLElement | boolean
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" finalFocus={finalFocus}>
        {open ? (
          <StayForm
            key={group?.id ?? "new"}
            group={group}
            quoteCount={quoteCount}
            canDelete={canDelete}
            onSave={onSave}
            onDelete={onDelete}
            onCancel={() => onOpenChange(false)}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

function StayForm({
  group,
  quoteCount,
  canDelete,
  onSave,
  onDelete,
  onCancel,
}: {
  group: StayGroup | null
  quoteCount: number
  canDelete: boolean
  onSave: (group: Omit<StayGroup, "id"> & { id?: string }) => void
  onDelete: (id: string) => void
  onCancel: () => void
}) {
  const id = useId()
  const [area, setArea] = useState(group?.area ?? "")
  const [checkIn, setCheckIn] = useState(group?.checkIn ?? "")
  const [checkOut, setCheckOut] = useState(group?.checkOut ?? "")
  const [guests, setGuests] = useState(group ? String(group.guests) : "2")
  const [submitted, setSubmitted] = useState(false)

  const errors: FieldErrors = { ...validateDates(checkIn, checkOut) }
  if (!area.trim()) errors.area = "Enter an area."
  const guestError = validateGuests(parseGuests(guests))
  if (guestError) errors.guests = guestError
  const shown = submitted ? errors : {}
  const nights = nightsBetween(checkIn, checkOut)

  function submit(event: React.FormEvent) {
    event.preventDefault()
    setSubmitted(true)
    if (Object.keys(errors).length > 0) return
    onSave({ id: group?.id, area: area.trim(), checkIn, checkOut, guests: parseGuests(guests) })
  }

  const invalid = (name: string) => ({
    "aria-invalid": shown[name] ? true : undefined,
    "aria-describedby": shown[name] ? `${id}-${name}-error` : undefined,
  })
  const error = (name: string) =>
    shown[name] ? <FieldError id={`${id}-${name}-error`}>{shown[name]}</FieldError> : null

  return (
    <form onSubmit={submit} noValidate className="grid gap-4">
      <DialogHeader>
        <DialogTitle>{group ? "Edit stay" : "New stay"}</DialogTitle>
        <DialogDescription>
          {group && quoteCount > 0
            ? "Quotes keep their own dates and guests. Any that no longer match will be listed separately."
            : "Quotes are compared within a stay of the same dates and guest count."}
        </DialogDescription>
      </DialogHeader>
      <FieldGroup className="gap-4">
        <Field data-invalid={!!shown.area || undefined}>
          <FieldLabel htmlFor={`${id}-area`}>Area</FieldLabel>
          <Input
            id={`${id}-area`}
            value={area}
            onChange={(event) => setArea(event.target.value)}
            placeholder="Kyoto"
            autoComplete="off"
            autoFocus
            {...invalid("area")}
          />
          {error("area")}
        </Field>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-[1fr_1fr_5.5rem]">
          <Field data-invalid={!!shown.checkIn || undefined}>
            <FieldLabel htmlFor={`${id}-checkIn`}>Check-in</FieldLabel>
            <Input
              id={`${id}-checkIn`}
              type="date"
              value={checkIn}
              onChange={(event) => setCheckIn(event.target.value)}
              {...invalid("checkIn")}
            />
          </Field>
          <Field data-invalid={!!shown.checkOut || undefined}>
            <FieldLabel htmlFor={`${id}-checkOut`}>Check-out</FieldLabel>
            <Input
              id={`${id}-checkOut`}
              type="date"
              value={checkOut}
              min={checkIn || undefined}
              onChange={(event) => setCheckOut(event.target.value)}
              {...invalid("checkOut")}
            />
          </Field>
          <Field data-invalid={!!shown.guests || undefined}>
            <FieldLabel htmlFor={`${id}-guests`}>Guests</FieldLabel>
            <Input
              id={`${id}-guests`}
              type="number"
              inputMode="numeric"
              min={1}
              max={30}
              value={guests}
              onChange={(event) => setGuests(event.target.value)}
              {...invalid("guests")}
            />
          </Field>
        </div>
        {error("checkIn")}
        {error("checkOut")}
        {error("guests")}
        {nights !== null && nights > 0 && !errors.checkOut ? (
          <p className="text-sm text-muted-foreground">{pluralize(nights, "night")}</p>
        ) : null}
        {group && quoteCount > 0 ? (
          <p className="text-xs text-muted-foreground">
            To delete this stay, first delete or move its {pluralize(quoteCount, "quote")}.
          </p>
        ) : null}
      </FieldGroup>
      <DialogFooter className="sm:justify-between">
        {group ? (
          <Button
            type="button"
            variant="destructive"
            disabled={quoteCount > 0 || !canDelete}
            onClick={() => onDelete(group.id)}
          >
            Delete stay
          </Button>
        ) : (
          <span />
        )}
        <div className="flex flex-col-reverse gap-2 sm:flex-row">
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit">{group ? "Save stay" : "Add stay"}</Button>
        </div>
      </DialogFooter>
    </form>
  )
}
