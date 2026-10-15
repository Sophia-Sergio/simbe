import { Link } from "react-router-dom"
import type { ShellProps } from "../types"

/** Initial stub: W0-6B replaces this with the real top bar + tab bar. */
export function MobileShell({ nav, title, overlays, topBarRight, onSignOut, children }: ShellProps) {
  return (
    <div data-shell="mobile">
      <header>
        <h1>{title}</h1>
        {topBarRight}
        <button type="button" onClick={onSignOut}>
          Sign out
        </button>
      </header>
      <main>{children}</main>
      <nav aria-label="Primary">
        {nav.flatMap((item) => (item.to ? [<Link key={item.id} to={item.to}>{item.label}</Link>] : []))}
      </nav>
      {overlays}
    </div>
  )
}
