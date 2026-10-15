import { Pill } from "./Pill"
import type { PillTone } from "./Pill"

export type StatusPillStatus = { key: string; label: string; tone: PillTone }

/** Renders a lead/task status object (`{ key, label, tone }`) as a Pill. */
export function StatusPill({ status }: { status: StatusPillStatus }) {
  return <Pill tone={status.tone}>{status.label}</Pill>
}
