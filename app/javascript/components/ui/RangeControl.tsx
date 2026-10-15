import type { Range } from "@/lib/format"
import { Segmented } from "./Segmented"

const OPTIONS: { value: Range; label: string }[] = [
  { value: "30d", label: "30 days" },
  { value: "90d", label: "90 days" },
  { value: "12m", label: "12 months" },
]

/** Cohort-range segmented control shared by This week / Funnel / Channels. */
export function RangeControl({ value, onChange }: { value: Range; onChange: (range: Range) => void }) {
  return <Segmented aria-label="Range" value={value} options={OPTIONS} onChange={onChange} />
}
