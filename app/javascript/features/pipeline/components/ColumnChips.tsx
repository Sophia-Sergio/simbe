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
          {/* The visual pieces are aria-hidden and a single sr-only string names the chip, so assistive tech
              reads "Qualified, 3" rather than the concatenated "Qualified3". */}
          <span aria-hidden="true">{column.label}</span>
          <span aria-hidden="true" className="text-ink-muted">
            {column.count}
          </span>
          <span className="sr-only">{`${column.label}, ${column.count}`}</span>
        </Chip>
      ))}
    </div>
  )
}
