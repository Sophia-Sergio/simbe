import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { RouterProvider } from "react-router-dom"
import { Providers } from "../app/Providers"
import { createAppRouter } from "../app/router"
import { MockChip, startMocks } from "../mocks/bootstrap"
import "../styles/tokens.css"

// Mock mode starts the service worker first so the very first /me request is already answered.
await startMocks()

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Providers>
      <RouterProvider router={createAppRouter()} />
    </Providers>
    <MockChip />
  </StrictMode>,
)
