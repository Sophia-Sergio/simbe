import { Fragment } from "react"
import { Outlet, useMatches } from "react-router-dom"
import { useIsDesktop } from "@/hooks/useIsDesktop"
import { useAuth } from "./auth/useAuth"
import { registry as defaultRegistry } from "./registry"
import type { Registry } from "./shell/types"
import { DesktopShell } from "./shell/desktop/DesktopShell"
import { MobileShell } from "./shell/mobile/MobileShell"

const titleOf = (handle: unknown): string | undefined =>
  handle && typeof handle === "object" && "title" in handle && typeof handle.title === "string" ? handle.title : undefined

/** Authenticated layout: picks the shell for the viewport and feeds it everything the registry contributes. */
export function AppShell({ registry = defaultRegistry }: { registry?: Registry }) {
  const { user, agency, role, signOut } = useAuth()
  const isDesktop = useIsDesktop()
  // The deepest matched route that declares a title wins.
  const title = [...useMatches()].reverse().map((match) => titleOf(match.handle)).find(Boolean) ?? ""

  if (!user || !agency || !role) return null

  const onSignOut = () => void signOut()

  const Shell = isDesktop ? DesktopShell : MobileShell
  // The overlays are portals to document.body, so they do not need to live inside a shell. Keeping them
  // outside the `isDesktop` branch means the 860px shell swap does not unmount an open panel (and its
  // scroll position) while the route and URL state stay put.
  const overlays = registry.overlays.map((overlay) => <overlay.component key={overlay.id} />)
  return (
    <>
      <Shell
        user={user}
        agency={agency}
        nav={registry.nav(role)}
        title={title}
        overlays={[]}
        fab={registry.fabs.map((Fab, index) => (
          <Fab key={index} />
        ))}
        topBarRight={registry.topBarRight.map((Item, index) => (
          <Fragment key={index}>
            <Item />
          </Fragment>
        ))}
        onSignOut={onSignOut}
      >
        <Outlet />
      </Shell>
      {overlays}
    </>
  )
}
