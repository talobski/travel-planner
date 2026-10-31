import type { ReactNode } from "react"
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area"

/**
 * A row of tabs that scrolls sideways when it does not fit. shadcn's `scroll-fade-x` fades only an edge with more
 * tabs beyond it, driven by the viewport's own scroll position. Browsers without scroll-driven animations would
 * fade both edges at all times, so they get the plain clipped edge instead. The matching scroll padding keeps a
 * tab that focus scrolls into view clear of the fade.
 */
const FADING_VIEWPORT =
  "[--scroll-fade-size:calc(var(--spacing)*6)] *:data-[slot=scroll-area-viewport]:scroll-px-6 supports-[animation-timeline:scroll()]:*:data-[slot=scroll-area-viewport]:scroll-fade-x"
/** The mask hides the viewport's own focus ring, so the unmasked root shows it while the viewport has focus. */
const VIEWPORT_FOCUS =
  "rounded-lg has-[>[data-slot=scroll-area-viewport]:focus-visible]:inset-ring-3 has-[>[data-slot=scroll-area-viewport]:focus-visible]:inset-ring-ring/50"

export function TabStrip({ children }: { children: ReactNode }) {
  return (
    <ScrollArea className={`-mx-4 sm:mx-0 ${FADING_VIEWPORT} ${VIEWPORT_FOCUS}`} data-testid="tab-strip">
      <div
        className="flex w-max items-center gap-2 px-4 pt-0.5 pb-3 sm:px-0"
        // Browsers leave a partly visible tab clipped on focus; bring keyboard focus fully into view.
        onFocus={(event) => {
          if (event.target.matches(":focus-visible")) event.target.scrollIntoView({ block: "nearest", inline: "nearest" })
        }}
      >
        {children}
      </div>
      <ScrollBar orientation="horizontal" />
    </ScrollArea>
  )
}
