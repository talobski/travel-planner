import { useEffect, useState } from "react"
import { BackupMenu } from "@/components/backup-menu"
import { AppSidebar } from "@/components/app-sidebar"
import { ItineraryPage } from "@/components/itinerary-page"
import { RecoveryNotice } from "@/components/recovery-notice"
import { StaysPage } from "@/components/stays-page"
import { TripDialog } from "@/components/trip-dialog"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar"
import { useAppData } from "@/hooks/use-app-data"
import { usePage } from "@/hooks/use-page"
import { useReturnFocus } from "@/hooks/use-return-focus"

/** The Sidebar provider saves its open state in this cookie; restore it on load. */
function readSidebarOpen() {
  return !/(?:^|;\s*)sidebar_state=false(?:;|$)/.test(document.cookie)
}

const PAGES = {
  stays: {
    title: "Stays",
    documentTitle: "Stays · Travel Planner",
    storage: "Quotes are saved in this browser only. Clearing site data removes them, so export a backup from the menu now and then.",
  },
  itinerary: {
    title: "Itinerary",
    documentTitle: "Itinerary · Travel Planner",
    storage: "Activities are saved in this browser only. Clearing site data removes them, so export a backup from the menu now and then.",
  },
}

export function App() {
  const store = useAppData()
  const { data } = store
  const page = usePage()
  const [importCount, setImportCount] = useState(0)
  const [tripOpen, setTripOpen] = useState(false)
  const tripFocus = useReturnFocus()
  const copy = PAGES[page]

  function editTrip(opener: HTMLElement | null) {
    tripFocus.remember(opener)
    setTripOpen(true)
  }

  useEffect(() => {
    document.title = copy.documentTitle
  }, [copy.documentTitle])

  // A new page starts at the top.
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [page])

  return (
    <SidebarProvider defaultOpen={readSidebarOpen()}>
      <AppSidebar page={page} trip={data.trip} onEditTrip={editTrip} />
      {/* min-w-0 lets the page shrink beside the sidebar so wide tables scroll inside their frames. */}
      <SidebarInset className="min-w-0">
        <header className="flex h-14 w-full shrink-0 items-center gap-2 px-4">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-1 data-vertical:h-4 data-vertical:self-center" />
          <h1 className="text-base">{copy.title}</h1>
          <div className="ml-auto">
            <BackupMenu
              data={data}
              onImport={(plan, policy, useFileTrip) => {
                store.importData(plan, policy, useFileTrip)
                setImportCount((count) => count + 1)
              }}
            />
          </div>
        </header>

        {/* Centered in the panel; contents stay left-aligned. The footer sits in this column too. */}
        <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-4">
          <RecoveryNotice store={store} />
          {data.trip === null ? (
            <Alert className="mb-4">
              <AlertTitle>Confirm your trip details</AlertTitle>
              <AlertDescription>
                Your saved data is from before trip details existed. Set the trip's name and dates so the itinerary
                shows every day, including days with nothing planned.
                <div className="mt-2">
                  <Button size="sm" variant="outline" onClick={(event) => editTrip(event.currentTarget)}>
                    Set trip details
                  </Button>
                </div>
              </AlertDescription>
            </Alert>
          ) : null}
          {store.saveError ? (
            <Alert variant="destructive" className="mb-4">
              <AlertTitle>Changes are not being saved</AlertTitle>
              <AlertDescription>
                Browser storage is full or blocked. Export a backup before closing this tab.
              </AlertDescription>
            </Alert>
          ) : null}

          <div className="flex-1 pt-2 pb-12">
            {page === "itinerary" ? (
              <ItineraryPage store={store} onEditTrip={editTrip} />
            ) : (
              <StaysPage store={store} importCount={importCount} />
            )}
          </div>

          <footer className="border-t py-6 text-sm text-muted-foreground">{copy.storage}</footer>
        </div>
      </SidebarInset>
      <TripDialog
        open={tripOpen}
        onOpenChange={setTripOpen}
        trip={data.trip}
        groups={data.groups}
        activities={data.activities}
        finalFocus={tripFocus.finalFocus}
        onSave={(trip) => {
          store.saveTrip(trip)
          setTripOpen(false)
        }}
      />
    </SidebarProvider>
  )
}
