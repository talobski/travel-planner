import {
  CalendarCheckIcon,
  CalendarXIcon,
  ExternalLinkIcon,
  MoreHorizontalIcon,
  PencilIcon,
  Trash2Icon,
} from "lucide-react"
import { cn } from "cn"
import { FeeStatus } from "@/components/fee-status"
import { Badge } from "@/components/ui/badge"
import { Button, buttonVariants } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { ScrollingTable, TABLE_CELL, TABLE_HEAD, TABLE_NAME_BUTTON } from "@/components/scrolling-table"
import {
  MoveMenuItems,
  ReorderCell,
  ReorderHead,
  SORTABLE_ROW,
  SortableRows,
  useSortableRow,
} from "@/components/sortable-rows"
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { formatDateRange, pluralize } from "@/lib/dates"
import { formatMoney } from "@/lib/money"
import type { ComparisonRow, LowestKind } from "@/lib/pricing"
import type { Listing } from "@/lib/types"
import { safeHttpUrl } from "@/lib/validation"

interface RowActions {
  /** `opener` receives focus again when the edit panel closes. */
  onEdit: (listing: Listing, opener: HTMLElement | null) => void
  onDelete: (listing: Listing) => void
  onToggleBooked: (listing: Listing) => void
}

export function QuoteList({
  rows,
  lowest,
  mismatched = false,
  converted = false,
  label,
  onMove,
  ...actions
}: RowActions & {
  /** In the user's order. */
  rows: ComparisonRow[]
  lowest?: { id: string; kind: LowestKind } | null
  mismatched?: boolean
  /** Ranking used a manual exchange rate. */
  converted?: boolean
  label: string
  /** Moves a quote to `index` within these rows. */
  onMove: (id: string, index: number) => void
}) {
  return (
    <SortableRows items={rows.map((row) => row.listing)} onMove={onMove}>
      <ScrollingTable aria-label={label} className="min-w-[43rem] table-fixed">
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <ReorderHead />
            <TableHead className={HEAD}>Listing</TableHead>
            <TableHead className={cn(HEAD, "w-40 text-right")}>Stay total</TableHead>
            <TableHead className={cn(HEAD, "w-40 text-right")}>Per night</TableHead>
            <TableHead className={cn(HEAD, "w-28")}>
              <span className="sr-only">Actions</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row, index) => (
            <QuoteRow
              key={row.listing.id}
              row={row}
              index={index}
              count={rows.length}
              lowest={
                lowest?.id === row.listing.id
                  ? `${LOWEST_LABELS[lowest.kind]}${converted ? " at your rate" : ""}`
                  : null
              }
              mismatched={mismatched}
              {...actions}
            />
          ))}
        </TableBody>
      </ScrollingTable>
    </SortableRows>
  )
}

const HEAD = TABLE_HEAD
const CELL = TABLE_CELL

function PerPersonSuffix() {
  return (
    <>
      <span aria-hidden="true"> / person</span>
      <span className="sr-only"> per person per night</span>
    </>
  )
}

const LOWEST_LABELS: Record<LowestKind, string> = {
  lowest: "Lowest",
  "lowest-confirmed": "Lowest confirmed",
}

