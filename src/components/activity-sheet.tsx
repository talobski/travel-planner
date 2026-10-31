import { useEffect, useId, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Textarea } from "@/components/ui/textarea"
import { dayParts } from "@/lib/itinerary"
import type { Activity } from "@/lib/types"
import {
  validateActivityForm,
  type ActivityDraft,
  type ActivityFormValues,
  type FieldErrors,
} from "@/lib/validation"

export interface ActivitySheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Day used for a new activity. */
  defaultDate: string
  /** The days the itinerary shows, which include the day of every saved activity. */
  days: readonly string[]
  /** Present when editing. */
  activity: Activity | null
  onSave: (draft: ActivityDraft) => void
  /** Where focus goes when the panel closes. */
  finalFocus?: () => HTMLElement | boolean
}

export function ActivitySheet(props: ActivitySheetProps) {
  return (
    <Sheet open={props.open} onOpenChange={props.onOpenChange}>
      <SheetContent
        side="right"
        finalFocus={props.finalFocus}
        className="gap-0 data-[side=right]:w-full data-[side=right]:sm:max-w-lg"
      >
        {props.open && <ActivityForm key={props.activity?.id ?? "new"} {...props} />}
      </SheetContent>
    </Sheet>
  )
}

function ActivityForm({ defaultDate, days, activity, onSave, onOpenChange }: ActivitySheetProps) {
  const id = useId()
  const [values, setValues] = useState<ActivityFormValues>(() => ({
    date: activity?.date ?? defaultDate,
    name: activity?.name ?? "",
    time: activity?.time ?? "",
    location: activity?.location ?? "",
    url: activity?.url ?? "",
    notes: activity?.notes ?? "",
  }))
  const [submitted, setSubmitted] = useState(false)
  const formRef = useRef<HTMLFormElement>(null)
  const timeRef = useRef<HTMLInputElement>(null)

  const { draft, errors } = validateActivityForm(values)
  const shownErrors: FieldErrors = submitted ? errors : {}

  useEffect(() => {
    if (!submitted) return
    formRef.current?.querySelector<HTMLElement>("[aria-invalid=true]")?.focus()
  }, [submitted])

  function set<K extends keyof ActivityFormValues>(key: K, value: ActivityFormValues[K]) {
    setValues((current) => ({ ...current, [key]: value }))
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

  const field = (name: keyof ActivityFormValues) => ({
    id: `${id}-${name}`,
    name,
    "aria-invalid": shownErrors[name] ? true : undefined,
    "aria-describedby": shownErrors[name] ? `${id}-${name}-error` : undefined,
  })
  const error = (name: keyof ActivityFormValues) =>
    shownErrors[name] ? <FieldError id={`${id}-${name}-error`}>{shownErrors[name]}</FieldError> : null

  return (
    <form ref={formRef} onSubmit={handleSubmit} noValidate className="flex min-h-0 flex-1 flex-col">
      <SheetHeader className="border-b pr-12">
        <SheetTitle>{activity ? "Edit activity" : "Add activity"}</SheetTitle>
        <SheetDescription className="sr-only">Only the name and day are required.</SheetDescription>
      </SheetHeader>

      <ScrollArea className="min-h-0 flex-1" data-testid="activity-sheet-scroll">
        <FieldGroup className="px-4 py-5">
          <Field data-invalid={!!shownErrors.name || undefined}>
            <FieldLabel htmlFor={`${id}-name`}>Name</FieldLabel>
            <Input
              {...field("name")}
              value={values.name}
              onChange={(event) => set("name", event.target.value)}
              placeholder="Central Market"
              autoComplete="off"
              autoFocus
            />
            {error("name")}
          </Field>

          <div className="grid gap-5 sm:grid-cols-2">
            <Field data-invalid={!!shownErrors.date || undefined}>
              <FieldLabel htmlFor={`${id}-date`}>Day</FieldLabel>
              <NativeSelect
                className="w-full"
                {...field("date")}
                value={values.date}
                onChange={(event) => set("date", event.target.value)}
              >
                {days.map((date) => {
                  const { weekday, monthDay } = dayParts(date)
                  return (
                    <NativeSelectOption key={date} value={date}>
                      {weekday}, {monthDay}
                    </NativeSelectOption>
                  )
                })}
              </NativeSelect>
              {error("date")}
            </Field>

            <Field data-invalid={!!shownErrors.time || undefined}>
              <FieldLabel htmlFor={`${id}-time`}>Time</FieldLabel>
              <div className="flex gap-2">
                <Input
                  ref={timeRef}
                  {...field("time")}
                  type="time"
                  value={values.time}
                  onChange={(event) => set("time", event.target.value)}
                  className="min-w-0 flex-1 tabular-nums"
                  aria-describedby={[`${id}-time-hint`, shownErrors.time && `${id}-time-error`].filter(Boolean).join(" ")}
                />
                {values.time ? (
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => {
                      set("time", "")
                      timeRef.current?.focus()
                    }}
                  >
                    Clear
                  </Button>
                ) : null}
              </div>
              <FieldDescription id={`${id}-time-hint`}>Leave empty if the time is flexible.</FieldDescription>
              {error("time")}
            </Field>
          </div>

          <Field data-invalid={!!shownErrors.location || undefined}>
            <FieldLabel htmlFor={`${id}-location`}>Location</FieldLabel>
            <Input
              {...field("location")}
              value={values.location}
              onChange={(event) => set("location", event.target.value)}
              placeholder="Old Town"
              autoComplete="off"
            />
            {error("location")}
          </Field>

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
              aria-describedby={[`${id}-url-hint`, shownErrors.url && `${id}-url-error`].filter(Boolean).join(" ")}
            />
            <FieldDescription id={`${id}-url-hint`}>Google Maps or any reference page.</FieldDescription>
            {error("url")}
          </Field>

          <Field>
            <FieldLabel htmlFor={`${id}-notes`}>Notes</FieldLabel>
            <Textarea
              {...field("notes")}
              value={values.notes}
              onChange={(event) => set("notes", event.target.value)}
              placeholder="Tickets, opening hours, meeting point"
              rows={4}
            />
          </Field>
        </FieldGroup>
      </ScrollArea>

      <SheetFooter className="mt-0 gap-3 border-t bg-popover">
        <div className="flex gap-2">
          <Button type="button" variant="outline" size="lg" className="flex-1" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" size="lg" className="flex-1">
            {activity ? "Save changes" : "Add activity"}
          </Button>
        </div>
      </SheetFooter>
    </form>
  )
}
