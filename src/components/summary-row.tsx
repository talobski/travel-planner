import type { ReactNode } from "react"

/**
 * The selected stay's or day's one-line summary, with the page's add action opposite. On narrow screens the
 * summary wraps beside the action rather than pushing it to a line of its own.
 */
export function SummaryRow({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4" data-testid="summary-row">
      <p className="min-w-0 text-sm">{children}</p>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  )
}
