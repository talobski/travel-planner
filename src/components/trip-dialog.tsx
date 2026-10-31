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
import { formatDateRangeLong, pluralize } from "@/lib/dates"
import { tripLength } from "@/lib/itinerary"
import type { Activity, StayGroup, Trip } from "@/lib/types"
import { validateTripForm, type FieldErrors, type TripFormValues } from "@/lib/validation"

export function TripDialog({
  open,
  onOpenChange,
  trip,
  groups,
  activities,
  onSave,
  finalFocus,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Null when saved data has no trip details yet. */
  trip: Trip | null
  groups: readonly StayGroup[]
  activities: readonly Activity[]
  onSave: (trip: Trip) => void
  /** Where focus goes when the dialog closes. */
  finalFocus?: () => HTMLElement | boolean
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" finalFocus={finalFocus}>
        {open ? (
          <TripForm
            trip={trip}
            groups={groups}
            activities={activities}
            onSave={onSave}
            onCancel={() => onOpenChange(false)}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

/** First and last date mentioned by any stay or activity, or null when there are none. */
function savedSpan(groups: readonly StayGroup[], activities: readonly Activity[]) {
  const dates = [
    ...groups.flatMap((group) => [group.checkIn, group.checkOut]),
    ...activities.map((activity) => activity.date),
  ].sort()
  return dates.length ? { first: dates[0], last: dates[dates.length - 1] } : null
}

function TripForm({
  trip,
  groups,
  activities,
  onSave,
  onCancel,
}: {
  trip: Trip | null
  groups: readonly StayGroup[]
  activities: readonly Activity[]
  onSave: (trip: Trip) => void
  onCancel: () => void
}) {
  const id = useId()
  const [values, setValues] = useState<TripFormValues>(() => ({
    name: trip?.name ?? "",
    destination: trip?.destination ?? "",
    start: trip?.start ?? "",
    end: trip?.end ?? "",
  }))
  const [submitted, setSubmitted] = useState(false)

  const { trip: draft, errors } = validateTripForm(values)
  const shown: FieldErrors = submitted ? errors : {}
  const datesValid = !errors.start && !errors.end
  const outside = datesValid
    ? activities.filter((activity) => activity.date < values.start || activity.date > values.end).length
    : 0
  const span = trip ? null : savedSpan(groups, activities)

  function set<K extends keyof TripFormValues>(key: K, value: string) {
    setValues((current) => ({ ...current, [key]: value }))
  }

  function submit(event: React.FormEvent) {
    event.preventDefault()
    setSubmitted(true)
    if (draft) onSave(draft)
  }

  const invalid = (name: keyof TripFormValues) => ({
    "aria-invalid": shown[name] ? true : undefined,
    "aria-describedby": shown[name] ? `${id}-${name}-error` : undefined,
  })
  const error = (name: keyof TripFormValues) =>
    shown[name] ? <FieldError id={`${id}-${name}-error`}>{shown[name]}</FieldError> : null

  return (
    <form onSubmit={submit} noValidate className="grid gap-4">
      <DialogHeader>
        <DialogTitle>{trip ? "Edit trip" : "Set trip details"}</DialogTitle>
        <DialogDescription>
          {trip
            ? "Changing the dates never moves or removes stays or activities."
            : "Your saved data has no trip dates yet. Choose the first and last day so days with nothing planned also appear."}
        </DialogDescription>
      </DialogHeader>
      <FieldGroup className="gap-4">
        <Field data-invalid={!!shown.name || undefined}>
          <FieldLabel htmlFor={`${id}-name`}>Name</FieldLabel>
          <Input
            id={`${id}-name`}
            value={values.name}
            onChange={(event) => set("name", event.target.value)}
            placeholder="Spring trip"
            autoComplete="off"
            autoFocus
            {...invalid("name")}
          />
          {error("name")}
        </Field>
        <Field data-invalid={!!shown.destination || undefined}>
          <FieldLabel htmlFor={`${id}-destination`}>Destination</FieldLabel>
          <Input
            id={`${id}-destination`}
            value={values.destination}
            onChange={(event) => set("destination", event.target.value)}
            placeholder="Lisbon"
            autoComplete="off"
            {...invalid("destination")}
          />
          {error("destination")}
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field data-invalid={!!shown.start || undefined}>
            <FieldLabel htmlFor={`${id}-start`}>First day</FieldLabel>
            <Input
              id={`${id}-start`}
              type="date"
              value={values.start}
              onChange={(event) => set("start", event.target.value)}
              {...invalid("start")}
            />
          </Field>
          <Field data-invalid={!!shown.end || undefined}>
            <FieldLabel htmlFor={`${id}-end`}>Last day</FieldLabel>
            <Input
              id={`${id}-end`}
              type="date"
              value={values.end}
              min={values.start || undefined}
              onChange={(event) => set("end", event.target.value)}
              {...invalid("end")}
            />
          </Field>
        </div>
        {error("start")}
        {error("end")}
        {span ? (
          <p className="text-sm text-muted-foreground">
            Your stays and activities run from {formatDateRangeLong(span.first, span.last)}.
          </p>
        ) : null}
        {datesValid ? (
          <p className="text-sm text-muted-foreground" data-testid="trip-length">
            {pluralize(tripLength(values), "day")}
            {outside === 1 ? ". 1 activity is outside these dates and stays on its own day." : null}
            {outside > 1 ? `. ${outside} activities are outside these dates and stay on their own days.` : null}
          </p>
        ) : null}
      </FieldGroup>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit">Save trip</Button>
      </DialogFooter>
    </form>
  )
}
