import { Chip } from "@/components/ui/Chip"

export type ColumnChipData = { key: string; label: string; count: number }

/** Mobile board switcher: one chip per pipeline column, showing its count and the selected one at a time. */
export function ColumnChips({
  columns,
  value,
  onChange,
}: {
  columns: ColumnChipData[]
  value: string
  onChange: (key: string) => void
}) {
  return (
    <div role="group" aria-label="Pipeline columns" className="flex gap-2 overflow-x-auto pb-1">
      {columns.map((column) => (
        <Chip key={column.key} selected={column.key === value} onClick={() => onChange(column.key)}>
          {column.label}
          <span className="text-ink-muted">{column.count}</span>
        </Chip>
      ))}
    </div>
  )
}
