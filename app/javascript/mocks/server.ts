import { setupServer } from "msw/node"
import { allHandlers } from "./handlers"

// Vitest (Node) runs the same handlers through the MSW server; setup.ts starts it with onUnhandledRequest "error".
export const server = setupServer(...allHandlers)
