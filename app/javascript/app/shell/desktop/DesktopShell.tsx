import { Link } from "react-router-dom"
import type { ShellProps } from "../types"

/** Initial stub: W0-6A replaces this with the real sidebar + top bar. */
export function DesktopShell({ nav, title, overlays, fab, topBarRight, onSignOut, children }: ShellProps) {
  return (
    <div data-shell="desktop">
      <nav aria-label="Primary">
        {nav.flatMap((item) => (item.to ? [<Link key={item.id} to={item.to}>{item.label}</Link>] : []))}
      </nav>
      <header>
        <h1>{title}</h1>
        {topBarRight}
        <button type="button" onClick={onSignOut}>
          Sign out
        </button>
      </header>
      <main>{children}</main>
      {overlays}
      {fab}
    </div>
  )
}
