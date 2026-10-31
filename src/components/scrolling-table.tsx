import type { ComponentProps } from "react"
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area"
import { Table } from "@/components/ui/table"

/** Header and cell spacing shared by the listing tables. */
export const TABLE_HEAD = "h-10 px-4 text-xs text-muted-foreground"
export const TABLE_CELL = "px-4 py-3"
/** A row's name, which opens the row for editing. */
export const TABLE_NAME_BUTTON =
  "rounded-sm text-left font-medium [overflow-wrap:anywhere] underline-offset-4 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"

/**
 * A table that sits in a bordered frame. On narrow screens it keeps its columns and scrolls sideways in the scroll
 * area instead of widening the page; the table's own container stops scrolling so there is one scrollbar.
 */
export function ScrollingTable(props: ComponentProps<typeof Table>) {
  return (
    <ScrollArea className="[&_[data-slot=table-container]]:overflow-visible">
      <Table
        // Browsers leave a partly visible control clipped on focus; bring keyboard focus fully into view.
        onFocus={(event) => {
          if (event.target.matches(":focus-visible")) event.target.scrollIntoView({ block: "nearest", inline: "nearest" })
        }}
        {...props}
      />
      <ScrollBar orientation="horizontal" />
    </ScrollArea>
  )
}
