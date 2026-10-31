import { useEffect, useMemo, useRef, useState } from "react"
import { ListIcon, PlusIcon } from "lucide-react"
import { toast } from "sonner"
import { ActivitySheet } from "@/components/activity-sheet"
import { ActivityTable } from "@/components/activity-table"
import { Button } from "@/components/ui/button"
import { SummaryRow } from "@/components/summary-row"
import { TabStrip } from "@/components/tab-strip"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import type { AppStore } from "@/hooks/use-app-data"
import { useReturnFocus } from "@/hooks/use-return-focus"
import { pluralize } from "@/lib/dates"
import { activitiesOn, dayParts, formatDay, formatDaySpoken, isInTrip, itineraryDays } from "@/lib/itinerary"
import { STORAGE_KEY } from "@/lib/storage"
import type { Activity, StayGroup, Trip } from "@/lib/types"

const SELECTED_DAY_KEY = `${STORAGE_KEY}:selected-day`

/** The trip's first day, else the first day shown. */
function firstDay(days: readonly string[], trip: Trip | null) {
  return trip && days.includes(trip.start) ? trip.start : (days[0] ?? "")
}

/** The remembered day, else today during the trip, else the first day. */
function initialDay(days: readonly string[], trip: Trip | null) {
  try {
    const saved = localStorage.getItem(SELECTED_DAY_KEY)
    if (saved && days.includes(saved)) return saved
  } catch {
    // Fall through to the defaults.
  }
  const now = new Date()
  const today = [now.getFullYear(), now.getMonth() + 1, now.getDate()].map((n) => String(n).padStart(2, "0")).join("-")
  return days.includes(today) ? today : firstDay(days, trip)
}

/** Areas of the stays that cover the night of `date`. */
function stayAreas(groups: StayGroup[], date: string) {
  return [...new Set(groups.filter((group) => group.checkIn <= date && date < group.checkOut).map((group) => group.area))]
}

