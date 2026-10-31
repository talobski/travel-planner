import { CircleCheckIcon, CircleHelpIcon, CircleDashedIcon } from "lucide-react"
import { cn } from "cn"
import { FEE_CERTAINTY_LABELS } from "@/lib/labels"
import type { FeeCertainty } from "@/lib/types"

const ICONS = {
  confirmed: CircleCheckIcon,
  estimated: CircleDashedIcon,
  unknown: CircleHelpIcon,
} satisfies Record<FeeCertainty, unknown>

export function FeeStatus({ certainty, className }: { certainty: FeeCertainty; className?: string }) {
  const Icon = ICONS[certainty]
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-xs font-medium",
        certainty === "confirmed" ? "text-success-foreground" : "text-warning-foreground",
        className,
      )}
    >
      <Icon className="size-3.5 shrink-0" aria-hidden="true" />
      {FEE_CERTAINTY_LABELS[certainty]}
    </span>
  )
}
