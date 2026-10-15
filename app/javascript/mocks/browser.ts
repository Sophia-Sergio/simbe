import { setupWorker } from "msw/browser"
import { allHandlers } from "./handlers"

// The standalone mock host (npm run dev:mock) and the Rails dev server with VITE_API_MODE=mock.
export const worker = setupWorker(...allHandlers)
