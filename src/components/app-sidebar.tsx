import { useRef } from "react"
import { BedDoubleIcon, CalendarDaysIcon, ChevronsUpDownIcon, MoonIcon, PencilIcon, PlaneIcon, SunIcon } from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar"
import { PAGE_HREF, type Page } from "@/hooks/use-page"
import { formatDateRange, pluralize } from "@/lib/dates"
import { dayParts, tripLength } from "@/lib/itinerary"
import { setTheme, useTheme } from "@/lib/theme"
import type { Trip } from "@/lib/types"

// Single trip for now; creating and switching trips is not built yet.
const TRIP_ID = "current"

/** "May 1–14" or "May 1" for a one-day trip. */
function tripDates(trip: Trip) {
  return trip.start === trip.end ? dayParts(trip.start).monthDay : formatDateRange(trip.start, trip.end)
}

export function AppSidebar({
  page,
  trip,
  onEditTrip,
}: {
  page: Page
  /** Null when saved data has no trip details yet. */
  trip: Trip | null
  /** `opener` receives focus again when the trip dialog closes. */
  onEditTrip: (opener: HTMLElement | null) => void
}) {
  return (
    <Sidebar variant="inset" collapsible="icon">
      <SidebarHeader>
        <TripSelector trip={trip} onEdit={onEditTrip} />
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <PageNav page={page} />
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <ThemeMenuButton />
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  )
}

function TripSelector({ trip, onEdit }: { trip: Trip | null; onEdit: (opener: HTMLElement | null) => void }) {
  const { isMobile } = useSidebar()
  const trigger = useRef<HTMLButtonElement>(null)
  const name = trip?.name ?? "Untitled trip"
  const summary = trip ? `${tripDates(trip)} · ${pluralize(tripLength(trip), "day")}` : "Dates not set"
  const details = trip
    ? [trip.destination, `${tripDates(trip)}, ${trip.end.slice(0, 4)}`].filter(Boolean).join(" · ")
    : "Dates not set"
  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger
            ref={trigger}
            render={<SidebarMenuButton size="lg" className="data-popup-open:bg-sidebar-accent" />}
          >
            <span className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
              <PlaneIcon aria-hidden="true" />
            </span>
            <span className="grid flex-1 text-left leading-tight">
              <span className="truncate font-medium">{name}</span>
              <span className="truncate text-xs text-sidebar-foreground/70">{summary}</span>
            </span>
            <ChevronsUpDownIcon className="ml-auto" aria-hidden="true" />
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-(--anchor-width) min-w-56"
            side={isMobile ? "bottom" : "right"}
            align="start"
            sideOffset={4}
          >
            <DropdownMenuRadioGroup value={TRIP_ID}>
              <DropdownMenuRadioItem value={TRIP_ID} className="py-1.5">
                <span className="grid leading-tight">
                  <span>{name}</span>
                  <span className="text-xs text-muted-foreground">{details}</span>
                </span>
              </DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => onEdit(trigger.current)}>
              <PencilIcon />
              {trip ? "Edit trip" : "Set trip details"}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}

const NAV: { page: Page; label: string; icon: typeof BedDoubleIcon }[] = [
  { page: "stays", label: "Stays", icon: BedDoubleIcon },
  { page: "itinerary", label: "Itinerary", icon: CalendarDaysIcon },
]

function PageNav({ page }: { page: Page }) {
  const { isMobile, setOpenMobile } = useSidebar()
  return (
    <SidebarMenu aria-label="Pages">
      {NAV.map((item) => (
        <SidebarMenuItem key={item.page}>
          <SidebarMenuButton
            render={<a href={PAGE_HREF[item.page]} />}
            isActive={item.page === page}
            aria-current={item.page === page ? "page" : undefined}
            tooltip={item.label}
            onClick={() => {
              if (isMobile) setOpenMobile(false)
            }}
          >
            <item.icon aria-hidden="true" />
            <span>{item.label}</span>
          </SidebarMenuButton>
        </SidebarMenuItem>
      ))}
    </SidebarMenu>
  )
}

function ThemeMenuButton() {
  const theme = useTheme()
  const next = theme === "dark" ? "light" : "dark"
  const label = `Switch to ${next} mode`
  return (
    <SidebarMenuButton aria-label={label} tooltip={label} onClick={() => setTheme(next)}>
      {theme === "dark" ? <SunIcon aria-hidden="true" /> : <MoonIcon aria-hidden="true" />}
      <span>{next === "dark" ? "Dark mode" : "Light mode"}</span>
    </SidebarMenuButton>
  )
}
