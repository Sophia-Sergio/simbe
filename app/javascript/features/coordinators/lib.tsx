import type { CoordinatorRow, Role } from "@/api/types"
import { LinkButton } from "@/components/ui/Button"
import { EmptyState } from "@/components/ui/EmptyState"
import type { StatusPillStatus } from "@/components/ui/StatusPill"

/** `needs_support` when more than 8 leads are overdue, otherwise `on_track` (spec decision 9). */
export const COORDINATOR_STATUS: Record<CoordinatorRow["status"], StatusPillStatus> = {
  on_track: { key: "on_track", label: "On track", tone: "success" },
  needs_support: { key: "needs_support", label: "Needs support", tone: "warning" },
}

/** Clamps a KPI bar percentage to 0–100; absent and non-finite (NaN/±Infinity) input falls back to 0. */
export function barPct(value: number | null | undefined, fallback = 0): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback
  return Math.max(0, Math.min(100, value))
}

/** No snapshot has ever been loaded — owners upload, coordinators ask the owner to. */
export function CoordinatorNoData({ role }: { role: Role | null }) {
  if (role === "owner") {
    return (
      <EmptyState
        title="Load your data"
        body="Upload your seven CSV exports to see how each coordinator is doing."
        action={
          <LinkButton to="/data" size="sm">
            Load your data
          </LinkButton>
        }
      />
    )
  }
  return <EmptyState title="No data yet" body="Ask your agency owner to load data." />
}
