export type ProgressSegmentState = "done" | "action" | "closed" | "current" | "todo"

const SEGMENT_CLASSES: Record<ProgressSegmentState, string> = {
  done: "bg-success",
  current: "bg-success",
  action: "bg-warning",
  closed: "bg-danger",
  todo: "bg-subtle",
}

/** Human description of the bar so stage progress is not colour-only. */
function describe(segments: ProgressSegmentState[]): string {
  const done = segments.filter((state) => state === "done" || state === "current").length
  const parts = [`${done} of ${segments.length} stages done`]
  if (segments.includes("action")) parts.push("needs action")
  if (segments.includes("closed")) parts.push("closed")
  return parts.join(", ")
}

/** Six 5px segments (inquiry → accepted) coloured by the lead's progress. */
export function ProgressBar({
  segments,
  label,
}: {
  segments: ProgressSegmentState[]
  label?: string
}) {
  return (
    <div className="flex gap-0.5" role="img" aria-label={label ?? describe(segments)}>
      {segments.map((state, index) => (
        <span
          key={index}
          data-testid="segment"
          data-state={state}
          className={`h-[5px] flex-1 rounded-full ${SEGMENT_CLASSES[state]}`}
        />
      ))}
    </div>
  )
}
