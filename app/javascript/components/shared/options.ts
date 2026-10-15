// Options shared by sign-up and settings: time zones and the qualified definition.

export type Milestone = "application_submitted" | "consult_attended" | "records" | "accepted"

export type TimezoneOption = { label: "Pacific" | "Mountain" | "Central" | "Eastern"; value: string }

export const TIMEZONES: TimezoneOption[] = [
  { label: "Pacific", value: "America/Los_Angeles" },
  { label: "Mountain", value: "America/Denver" },
  { label: "Central", value: "America/Chicago" },
  { label: "Eastern", value: "America/New_York" },
]

export type QualifiedOption = {
  value: Milestone
  title: string
  description: string
  recommended?: boolean
}

export const QUALIFIED_OPTIONS: QualifiedOption[] = [
  {
    value: "application_submitted",
    title: "Submitted an application",
    description: "They completed the application form.",
  },
  {
    value: "consult_attended",
    title: "Attended a consult",
    description: "They turned up for their consultation.",
    recommended: true,
  },
  {
    value: "records",
    title: "Reached medical records",
    description: "Their medical records arrived.",
  },
  {
    value: "accepted",
    title: "Been accepted",
    description: "They were accepted into the program.",
  },
]

const LABELS: Record<Milestone, string> = {
  application_submitted: "submitted an application",
  consult_attended: "attended a consult",
  records: "reached medical records",
  accepted: "been accepted",
}

/** Lowercase phrase for a subtitle, e.g. `Qualified = attended a consult`. */
export function definitionLabel(milestone: Milestone): string {
  return LABELS[milestone]
}
