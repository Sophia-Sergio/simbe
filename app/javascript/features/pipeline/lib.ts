import type { LeadCard } from "@/api/types"

type Stage = LeadCard["stage"]

/** `"28 yrs | CA"`, dropping a missing age or state (never a dangling `"| CA"` or `"28 yrs |"`). */
export function ageState(lead: LeadCard): string {
  return [lead.age != null ? `${lead.age} yrs` : null, lead.state].filter(Boolean).join(" | ")
}

const STAGE_LABELS: Record<Stage, string> = {
  inquiry: "Inquiry",
  pre_screen: "Pre-screen",
  application: "Application",
  consult: "Consult",
  records: "Records",
  accepted: "Accepted",
}

/** Human label for a stage key (`pre_screen` → `Pre-screen`). */
export function stageLabel(stage: Stage): string {
  return STAGE_LABELS[stage]
}
