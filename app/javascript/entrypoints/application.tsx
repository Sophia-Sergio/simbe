import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { registry } from "../app/registry"
import "../styles/tokens.css"

// W0-5 replaces this body with the providers, router and shell.
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <main className="p-8">
      <h1 className="font-display text-2xl font-semibold text-ink">Simbe</h1>
      {registry.features.length === 0 && <p className="mt-2 text-ink-muted">No features registered</p>}
    </main>
  </StrictMode>,
)
