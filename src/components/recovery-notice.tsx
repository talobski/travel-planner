import { useState } from "react"
import { toast } from "sonner"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import type { AppStore } from "@/hooks/use-app-data"
import { pluralize } from "@/lib/dates"
import { downloadText, fileDate } from "@/lib/download"
import { totalRejected, type RejectedCounts } from "@/lib/storage"

/** "1 quote and 2 activities were left out." */
function describeRejected(rejected: RejectedCounts) {
  const parts = [
    rejected.groups ? pluralize(rejected.groups, "stay") : "",
    rejected.listings ? pluralize(rejected.listings, "quote") : "",
    rejected.activities ? pluralize(rejected.activities, "activity", "activities") : "",
    rejected.trip ? "the trip details" : "",
  ].filter(Boolean)
  const list = parts.length > 1 ? `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}` : parts[0]
  return `${list} ${totalRejected(rejected) > 1 || rejected.trip ? "were" : "was"} left out.`
}

/** Says what happened to saved data that was not read in full, and, when no copy could be kept, how to recover. */
export function RecoveryNotice({ store }: { store: AppStore }) {
  const { recovery, loadStatus } = store
  const [confirming, setConfirming] = useState(false)
  if (!recovery) return null

  const unreadable = recovery.kind === "unreadable"
  const title = unreadable ? "Saved data could not be read" : "Some saved entries could not be read"
  const skipped = loadStatus.status === "ok" ? describeRejected(loadStatus.rejected) : null

  if (recovery.original === null) {
    return (
      <Alert variant="destructive" className="mb-4">
        <AlertTitle>{title}</AlertTitle>
        <AlertDescription>
          {unreadable
            ? `The unreadable copy was kept in this browser's storage as ${recovery.backupKey}. Import a backup to restore your quotes and plans.`
            : `${skipped} The original saved data was kept unchanged in this browser's storage as ${recovery.backupKey}.`}
        </AlertDescription>
      </Alert>
    )
  }

  const original = recovery.original
  function retry() {
    if (store.retryRecoveryCopy()) toast.success("Copy kept. Changes are being saved again.")
    else toast.error("Still not enough space. Nothing was overwritten.")
  }

  return (
    <Alert variant="destructive" className="mb-4">
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>
        {skipped ? `${skipped} ` : null}
        Browser storage is too full to keep a copy of the original, so saving is paused to avoid overwriting it.
        Changes you make now are not saved. Free up space and try again, or download the original before
        discarding it.
        <div className="mt-2 flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={retry}>
            Try again
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => downloadText(original, `travel-planner-original-${fileDate()}.json`)}
          >
            Download original
          </Button>
          <Button size="sm" variant="destructive" onClick={() => setConfirming(true)}>
            Discard original
          </Button>
        </div>
      </AlertDescription>
      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard the original saved data?</AlertDialogTitle>
            <AlertDialogDescription>
              {unreadable
                ? "The saved data that could not be read is replaced by what is shown now, and saving resumes. This cannot be undone."
                : "The entries that could not be read are lost, what was read is saved in their place, and saving resumes. This cannot be undone."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                setConfirming(false)
                store.discardOriginal()
              }}
            >
              Discard and resume saving
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Alert>
  )
}