export function ItineraryPage({
  store,
  onEditTrip,
}: {
  store: AppStore
  /** `opener` receives focus again when the trip dialog closes. */
  onEditTrip: (opener: HTMLElement | null) => void
}) {
  const { data } = store
  const { trip } = data
  // Every trip day, planned or not, and any day outside the trip that still has activities.
  const days = useMemo(() => itineraryDays(trip, data.activities), [trip, data.activities])
  const [chosen, setDay] = useState(() => initialDay(days, trip))
  // A day can drop out of the list when the trip dates change or its last outside activity is removed.
  const day = days.includes(chosen) ? chosen : firstDay(days, trip)
  const [sheet, setSheet] = useState<{ open: boolean; activity: Activity | null }>({ open: false, activity: null })
  const sheetFocus = useReturnFocus()
  const listRef = useRef<HTMLDivElement>(null)

  // A trip's days rarely fit on one screen; start with the chosen day in view.
  useEffect(() => {
    listRef.current
      ?.querySelector("[aria-selected=true]")
      ?.scrollIntoView({ block: "nearest", inline: "center" })
  }, [])

  function select(date: string) {
    setDay(date)
    try {
      localStorage.setItem(SELECTED_DAY_KEY, date)
    } catch {
      // Remembering the day is a convenience only.
    }
  }

  function openSheet(activity: Activity | null, opener: HTMLElement | null) {
    sheetFocus.remember(opener)
    setSheet({ open: true, activity })
  }

  function deleteActivity(activity: Activity) {
    const undo = store.deleteActivity(activity.id)
    toast(`Deleted ${activity.name}`, { action: { label: "Undo", onClick: undo }, duration: 8000 })
  }

  if (days.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-lg border px-4 py-10 text-center">
        <p className="text-sm text-muted-foreground">Set the trip dates to plan each day.</p>
        <Button onClick={(event) => onEditTrip(event.currentTarget)}>Set trip details</Button>
      </div>
    )
  }

  return (
    <>
      <Tabs value={day} onValueChange={(value) => select(String(value))} className="gap-6">
        {/* Swipeable when the days do not fit. Always in date order. */}
        <TabStrip>
          <TabsList ref={listRef} aria-label="Days" className="h-auto shrink-0 group-data-horizontal/tabs:h-auto">
            {days.map((date) => {
              const { weekday, monthDay } = dayParts(date)
              const count = activitiesOn(data.activities, date).length
              const outside = trip !== null && !isInTrip(trip, date)
              return (
                // One fixed width for every day, so a strip of mostly empty days and a busy one look the same.
                <TabsTrigger
                  key={date}
                  value={date}
                  aria-label={`${formatDaySpoken(date)}, ${pluralize(count, "activity", "activities")}${outside ? ", outside trip dates" : ""}`}
                  className="w-24 flex-none flex-col items-stretch gap-0 px-3 py-1.5"
                  data-testid="day-tab"
                >
                  <span className="text-left">{monthDay}</span>
                  <span className="flex items-center justify-between gap-2 text-xs font-normal text-muted-foreground">
                    <span>{weekday}</span>
                    <span className="inline-flex items-center gap-1 tabular-nums">
                      <ListIcon className="size-3" aria-hidden="true" />
                      {/* Room for two digits, so the icon sits in the same place on every day. */}
                      <span className="w-[2ch] text-left" data-testid="day-count">
                        {count}
                      </span>
                    </span>
                  </span>
                </TabsTrigger>
              )
            })}
          </TabsList>
        </TabStrip>

        {days.map((date) => (
          <TabsContent key={date} value={date}>
            <DayPlan
              date={date}
              outside={trip !== null && !isInTrip(trip, date)}
              activities={activitiesOn(data.activities, date)}
              areas={stayAreas(data.groups, date)}
              onAdd={(opener) => openSheet(null, opener)}
              onEdit={openSheet}
              onDelete={deleteActivity}
              onMove={store.moveActivity}
            />
          </TabsContent>
        ))}
      </Tabs>

      <ActivitySheet
        open={sheet.open}
        onOpenChange={(open) => setSheet((current) => ({ ...current, open }))}
        defaultDate={day}
        days={days}
        activity={sheet.activity}
        finalFocus={sheetFocus.finalFocus}
        onSave={(draft) => {
          if (sheet.activity) {
            store.updateActivity(sheet.activity.id, draft)
            toast.success("Activity updated")
          } else {
            store.addActivity(draft)
            toast.success("Activity added")
          }
          if (draft.date !== day) select(draft.date)
          setSheet((current) => ({ ...current, open: false }))
        }}
      />
    </>
  )
}

function DayPlan({
  date,
  outside,
  activities,
  areas,
  onAdd,
  onEdit,
  onDelete,
  onMove,
}: {
  date: string
  /** Not a trip day; shown because it has activities. */
  outside: boolean
  activities: Activity[]
  areas: string[]
  /** `opener` receives focus again when the add panel closes. */
  onAdd: (opener: HTMLElement) => void
  onEdit: (activity: Activity, opener: HTMLElement | null) => void
  onDelete: (activity: Activity) => void
  onMove: (id: string, index: number) => void
}) {
  // One Add activity per state: beside the summary, or under the empty-state message.
  const addActivity = (size: "default" | "sm" = "default") => (
    <Button size={size} onClick={(event) => onAdd(event.currentTarget)}>
      <PlusIcon data-icon="inline-start" />
      Add activity
    </Button>
  )

  return (
    <div className="flex flex-col gap-4">
      <SummaryRow action={activities.length === 0 ? null : addActivity("sm")}>
        <span className="font-medium">{formatDay(date)}</span>
        {outside ? <span className="text-muted-foreground"> · Outside trip dates</span> : null}
        {areas.length ? <span className="text-muted-foreground"> · Staying in {areas.join(" and ")}</span> : null}
      </SummaryRow>

      {activities.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-lg border px-4 py-10 text-center">
          <p className="text-sm text-muted-foreground">No activities for this day yet.</p>
          {addActivity()}
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border" data-testid="activity-frame">
          <ActivityTable
            label={`Activities for ${formatDay(date)}`}
            activities={activities}
            onEdit={onEdit}
            onDelete={onDelete}
            onMove={onMove}
          />
        </div>
      )}
    </div>
  )
}
