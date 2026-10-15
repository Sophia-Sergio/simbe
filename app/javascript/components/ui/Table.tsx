import type { ReactNode } from "react"
import { useIsDesktop } from "@/hooks/useIsDesktop"

export type Column<T> = {
  key: string
  header: ReactNode
  align?: "left" | "center" | "right"
  render?: (row: T) => ReactNode
  width?: string
}

const ALIGN: Record<"left" | "center" | "right", string> = {
  left: "text-left",
  center: "text-center",
  right: "text-right",
}

function cellValue<T>(row: T, column: Column<T>): ReactNode {
  if (column.render) return column.render(row)
  const value = (row as Record<string, unknown>)[column.key]
  return value === null || value === undefined || value === "" ? "—" : String(value)
}

/**
 * Semantic table on desktop; stacked `renderCard` rows below 860px.
 * Clickable rows are keyboard-operable (`<tr tabIndex=0>` + Enter).
 */
export function Table<T>({
  columns,
  rows,
  rowKey,
  onRowClick,
  renderCard,
  emptyText = "Nothing to show",
}: {
  columns: Column<T>[]
  rows: T[]
  rowKey: (row: T) => string
  onRowClick?: (row: T) => void
  renderCard?: (row: T) => ReactNode
  emptyText?: string
}) {
  const desktop = useIsDesktop()

  if (!desktop && renderCard) {
    return (
      <div className="flex flex-col gap-2">
        {rows.length === 0 ? (
          <p className="px-1 py-4 text-center text-[13px] text-ink-muted">{emptyText}</p>
        ) : (
          rows.map((row) => (
            <div key={rowKey(row)} className="rounded-card border border-line bg-surface p-3 shadow-card">
              {renderCard(row)}
            </div>
          ))
        )}
      </div>
    )
  }

  return (
    <table className="w-full border-collapse text-[13px]">
      <thead>
        <tr className="bg-app text-[12px] font-medium text-ink-muted">
          {columns.map((column) => (
            <th
              key={column.key}
              scope="col"
              style={column.width ? { width: column.width } : undefined}
              className={`px-4 py-2.5 font-medium ${ALIGN[column.align ?? "left"]}`}
            >
              {column.header}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.length === 0 ? (
          <tr>
            <td colSpan={columns.length} className="px-4 py-6 text-center text-[13px] text-ink-muted">
              {emptyText}
            </td>
          </tr>
        ) : (
          rows.map((row) => (
            <tr
              key={rowKey(row)}
              role="row"
              tabIndex={onRowClick ? 0 : undefined}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              onKeyDown={
                onRowClick
                  ? (event) => {
                      if (event.key === "Enter") {
                        event.preventDefault()
                        onRowClick(row)
                      }
                    }
                  : undefined
              }
              className={`border-t border-line-subtle ${
                onRowClick ? "cursor-pointer hover:bg-app focus:bg-app focus:outline-none" : ""
              }`}
            >
              {columns.map((column) => (
                <td key={column.key} className={`px-4 py-3 text-ink-secondary ${ALIGN[column.align ?? "left"]}`}>
                  {cellValue(row, column)}
                </td>
              ))}
            </tr>
          ))
        )}
      </tbody>
    </table>
  )
}
