import { useState } from "react"
import { PlusIcon } from "lucide-react"
import { toast } from "sonner"
import { ListingSheet } from "@/components/listing-sheet"
import { StayComparison } from "@/components/stay-comparison"
import { StayDialog } from "@/components/stay-dialog"
import { StayTabs } from "@/components/stay-tabs"
import { TabStrip } from "@/components/tab-strip"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent } from "@/components/ui/tabs"
import type { AppStore } from "@/hooks/use-app-data"
import { useReturnFocus } from "@/hooks/use-return-focus"
import { STORAGE_KEY } from "@/lib/storage"
import type { Currency, Listing } from "@/lib/types"

const SELECTED_KEY = `${STORAGE_KEY}:selected-stay`

function readSelected() {
  try {
    return localStorage.getItem(SELECTED_KEY)
  } catch {
    return null
  }
}

export function StaysPage({
  store,
  importCount,
}: {
  store: AppStore
  /** Changes after each import, so per-stay inputs start over from the merged data. */
  importCount: number
}) {
  const { data } = store
  const [selectedId, setSelectedId] = useState(() => readSelected())
  const [sheet, setSheet] = useState<{ open: boolean; listing: Listing | null }>({ open: false, listing: null })
  const [stayDialog, setStayDialog] = useState<{ open: boolean; editing: boolean }>({ open: false, editing: false })
  const sheetFocus = useReturnFocus()
  const stayFocus = useReturnFocus()

  const group = data.groups.find((item) => item.id === selectedId) ?? data.groups[0]

  function select(id: string) {
    setSelectedId(id)
    try {
      localStorage.setItem(SELECTED_KEY, id)
    } catch {
      // Remembering the tab is a convenience only.
    }
  }

  // New quotes default to the currency most recently used in this stay, else JPY.
  const lastCurrency: Currency =
    [...data.listings].reverse().find((listing) => listing.groupId === group.id)?.currency ??
    data.listings.at(-1)?.currency ??
    "JPY"

  function deleteListing(listing: Listing) {
    const undo = store.deleteListing(listing.id)
    toast(`Deleted ${listing.name}`, { action: { label: "Undo", onClick: undo }, duration: 8000 })
  }

  function toggleBooked(listing: Listing) {
    store.setListingBooked(listing.id, !listing.booked)
    toast.success(listing.booked ? `${listing.name} is no longer marked booked` : `Marked ${listing.name} as booked`)
  }

  const stayQuoteCount = data.listings.filter((listing) => listing.groupId === group.id).length

  return (
    <>
      <Tabs value={group.id} onValueChange={(value) => select(String(value))} className="gap-6">
        {/* Swipeable on narrow screens when the stays do not fit. The stays can be dragged into any order. */}
        <TabStrip>
          <StayTabs
            groups={data.groups}
            onMove={(id, index) => {
              // Pin the shown stay first: with nothing saved yet, it is simply the first tab.
              select(group.id)
              store.moveGroup(id, index)
            }}
          />
          <Button
            variant="ghost"
            size="sm"
            className="shrink-0"
            onClick={(event) => {
              stayFocus.remember(event.currentTarget)
              setStayDialog({ open: true, editing: false })
            }}
          >
            <PlusIcon data-icon="inline-start" />
            New stay
          </Button>
        </TabStrip>

        {data.groups.map((item) => (
          <TabsContent key={item.id} value={item.id}>
            <StayComparison
              key={importCount}
              group={item}
              listings={data.listings}
              comparison={data.comparison}
              onComparisonChange={store.setComparison}
              onMove={store.moveListing}
              onEdit={(listing, opener) => {
                sheetFocus.remember(opener)
                setSheet({ open: true, listing })
              }}
              onDelete={deleteListing}
              onToggleBooked={toggleBooked}
              onAddQuote={(opener) => {
                sheetFocus.remember(opener)
                setSheet({ open: true, listing: null })
              }}
              onEditStay={(opener) => {
                stayFocus.remember(opener)
                setStayDialog({ open: true, editing: true })
              }}
            />
          </TabsContent>
        ))}
      </Tabs>

      <ListingSheet
        open={sheet.open}
        onOpenChange={(open) => setSheet((current) => ({ ...current, open }))}
        groups={data.groups}
        defaultGroup={group}
        defaultCurrency={lastCurrency}
        listing={sheet.listing}
        finalFocus={sheetFocus.finalFocus}
        onSave={(draft) => {
          if (sheet.listing) {
            store.updateListing(sheet.listing.id, draft)
            toast.success("Quote updated")
          } else {
            store.addListing(draft)
            toast.success("Quote added")
          }
          if (draft.groupId !== group.id) select(draft.groupId)
          setSheet((current) => ({ ...current, open: false }))
        }}
      />

      <StayDialog
        open={stayDialog.open}
        onOpenChange={(open) => setStayDialog((current) => ({ ...current, open }))}
        group={stayDialog.editing ? group : null}
        quoteCount={stayDialog.editing ? stayQuoteCount : 0}
        canDelete={data.groups.length > 1}
        finalFocus={stayFocus.finalFocus}
        onSave={(next) => {
          const id = store.saveGroup(next)
          select(id)
          setStayDialog((current) => ({ ...current, open: false }))
        }}
        onDelete={(id) => {
          store.deleteGroup(id)
          const fallback = data.groups.find((item) => item.id !== id)
          if (fallback) select(fallback.id)
          setStayDialog((current) => ({ ...current, open: false }))
        }}
      />
    </>
  )
}
