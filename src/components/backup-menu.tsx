import { useId, useRef, useState } from "react"
import { DownloadIcon, EllipsisIcon, UploadIcon } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Field, FieldContent, FieldDescription, FieldLabel } from "@/components/ui/field"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { formatDateRangeLong, pluralize } from "@/lib/dates"
import { downloadText, fileDate } from "@/lib/download"
import { planImport, serializeExport, totalRejected, type ConflictPolicy, type ImportPlan } from "@/lib/storage"
import type { AppData, Trip } from "@/lib/types"

const MAX_IMPORT_BYTES = 5 * 1024 * 1024

export function exportFileName(now = new Date()) {
  return `travel-planner-backup-${fileDate(now)}.json`
}

export function BackupMenu({
  data,
  onImport,
}: {
  data: AppData
  onImport: (plan: ImportPlan, policy: ConflictPolicy, useFileTrip: boolean) => void
}) {
  const fileInput = useRef<HTMLInputElement>(null)
  const menuTrigger = useRef<HTMLButtonElement>(null)
  const [plan, setPlan] = useState<ImportPlan | null>(null)

  function exportBackup() {
    downloadText(serializeExport(data), exportFileName())
    toast.success(`Exported ${pluralize(data.listings.length, "quote")}`)
  }

  async function readFile(file: File) {
    if (file.size > MAX_IMPORT_BYTES) {
      toast.error("That file is too large to be a backup.")
      return
    }
    let parsed: unknown
    try {
      parsed = JSON.parse(await file.text())
    } catch {
      toast.error("That file is not valid JSON.")
      return
    }
    try {
      setPlan(planImport(data, parsed))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "That file could not be imported.")
    }
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger ref={menuTrigger} render={<Button variant="outline" size="icon-lg" aria-label="Backup" />}>
          <EllipsisIcon />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44">
          <DropdownMenuItem onClick={exportBackup}>
            <DownloadIcon />
            Export backup
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => fileInput.current?.click()}>
            <UploadIcon />
            Import backup
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <input
        ref={fileInput}
        type="file"
        accept="application/json,.json"
        hidden
        data-testid="import-input"
        onChange={(event) => {
          const file = event.target.files?.[0]
          event.target.value = ""
          if (file) void readFile(file)
        }}
      />
      <ImportDialog
        plan={plan}
        currentTrip={data.trip}
        finalFocus={() => menuTrigger.current ?? true}
        onCancel={() => setPlan(null)}
        onConfirm={(policy, useFileTrip) => {
          if (!plan) return
          onImport(plan, policy, useFileTrip)
          const both = policy === "keep-both"
          const quotes = plan.newListings + (both ? plan.conflictingListings : 0)
          const activities = plan.newActivities + (both ? plan.conflictingActivities : 0)
          const imported =
            activities > 0
              ? `Imported ${pluralize(quotes, "quote")} and ${pluralize(activities, "activity", "activities")}`
              : `Imported ${pluralize(quotes, "quote")}`
          if (!useFileTrip) toast.success(imported)
          else toast.success(quotes + activities > 0 ? `${imported}. Trip details updated.` : "Trip details updated")
          setPlan(null)
        }}
      />
    </>
  )
}

/** "Spring trip · Sun, May 5 to Tue, May 14, 2030" */
function describeTrip(trip: Trip) {
  return `${trip.destination ? `${trip.name}, ${trip.destination}` : trip.name} · ${formatDateRangeLong(trip.start, trip.end)}`
}

