export type ProgressSegmentState = "done" | "action" | "closed" | "current" | "todo"

const SEGMENT_CLASSES: Record<ProgressSegmentState, string> = {
  done: "bg-success",
  current: "bg-success",
  action: "bg-warning",
  closed: "bg-danger",
  todo: "bg-subtle",
}

/** Six 5px segments (inquiry → accepted) coloured by the lead's progress. */
export function ProgressBar({ segments }: { segments: ProgressSegmentState[] }) {
  return (
    <div className="flex gap-0.5" role="presentation">
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
