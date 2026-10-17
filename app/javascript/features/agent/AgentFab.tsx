import { Sparkles } from "lucide-react"
import { useAgent } from "@/app/agent"
import { useLeadPanel } from "@/app/leadPanel"

/**
 * Desktop-only 52px brand FAB (the mobile shell never renders the `fab` slot). Hidden while the
 * lead panel is open and while the agent itself is open — it stays mounted (out of the tab order,
 * `aria-hidden`) so closing the panel can return focus to the button that opened it.
 */
export function AgentFab() {
  const { isOpen, open } = useAgent()
  const { leadId } = useLeadPanel()
  const hidden = isOpen || leadId !== null

  return (
    <button
      type="button"
      aria-label="Ask Simbe"
      data-agent-fab
      onClick={() => open()}
      tabIndex={hidden ? -1 : undefined}
      aria-hidden={hidden || undefined}
      className={`inline-flex h-[52px] w-[52px] items-center justify-center rounded-full bg-gradient-brand text-white shadow-fab transition-transform hover:scale-[1.03] ${
        hidden ? "pointer-events-none opacity-0" : ""
      }`}
    >
      <Sparkles aria-hidden className="h-6 w-6" />
    </button>
  )
}
