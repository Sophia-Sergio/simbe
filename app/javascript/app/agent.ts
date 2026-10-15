import { createContext, useContext } from "react"

export type AgentApi = { isOpen: boolean; open: (question?: string) => void; close: () => void }

/** The agent lane (B-AGENT) provides the real value; until then these defaults are harmless no-ops. */
export const AgentContext = createContext<AgentApi>({ isOpen: false, open: () => {}, close: () => {} })

export const useAgent = (): AgentApi => useContext(AgentContext)
