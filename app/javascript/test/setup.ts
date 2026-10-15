import "@testing-library/jest-dom/vitest"
import { afterAll, afterEach, beforeAll, beforeEach } from "vitest"
import { db, OWNER_EMAIL } from "@/mocks/db"
import { server } from "@/mocks/server"

// Every test runs against the mock API with unhandled requests an error, so a missing handler fails loudly.
beforeAll(() => server.listen({ onUnhandledRequest: "error" }))

beforeEach(() => {
  if (typeof localStorage !== "undefined") localStorage.clear()
  db.reset()
  // Default handlers authenticate; a test that needs signed-out/coordinator state calls asRole() or clears db.session.
  db.session = { email: OWNER_EMAIL, role: "owner" }
})

afterEach(() => {
  server.resetHandlers()
  db.reset()
})

afterAll(() => server.close())
