import { screen } from "@testing-library/react"
import type { Agency, User } from "@/api/types"
import { renderWithProviders } from "@/test/renderWithProviders"
import type { FeatureModule } from "../../feature"
import { useSearchPalette } from "../../searchPalette"
import { DesktopShell } from "./DesktopShell"
import { COORDINATOR_NAV, OWNER_NAV } from "./fixtures"

export const OWNER: User = { id: "u1", name: "Erin Harbor", email: "erin@harbor.test", role: "owner" }
const COORDINATOR: User = { id: "u2", name: "Dana Ortiz", email: "dana@harbor.test", role: "coordinator" }
export const AGENCY: Agency = {
  id: "a1",
  name: "Harbor Surrogacy",
  slug: "harbor",
  timezone: "America/Los_Angeles",
  qualified_milestone: "consult_attended",
}

function PaletteProbe() {
  const { isOpen } = useSearchPalette()
  return <div data-testid="palette">{isOpen ? "open" : "closed"}</div>
}

const probe: FeatureModule = { id: "probe", overlays: [{ id: "palette", component: PaletteProbe }] }

export function renderShell({
  role = "owner",
  route = "/",
  agency = AGENCY,
  onSignOut = () => {},
  fab = null,
}: {
  role?: "owner" | "coordinator"
  route?: string
  agency?: Agency
  onSignOut?: () => void
  fab?: React.ReactNode
} = {}) {
  const rendered = renderWithProviders(
    <DesktopShell
      user={role === "owner" ? OWNER : COORDINATOR}
      agency={agency}
      nav={role === "owner" ? OWNER_NAV : COORDINATOR_NAV}
      title="Test"
      overlays={<i data-testid="overlay">overlay</i>}
      fab={fab}
      topBarRight={<span>right item</span>}
      onSignOut={onSignOut}
    >
      <p>page body</p>
    </DesktopShell>,
    { route, role, features: [probe] },
  )
  return { ...rendered, palette: () => screen.getByTestId("palette") }
}
