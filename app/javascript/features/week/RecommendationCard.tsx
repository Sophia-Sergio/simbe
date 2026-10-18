import { Sparkles } from "lucide-react"
import { Button } from "@/components/ui/Button"
import { Pill } from "@/components/ui/Pill"
import type { PillTone } from "@/components/ui/Pill"
import type { Recommendation } from "@/api/types"

const AREA: Record<Recommendation["area"], { label: string; tone: PillTone }> = {
  process: { label: "Process", tone: "warning" },
  ads: { label: "Ads", tone: "brand" },
  people: { label: "People", tone: "violet" },
}

/** One recommended action: area, impact, title, why, an "Open …" button and a preset "Ask why". */
export function RecommendationCard({
  rec,
  onAsk,
  onOpen,
}: {
  rec: Recommendation
  onAsk: (question: string) => void
  onOpen: (route: string) => void
}) {
  const area = AREA[rec.area]
  return (
    <article className="rounded-row border border-line bg-surface p-4">
      <div className="flex flex-wrap items-center gap-2 text-[12px]">
        <Pill tone={area.tone}>{area.label}</Pill>
        <span className="text-ink-muted">{rec.impact}</span>
      </div>
      <h3 className="mt-2 text-[15px] font-semibold text-ink">{rec.title}</h3>
      <p className="mt-1 text-[13px] text-ink-secondary">{rec.why}</p>
      <div className="mt-3 flex flex-wrap gap-3">
        <Button variant="outline-brand" size="sm" onClick={() => onOpen(rec.cta.route)}>
          {rec.cta.label}
        </Button>
        <Button variant="ghost" size="sm" leftIcon={<Sparkles aria-hidden className="h-3.5 w-3.5" />} onClick={() => onAsk(rec.ask.question)}>
          Ask why
        </Button>
      </div>
    </article>
  )
}
