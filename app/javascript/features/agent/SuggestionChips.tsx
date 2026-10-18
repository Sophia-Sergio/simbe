import { Chip } from "@/components/ui/Chip"
import { Skeleton } from "@/components/ui/Skeleton"

/** Starter and follow-up question chips: identical look in the empty state and under the thread. */
export function SuggestionChips({
  suggestions,
  loading = false,
  onSelect,
}: {
  suggestions: string[]
  loading?: boolean
  onSelect: (text: string) => void
}) {
  if (loading) {
    return (
      <div className="flex flex-wrap gap-2" aria-hidden>
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-7 w-44 rounded-full" />
        ))}
      </div>
    )
  }
  if (suggestions.length === 0) return null
  return (
    <div className="flex flex-wrap gap-2">
      {suggestions.map((suggestion) => (
        <Chip key={suggestion} multiline onClick={() => onSelect(suggestion)}>
          {suggestion}
        </Chip>
      ))}
    </div>
  )
}
