import { http } from "msw"
import { accountHandlers } from "./account"
import { agentHandlers } from "./agent"
import { authHandlers } from "./auth"
import { coordinatorsHandlers } from "./coordinators"
import { leadsHandlers } from "./leads"
import { mcpHandlers } from "./mcp"
import { metricsHandlers } from "./metrics"
import { nextActionsHandlers } from "./nextActions"
import { scenarioDelay, scenarioError } from "./shared"
import { snapshotHandlers } from "./snapshots"

// Scenario wrapper: under `slow` every handler waits; under `error` every GET data endpoint fails. It runs
// first and falls through (returns undefined) to the real handler.
const scenarioHandler = http.all("/api/v1/*", async ({ request }) => {
  const error = scenarioError(request)
  if (error) return error
  await scenarioDelay()
  return undefined
})

/**
 * The single aggregator for every mock handler. Each domain lives in its own file
 * (`handlers/<domain>.ts`) and is added here; nothing else imports a domain module directly.
 * Order matters where a literal path would otherwise match a `:param` route (e.g. `/leads/board`
 * before `/leads/:id`).
 */
export const allHandlers = [
  scenarioHandler,
  ...authHandlers,
  ...accountHandlers,
  ...snapshotHandlers,
  ...metricsHandlers,
  ...leadsHandlers,
  ...nextActionsHandlers,
  ...coordinatorsHandlers,
  ...agentHandlers,
  ...mcpHandlers,
]
