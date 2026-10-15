import { accountHandlers } from "./account"
import { agentHandlers } from "./agent"
import { authHandlers } from "./auth"
import { coordinatorsHandlers } from "./coordinators"
import { leadsHandlers } from "./leads"
import { mcpHandlers } from "./mcp"
import { metricsHandlers } from "./metrics"
import { nextActionsHandlers } from "./nextActions"
import { snapshotHandlers } from "./snapshots"

/**
 * The single aggregator for every mock handler. Each domain lives in its own file
 * (`handlers/<domain>.ts`) and is added here; nothing else imports a domain module directly.
 * Order matters where a literal path would otherwise match a `:param` route (e.g. `/leads/board`
 * before `/leads/:id`).
 */
export const allHandlers = [
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
