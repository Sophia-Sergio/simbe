import { useQuery } from "@tanstack/react-query"
import { API, jsonRequest } from "../client"
import type { CoordinatorDetail, CoordinatorRow } from "../types"

export function useCoordinators() {
  return useQuery({ queryKey: ["coordinators"], queryFn: () => jsonRequest<CoordinatorRow[]>("GET", `${API}/coordinators`) })
}

export function useCoordinator(name: string) {
  return useQuery({
    queryKey: ["coordinators", name],
    queryFn: () => jsonRequest<CoordinatorDetail>("GET", `${API}/coordinators/${encodeURIComponent(name)}`),
  })
}
