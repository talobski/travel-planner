import { createContext, useContext, useLayoutEffect, useRef, useState, type ReactNode } from "react"
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type Announcements,
  type Modifier,
  type UniqueIdentifier,
} from "@dnd-kit/core"
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { ArrowDownIcon, ArrowUpIcon, GripVerticalIcon } from "lucide-react"
import { cn } from "cn"
import { TABLE_CELL, TABLE_HEAD } from "@/components/scrolling-table"
import { Button } from "@/components/ui/button"
import { DropdownMenuItem, DropdownMenuSeparator } from "@/components/ui/dropdown-menu"
import { TableCell, TableHead } from "@/components/ui/table"

/** Keeps a dragged row in its column and inside the table body. */
const alongColumn: Modifier = ({ transform, draggingNodeRect, containerNodeRect }) => {
  if (!draggingNodeRect || !containerNodeRect) return { ...transform, x: 0 }
  const min = containerNodeRect.top - draggingNodeRect.top
  const max = containerNodeRect.bottom - draggingNodeRect.bottom
  return { ...transform, x: 0, y: Math.min(Math.max(transform.y, min), max) }
}

const REORDER_INSTRUCTIONS =
  "To reorder, press Space or Enter, move with the Up and Down Arrow keys, then press Space or Enter again. Press Escape to cancel."

const MoveContext = createContext<(id: string, index: number) => void>(() => {})

/**
 * Lets the rows of one table be put in order by dragging their handles (mouse, touch, or keyboard) or from
 * their menus. Wrap the table; each row uses `useSortableRow`.
 */
export function SortableRows({
  items,
  onMove,
  children,
}: {
  /** The rows, in order. `name` is used in announcements. */
  items: readonly { id: string; name: string }[]
  onMove: (id: string, index: number) => void
  children: ReactNode
}) {
  const [announcement, setAnnouncement] = useState("")
  const sensors = useSensors(
    // The handle does not scroll the page on touch, so a short move starts the drag for mouse and touch alike.
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const indexOf = (id: UniqueIdentifier) => items.findIndex((item) => item.id === id)
  const nameOf = (id: UniqueIdentifier) => items[indexOf(id)]?.name ?? "Item"
  const positionOf = (index: number) => `position ${index + 1} of ${items.length}`

  // Announce only position changes, so the pickup message is not replaced at once by "over its own position".
  const lastOver = useRef<UniqueIdentifier | null>(null)
  const announcements: Announcements = {
    onDragStart: ({ active }) => {
      lastOver.current = active.id
      return `Picked up ${nameOf(active.id)} at ${positionOf(indexOf(active.id))}.`
    },
    onDragOver: ({ active, over }) => {
      if (!over || over.id === lastOver.current) return undefined
      lastOver.current = over.id
      return `${nameOf(active.id)} is over ${positionOf(indexOf(over.id))}.`
    },
    onDragEnd: ({ active, over }) => `Moved ${nameOf(active.id)} to ${positionOf(indexOf(over?.id ?? active.id))}.`,
    onDragCancel: ({ active }) => `${nameOf(active.id)} was not moved.`,
  }

  function moveByMenu(id: string, to: number) {
    onMove(id, to)
    setAnnouncement(`Moved ${nameOf(id)} to ${positionOf(to)}.`)
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      modifiers={[alongColumn]}
      accessibility={{ announcements, screenReaderInstructions: { draggable: REORDER_INSTRUCTIONS } }}
      onDragEnd={({ active, over }) => {
        if (over && active.id !== over.id) onMove(String(active.id), indexOf(over.id))
      }}
    >
      <SortableContext items={items.map((item) => item.id)} strategy={verticalListSortingStrategy}>
        <MoveContext value={moveByMenu}>{children}</MoveContext>
      </SortableContext>
      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>
    </DndContext>
  )
}

/** Rows are not clickable, so only their buttons respond to the pointer; a dragged row lifts above the rest. */
export const SORTABLE_ROW =
  "relative hover:bg-transparent has-aria-expanded:bg-transparent motion-reduce:transition-none! data-dragging:z-10 data-dragging:bg-background data-dragging:shadow-sm"

export function useSortableRow(id: string, index: number) {
  const { setNodeRef, setActivatorNodeRef, attributes, listeners, transform, transition, isDragging } = useSortable({
    id,
  })
  const move = useContext(MoveContext)
  const actionsRef = useRef<HTMLButtonElement>(null)
  const refocusActions = useRef(false)

  // Moving a row from its menu moves the row's DOM node, which drops focus; put it back on the menu button.
  useLayoutEffect(() => {
    if (!refocusActions.current) return
    refocusActions.current = false
    if (document.activeElement !== actionsRef.current) actionsRef.current?.focus()
  }, [index])

  return {
    rowProps: {
      ref: setNodeRef,
      style: { transform: CSS.Translate.toString(transform), transition },
      "data-dragging": isDragging ? "" : undefined,
    },
    handleProps: { ref: setActivatorNodeRef, ...attributes, ...listeners },
    /** Give this to the row's menu button, which gets focus back after a move from the menu. */
    actionsRef,
    moveTo(to: number) {
      refocusActions.current = true
      move(id, to)
    },
  }
}

export function ReorderHead() {
  return (
    <TableHead className={cn(TABLE_HEAD, "w-12 pr-0")}>
      <span className="sr-only">Reorder</span>
    </TableHead>
  )
}

export function ReorderCell({
  name,
  handleProps,
}: {
  name: string
  handleProps: ReturnType<typeof useSortableRow>["handleProps"]
}) {
  return (
    <TableCell className={cn(TABLE_CELL, "pr-0")}>
      <Button
        variant="ghost"
        size="icon-sm"
        // Negative block margin keeps the handle from making the row taller than its text.
        className="-my-1 cursor-grab touch-none text-muted-foreground in-data-dragging:cursor-grabbing"
        {...handleProps}
        aria-label={`Reorder ${name}`}
      >
        <GripVerticalIcon />
      </Button>
    </TableCell>
  )
}

/** Move up and Move down for a row menu, with a separator before what follows. Nothing for a single row. */
export function MoveMenuItems({
  index,
  count,
  onMoveTo,
}: {
  index: number
  count: number
  onMoveTo: (index: number) => void
}) {
  if (count < 2) return null
  return (
    <>
      <DropdownMenuItem disabled={index === 0} onClick={() => onMoveTo(index - 1)}>
        <ArrowUpIcon />
        Move up
      </DropdownMenuItem>
      <DropdownMenuItem disabled={index === count - 1} onClick={() => onMoveTo(index + 1)}>
        <ArrowDownIcon />
        Move down
      </DropdownMenuItem>
      <DropdownMenuSeparator />
    </>
  )
}
