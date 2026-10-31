import { ExternalLinkIcon, MoreHorizontalIcon, PencilIcon, Trash2Icon } from "lucide-react"
import { cn } from "cn"
import { ScrollingTable, TABLE_CELL, TABLE_HEAD, TABLE_NAME_BUTTON } from "@/components/scrolling-table"
import {
  MoveMenuItems,
  ReorderCell,
  ReorderHead,
  SORTABLE_ROW,
  SortableRows,
  useSortableRow,
} from "@/components/sortable-rows"
import { Button, buttonVariants } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { formatTime, isGoogleMapsUrl } from "@/lib/itinerary"
import type { Activity } from "@/lib/types"
import { safeHttpUrl } from "@/lib/validation"

interface RowActions {
  /** `opener` receives focus again when the edit panel closes. */
  onEdit: (activity: Activity, opener: HTMLElement | null) => void
  onDelete: (activity: Activity) => void
}

export function ActivityTable({
  label,
  activities,
  onMove,
  ...actions
}: RowActions & {
  label: string
  /** One day's activities, in order. */
  activities: Activity[]
  onMove: (id: string, index: number) => void
}) {
  return (
    <SortableRows items={activities} onMove={onMove}>
      <ScrollingTable aria-label={label} className="min-w-[32rem] table-fixed">
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <ReorderHead />
            <TableHead className={cn(TABLE_HEAD, "w-28")}>Time</TableHead>
            <TableHead className={TABLE_HEAD}>Activity</TableHead>
            <TableHead className={cn(TABLE_HEAD, "w-28")}>
              <span className="sr-only">Actions</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {activities.map((activity, index) => (
            <ActivityRow key={activity.id} activity={activity} index={index} count={activities.length} {...actions} />
          ))}
        </TableBody>
      </ScrollingTable>
    </SortableRows>
  )
}

function ActivityRow({
  activity,
  index,
  count,
  onEdit,
  onDelete,
}: RowActions & { activity: Activity; index: number; count: number }) {
  const { rowProps, handleProps, actionsRef, moveTo } = useSortableRow(activity.id, index)
  const href = activity.url ? safeHttpUrl(activity.url) : null
  const linkLabel = href && isGoogleMapsUrl(href) ? "Open in Google Maps" : "Open link"

  return (
    <TableRow {...rowProps} className={SORTABLE_ROW} data-testid="activity-row">
      <ReorderCell name={activity.name} handleProps={handleProps} />

      <TableCell className={cn(TABLE_CELL, "tabular-nums")} data-testid="activity-time">
        {activity.time ? formatTime(activity.time) : <span className="text-muted-foreground">Flexible</span>}
      </TableCell>

      <TableCell className={cn(TABLE_CELL, "whitespace-normal")}>
        <button type="button" onClick={(event) => onEdit(activity, event.currentTarget)} className={TABLE_NAME_BUTTON}>
          {activity.name}
        </button>
        {activity.location ? <p className="text-sm text-muted-foreground">{activity.location}</p> : null}
      </TableCell>

      <TableCell className={TABLE_CELL}>
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
                    aria-label={`${linkLabel} for ${activity.name}`}
                  />
                }
              >
                <ExternalLinkIcon />
              </TooltipTrigger>
              <TooltipContent>{linkLabel}</TooltipContent>
            </Tooltip>
          ) : null}
          <DropdownMenu>
            <DropdownMenuTrigger
              ref={actionsRef}
              render={<Button variant="ghost" size="icon" aria-label={`Actions for ${activity.name}`} />}
            >
              <MoreHorizontalIcon />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-40">
              <DropdownMenuItem onClick={() => onEdit(activity, actionsRef.current)}>
                <PencilIcon />
                Edit
              </DropdownMenuItem>
              <MoveMenuItems index={index} count={count} onMoveTo={moveTo} />
              <DropdownMenuItem variant="destructive" onClick={() => onDelete(activity)}>
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
