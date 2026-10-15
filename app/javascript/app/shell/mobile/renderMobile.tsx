import { screen } from "@testing-library/react"
import type { ReactNode } from "react"
import type { User } from "@/api/types"
import { renderWithProviders } from "@/test/renderWithProviders"
import type { FeatureModule } from "../../feature"
import { useSearchPalette } from "../../searchPalette"
import { MobileShell } from "./MobileShell"
import { COORDINATOR_NAV, OWNER_NAV } from "./fixtures"

export const OWNER: User = { id: "u1", name: "Erin Walsh", email: "erin@harbor.test", role: "owner" }
export const COORDINATOR: User = { id: "u2", name: "Dana Ortiz", email: "dana@harbor.test", role: "coordinator" }
const AGENCY = { id: "a1", name: "Harbor Surrogacy", slug: "harbor", timezone: "America/Los_Angeles", qualified_milestone: "consult_attended" as const }

function PaletteProbe() {
  const { isOpen } = useSearchPalette()
  return <div data-testid="palette">{isOpen ? "open" : "closed"}</div>
}
const probe: FeatureModule = { id: "probe", overlays: [{ id: "palette", component: PaletteProbe }] }

export function renderMobile({
  role = "owner",
  route = "/",
  title = "Home",
  onSignOut = () => {},
  fab = null,
  agentOpen = false,
}: {
  role?: "owner" | "coordinator"
  route?: string
  title?: string
  onSignOut?: () => void
  fab?: ReactNode
  agentOpen?: boolean
} = {}) {
  const rendered = renderWithProviders(
    <MobileShell
      user={role === "owner" ? OWNER : COORDINATOR}
      agency={AGENCY}
      nav={role === "owner" ? OWNER_NAV : COORDINATOR_NAV}
      title={title}
      overlays={<i data-testid="overlay">overlay</i>}
      fab={fab}
      topBarRight={null}
      onSignOut={onSignOut}
    >
      <p>page body</p>
    </MobileShell>,
    { route, role, viewport: 390, agentOpen, features: [probe] },
  )
  return { ...rendered, palette: () => screen.getByTestId("palette") }
}
