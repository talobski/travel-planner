import { useId, useLayoutEffect, useRef, useState, type KeyboardEvent, type MouseEvent } from "react"
import {
  DndContext,
  MouseSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type Announcements,
  type Modifier,
  type UniqueIdentifier,
} from "@dnd-kit/core"
import { SortableContext, horizontalListSortingStrategy, useSortable } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { cn } from "cn"
import { TabsList, TabsTrigger } from "@/components/ui/tabs"
import { formatDateRange, pluralize } from "@/lib/dates"
import type { StayGroup } from "@/lib/types"

/** Keeps a dragged tab on the strip's axis and inside the strip. */
const alongStrip: Modifier = ({ transform, draggingNodeRect, containerNodeRect }) => {
  if (!draggingNodeRect || !containerNodeRect) return { ...transform, y: 0 }
  const min = containerNodeRect.left - draggingNodeRect.left
  const max = containerNodeRect.right - draggingNodeRect.right
  return { ...transform, x: Math.min(Math.max(transform.x, min), max), y: 0 }
}

/** A click that lands this soon after a drag ends belongs to the drag, not to tab selection. */
const CLICK_AFTER_DRAG_MS = 400

export function StayTabs({ groups, onMove }: { groups: StayGroup[]; onMove: (id: string, index: number) => void }) {
  const hintId = useId()
  const [announcement, setAnnouncement] = useState("")
  const dragging = useRef(false)
  const dragEndedAt = useRef(-Infinity)
  const refocusId = useRef<string | null>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const sensors = useSensors(
    // A few pixels of travel before a drag starts, so a click still selects.
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    // Press and hold to drag, so a swipe still scrolls the strip and a tap still selects.
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }),
  )

  // Reordering moves the focused tab's DOM node, which drops focus; put it back.
  useLayoutEffect(() => {
    const id = refocusId.current
    refocusId.current = null
    if (!id) return
    const tab = listRef.current?.querySelector<HTMLElement>(`[data-stay-id="${window.CSS.escape(id)}"]`)
    if (tab && document.activeElement !== tab) tab.focus()
  }, [groups])

  const indexOf = (id: UniqueIdentifier) => groups.findIndex((group) => group.id === id)
  const nameOf = (id: UniqueIdentifier) => {
    const group = groups[indexOf(id)]
    return group ? `${group.area}, ${formatDateRange(group.checkIn, group.checkOut)}` : "Stay"
  }
  const positionOf = (index: number) => `position ${index + 1} of ${groups.length}`

  const announcements: Announcements = {
    onDragStart: ({ active }) => `Picked up ${nameOf(active.id)}.`,
    onDragOver: ({ active, over }) => (over ? `${nameOf(active.id)} is over ${positionOf(indexOf(over.id))}.` : undefined),
    onDragEnd: ({ active, over }) =>
      `Moved ${nameOf(active.id)} to ${positionOf(indexOf(over?.id ?? active.id))}.`,
    onDragCancel: ({ active }) => `${nameOf(active.id)} was not moved.`,
  }

  function moveWithKeys(event: KeyboardEvent<HTMLElement>, group: StayGroup, index: number) {
    if (!event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return
    const step = event.key === "ArrowLeft" ? -1 : event.key === "ArrowRight" ? 1 : 0
    if (!step) return
    event.preventDefault()
    event.stopPropagation()
    const name = nameOf(group.id)
    const to = index + step
    if (to < 0 || to >= groups.length) {
      setAnnouncement(`${name} is already ${to < 0 ? "first" : "last"}.`)
      return
    }
    refocusId.current = group.id
    onMove(group.id, to)
    setAnnouncement(`Moved ${name} to ${positionOf(to)}.`)
  }

  function swallowDragClick(event: MouseEvent) {
    if (dragging.current || performance.now() - dragEndedAt.current < CLICK_AFTER_DRAG_MS) {
      event.preventDefault()
      event.stopPropagation()
    }
  }

  function endDrag() {
    dragging.current = false
    dragEndedAt.current = performance.now()
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      modifiers={[alongStrip]}
      accessibility={{ announcements, screenReaderInstructions: { draggable: "" } }}
      onDragStart={() => {
        dragging.current = true
      }}
      onDragEnd={({ active, over }) => {
        endDrag()
        if (over && active.id !== over.id) onMove(String(active.id), indexOf(over.id))
      }}
      onDragCancel={endDrag}
    >
      <SortableContext items={groups.map((group) => group.id)} strategy={horizontalListSortingStrategy}>
        <TabsList
          ref={listRef}
          aria-label="Stays"
          className="h-auto shrink-0 group-data-horizontal/tabs:h-auto"
          onClickCapture={swallowDragClick}
        >
          {groups.map((group, index) => (
            <SortableTab
              key={group.id}
              group={group}
              hintId={hintId}
              onKeyDown={(event) => moveWithKeys(event, group, index)}
            />
          ))}
        </TabsList>
      </SortableContext>
      <span id={hintId} hidden>
        Alt or Option with Left or Right Arrow moves this stay.
      </span>
      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>
    </DndContext>
  )
}

function SortableTab({
  group,
  hintId,
  onKeyDown,
}: {
  group: StayGroup
  hintId: string
  onKeyDown: (event: KeyboardEvent<HTMLElement>) => void
}) {
  const { setNodeRef, listeners, transform, transition, isDragging } = useSortable({ id: group.id })
  return (
    <TabsTrigger
      ref={setNodeRef}
      value={group.id}
      data-stay-id={group.id}
      data-dragging={isDragging ? "" : undefined}
      aria-describedby={hintId}
      aria-keyshortcuts="Alt+ArrowLeft Alt+ArrowRight"
      style={{
        transform: CSS.Translate.toString(transform),
        // The dragged tab follows the pointer directly; the others slide aside.
        transition: transition ?? (isDragging ? "none" : undefined),
      }}
      className={cn(
        "flex-col items-start gap-0 px-3 py-1.5 select-none [-webkit-touch-callout:none] motion-reduce:transition-none!",
        "data-dragging:z-10 data-dragging:cursor-grabbing data-dragging:bg-background data-dragging:text-foreground data-dragging:shadow-sm dark:data-dragging:border-input",
      )}
      {...listeners}
      onKeyDown={onKeyDown}
      // A long press would otherwise open the context menu mid-drag on touch screens.
      onContextMenu={isDragging ? (event) => event.preventDefault() : undefined}
    >
      <span>{group.area}</span>
      <span className="text-xs font-normal text-muted-foreground">
        {formatDateRange(group.checkIn, group.checkOut)} · {pluralize(group.guests, "guest")}
      </span>
    </TabsTrigger>
  )
}
