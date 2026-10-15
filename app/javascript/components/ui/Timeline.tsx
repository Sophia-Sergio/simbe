export type TimelineItem = { at: string; title: string; detail?: string }

const DOT = "mt-[5px] h-2.5 w-2.5 shrink-0 rounded-full"

/** Vertical activity timeline, newest first; the newest dot is brand. */
export function Timeline({ items, formatAt }: { items: TimelineItem[]; formatAt: (iso: string) => string }) {
  const sorted = [...items].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())

  return (
    <ol className="flex flex-col">
      {sorted.map((item, index) => (
        <li key={`${item.at}-${item.title}`} data-testid="timeline-item" className="flex gap-3">
          <div className="flex flex-col items-center">
            <span data-testid="timeline-dot" className={`${DOT} ${index === 0 ? "bg-brand" : "bg-line-strong"}`} />
            {index < sorted.length - 1 ? <span className="w-px flex-1 bg-line" /> : null}
          </div>
          <div className="flex flex-1 items-start justify-between gap-3 pb-4">
            <div className="min-w-0">
              <p className="truncate text-[13px] font-medium text-ink" title={item.title}>
                {item.title}
              </p>
              {item.detail ? <p className="truncate text-[12px] text-ink-muted">{item.detail}</p> : null}
            </div>
            <span className="shrink-0 text-[12px] text-ink-muted">{formatAt(item.at)}</span>
          </div>
        </li>
      ))}
    </ol>
  )
}
