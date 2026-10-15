import { useCallback, useEffect, useRef, useState } from "react"

export type AsyncAction<A extends unknown[], R> = {
  run: (...args: A) => Promise<R | undefined>
  pending: boolean
}

/**
 * Single-flight wrapper for click-triggered mutations: a re-entrant call is ignored while an
 * invocation is in flight, and `pending` is reset whether the action resolves or throws.
 * Errors are re-thrown so the caller can decide how to surface them.
 */
export function useAsyncAction<A extends unknown[], R>(fn: (...args: A) => Promise<R>): AsyncAction<A, R> {
  const [pending, setPending] = useState(false)
  const inFlight = useRef(false)
  const fnRef = useRef(fn)

  useEffect(() => {
    fnRef.current = fn
  }, [fn])

  const run = useCallback(async (...args: A): Promise<R | undefined> => {
    if (inFlight.current) return undefined
    inFlight.current = true
    setPending(true)
    try {
      return await fnRef.current(...args)
    } finally {
      inFlight.current = false
      setPending(false)
    }
  }, [])

  return { run, pending }
}