function QuoteRow({
  row,
  index,
  count,
  lowest,
  mismatched,
  onEdit,
  onDelete,
  onToggleBooked,
}: RowActions & { row: ComparisonRow; index: number; count: number; lowest: string | null; mismatched: boolean }) {
  const { listing, quote } = row
  const { rowProps, handleProps, actionsRef, moveTo } = useSortableRow(listing.id, index)
  const href = listing.url ? safeHttpUrl(listing.url) : null
  const own = (value: number) => formatMoney(value, listing.currency)
  const shown = (value: number) => `${row.converted ? "≈ " : ""}${formatMoney(value, row.currency)}`
  const meta = [listing.area, listing.source].filter(Boolean).join(" · ")

  return (
    <TableRow {...rowProps} className={SORTABLE_ROW} data-testid="quote-row">
      <ReorderCell name={listing.name} handleProps={handleProps} />

      <TableCell className={cn(CELL, "whitespace-normal")}>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <button
            type="button"
            onClick={(event) => onEdit(listing, event.currentTarget)}
            className={TABLE_NAME_BUTTON}
          >
            {listing.name}
          </button>
          {/* Outlined, so it reads as the user's own status and not as the green price labels. */}
          {listing.booked ? (
            <Badge variant="outline" data-testid="booked-badge">
              <CalendarCheckIcon data-icon="inline-start" aria-hidden="true" />
              Booked
            </Badge>
          ) : null}
          {lowest ? (
            <Badge className="bg-success text-success-foreground">{lowest}</Badge>
          ) : null}
        </div>
        {meta ? <p className="text-sm text-muted-foreground">{meta}</p> : null}
        {mismatched ? (
          <p className="mt-1 text-sm font-medium text-warning-foreground">
            <span className={cn(!row.datesDiffer && "font-normal text-muted-foreground")}>
              {formatDateRange(listing.checkIn, listing.checkOut)} · {pluralize(quote.nights, "night")}
            </span>
            {" · "}
            <span className={cn(!row.guestsDiffer && "font-normal text-muted-foreground")}>
              {pluralize(listing.guests, "guest")}
            </span>
          </p>
        ) : null}
        {listing.notes ? (
          <p className="mt-1 line-clamp-2 text-xs whitespace-pre-line text-muted-foreground">{listing.notes}</p>
        ) : null}
      </TableCell>

      <TableCell className={cn(CELL, "text-right tabular-nums")}>
        <p className="font-medium" data-testid="row-total">
          {shown(row.total)}
        </p>
        {row.converted ? <p className="text-xs text-muted-foreground">{own(quote.stayTotal)}</p> : null}
        <FeeStatus certainty={listing.feeCertainty} />
      </TableCell>

      <TableCell className={cn(CELL, "text-right tabular-nums")}>
        <p className="font-medium" data-testid="row-nightly">
          {shown(row.nightly)}
        </p>
        {row.converted ? <p className="text-xs text-muted-foreground">{own(quote.effectiveNightly)}</p> : null}
        {/* Even split of the whole-place rate; each original amount stays under its converted one. */}
        <div className={cn("text-xs text-muted-foreground", row.converted && "mt-1.5")}>
          <p>
            <span data-testid="row-per-person">{shown(row.perPerson)}</span>
            <PerPersonSuffix />
          </p>
          {row.converted ? (
            <p>
              {own(quote.stayTotal / quote.nights / listing.guests)}
              <PerPersonSuffix />
            </p>
          ) : null}
        </div>
      </TableCell>

      <TableCell className={CELL}>
        <div className="flex justify-end gap-1">
          {href ? (
            <Tooltip>
              <TooltipTrigger
                render={
                  <a
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={buttonVariants({ variant: "ghost", size: "icon" })}
                    aria-label={`Open ${listing.name} on ${listing.source || "source site"}`}
                  />
                }
              >
                <ExternalLinkIcon />
              </TooltipTrigger>
              <TooltipContent>Open on {listing.source || "source site"}</TooltipContent>
            </Tooltip>
          ) : null}
          <DropdownMenu>
            <DropdownMenuTrigger
              ref={actionsRef}
              render={<Button variant="ghost" size="icon" aria-label={`Actions for ${listing.name}`} />}
            >
              <MoreHorizontalIcon />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem onClick={() => onEdit(listing, actionsRef.current)}>
                <PencilIcon />
                Edit
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onToggleBooked(listing)}>
                {listing.booked ? <CalendarXIcon /> : <CalendarCheckIcon />}
                {listing.booked ? "Mark as not booked" : "Mark as booked"}
              </DropdownMenuItem>
              <MoveMenuItems index={index} count={count} onMoveTo={moveTo} />
              <DropdownMenuItem variant="destructive" onClick={() => onDelete(listing)}>
                <Trash2Icon />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </TableCell>
    </TableRow>
  )
}
