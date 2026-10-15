import { useCallback } from "react"
import { useSearchParams } from "react-router-dom"
import type { Range } from "@/lib/format"

export const RANGES: Range[] = ["30d", "90d", "12m"]
export const DEFAULT_RANGE: Range = "30d"

function parse(value: string | null): Range {
  return value === "30d" || value === "90d" || value === "12m" ? value : DEFAULT_RANGE
}

/** URL-backed cohort range (`?range=`), defaulting to `30d` and preserving other params. */
export function useRange(): [Range, (range: Range) => void] {
  const [params, setParams] = useSearchParams()
  const range = parse(params.get("range"))

  const setRange = useCallback(
    (next: Range) => {
      setParams(
        (prev) => {
          const merged = new URLSearchParams(prev)
          merged.set("range", next)
          return merged
        },
        { replace: true },
      )
    },
    [setParams],
  )

  return [range, setRange]
}
