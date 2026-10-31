import { useCallback, useRef } from "react"

/**
 * Dialogs opened from state (not from their own Trigger) don't know where to
 * return focus on close. Remember the opener and hand it to `finalFocus`.
 */
export function useReturnFocus() {
  const opener = useRef<HTMLElement | null>(null)
  const remember = useCallback((element: HTMLElement | null) => {
    opener.current = element
  }, [])
  const finalFocus = useCallback(() => (opener.current?.isConnected ? opener.current : true), [])
  return { remember, finalFocus }
}