function ImportDialog({
  plan,
  currentTrip,
  onCancel,
  onConfirm,
  finalFocus,
}: {
  plan: ImportPlan | null
  currentTrip: Trip | null
  finalFocus: () => HTMLElement | boolean
  onCancel: () => void
  onConfirm: (policy: ConflictPolicy, useFileTrip: boolean) => void
}) {
  const id = useId()
  const [policy, setPolicy] = useState<ConflictPolicy>("keep-existing")
  // Filling in missing trip details is offered by default; replacing ones you set is not.
  const defaultTripChoice = plan?.tripChange === "add" ? "file" : "keep"
  const [tripChoice, setTripChoice] = useState<"keep" | "file">(defaultTripChoice)
  const [choiceFor, setChoiceFor] = useState(plan)
  if (choiceFor !== plan) {
    setChoiceFor(plan)
    setTripChoice(defaultTripChoice)
  }
  const conflicts = plan ? plan.conflictingListings + plan.conflictingGroups + plan.conflictingActivities : 0
  const rejected = plan ? totalRejected(plan.rejected) : 0
  const tripDiffers = plan !== null && plan.tripChange !== "none"
  const nothingToAdd = plan
    ? plan.newListings + plan.newGroups + plan.newActivities + conflicts === 0 && !(tripDiffers && tripChoice === "file")
    : true

  return (
    <Dialog open={plan !== null} onOpenChange={(open) => !open && onCancel()}>
      <DialogContent className="sm:max-w-md" finalFocus={finalFocus}>
        <DialogHeader>
          <DialogTitle>Import backup</DialogTitle>
          <DialogDescription>
            {plan?.tripChange === "conflict"
              ? "Your current quotes and plans are kept. Your trip details change only if you choose."
              : "Your current quotes and plans are kept. Nothing is replaced."}
          </DialogDescription>
        </DialogHeader>
        {plan ? (
          <div className="grid gap-4 text-sm">
            <ul className="grid gap-1">
              <li>
                <span className="font-medium tabular-nums">{pluralize(plan.newListings, "new quote")}</span> to add
              </li>
              {plan.newGroups > 0 ? (
                <li>
                  <span className="font-medium tabular-nums">{pluralize(plan.newGroups, "new stay", "new stays")}</span>{" "}
                  to add
                </li>
              ) : null}
              {plan.newActivities > 0 ? (
                <li>
                  <span className="font-medium tabular-nums">
                    {pluralize(plan.newActivities, "new activity", "new activities")}
                  </span>{" "}
                  to add
                </li>
              ) : null}
              {plan.identicalListings > 0 ? (
                <li className="text-muted-foreground">
                  {pluralize(plan.identicalListings, "quote")} already here, skipped
                </li>
              ) : null}
              {plan.identicalActivities > 0 ? (
                <li className="text-muted-foreground">
                  {pluralize(plan.identicalActivities, "activity", "activities")} already here, skipped
                </li>
              ) : null}
              {rejected > 0 ? (
                <li className="text-destructive">
                  {pluralize(rejected, "invalid entry", "invalid entries")} skipped
                </li>
              ) : null}
            </ul>
            {conflicts > 0 ? (
              <div className="grid gap-3">
                <p>
                  {pluralize(conflicts, "entry", "entries")} in the file{" "}
                  {conflicts === 1 ? "differs" : "differ"} from what you have.
                </p>
                <RadioGroup value={policy} onValueChange={(value) => setPolicy(value as ConflictPolicy)}>
                  <Field orientation="horizontal">
                    <RadioGroupItem value="keep-existing" id={`${id}-keep`} />
                    <FieldContent>
                      <FieldLabel htmlFor={`${id}-keep`}>Keep mine</FieldLabel>
                      <FieldDescription>Skip the file's version.</FieldDescription>
                    </FieldContent>
                  </Field>
                  <Field orientation="horizontal">
                    <RadioGroupItem value="keep-both" id={`${id}-both`} />
                    <FieldContent>
                      <FieldLabel htmlFor={`${id}-both`}>Keep both</FieldLabel>
                      <FieldDescription>Add the file's version as a separate entry.</FieldDescription>
                    </FieldContent>
                  </Field>
                </RadioGroup>
              </div>
            ) : null}
            {tripDiffers && plan.incoming.trip ? (
              <div className="grid gap-3">
                <p>
                  {plan.tripChange === "add"
                    ? "The file has trip details, and you have not set yours yet."
                    : "The file's trip details differ from yours."}
                </p>
                <RadioGroup
                  aria-label="Trip details"
                  value={tripChoice}
                  onValueChange={(value) => setTripChoice(value as "keep" | "file")}
                >
                  <Field orientation="horizontal">
                    <RadioGroupItem value="keep" id={`${id}-trip-keep`} />
                    <FieldContent>
                      <FieldLabel htmlFor={`${id}-trip-keep`}>Keep my trip details</FieldLabel>
                      <FieldDescription>{currentTrip ? describeTrip(currentTrip) : "Not set"}</FieldDescription>
                    </FieldContent>
                  </Field>
                  <Field orientation="horizontal">
                    <RadioGroupItem value="file" id={`${id}-trip-file`} />
                    <FieldContent>
                      <FieldLabel htmlFor={`${id}-trip-file`}>Use the file's trip details</FieldLabel>
                      <FieldDescription>{describeTrip(plan.incoming.trip)}</FieldDescription>
                    </FieldContent>
                  </Field>
                </RadioGroup>
              </div>
            ) : null}
          </div>
        ) : null}
        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button onClick={() => onConfirm(policy, tripDiffers && tripChoice === "file")} disabled={nothingToAdd}>
            Import
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
