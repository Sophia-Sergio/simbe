import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { API, jsonRequest } from "../client"
import type { components } from "../generated/schema"
import type { Agency, Invitation, Me, Team } from "../types"

type InvitationPreview = components["schemas"]["InvitationPreview"]
type CoordinatorNames = components["schemas"]["CoordinatorNames"]

/** Optimistically updates the agency (and the copy nested in ["me"]); rolls back on failure. */
export function useUpdateAgency() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: Partial<Agency>) => jsonRequest<Agency>("PATCH", `${API}/agency`, body),
    onMutate: async (body) => {
      await queryClient.cancelQueries({ queryKey: ["agency"] })
      const previousAgency = queryClient.getQueryData<Agency>(["agency"])
      const previousMe = queryClient.getQueryData<Me>(["me"])
      if (previousAgency) queryClient.setQueryData(["agency"], { ...previousAgency, ...body })
      if (previousMe) queryClient.setQueryData(["me"], { ...previousMe, agency: { ...previousMe.agency, ...body } })
      return { previousAgency, previousMe }
    },
    onError: (_error, _body, context) => {
      if (context?.previousAgency) queryClient.setQueryData(["agency"], context.previousAgency)
      if (context?.previousMe) queryClient.setQueryData(["me"], context.previousMe)
    },
    onSuccess: (agency) => {
      queryClient.setQueryData(["agency"], agency)
      void queryClient.invalidateQueries({ queryKey: ["metrics"] })
      void queryClient.invalidateQueries({ queryKey: ["leads"] })
      void queryClient.invalidateQueries({ queryKey: ["coordinators"] })
    },
  })
}

export function useSignup() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: unknown) => jsonRequest<Me>("POST", `${API}/signup`, body),
    onSuccess: (me) => queryClient.setQueryData(["me"], me),
  })
}

export function useTeam() {
  return useQuery({ queryKey: ["team"], queryFn: ({ signal }) => jsonRequest<Team>("GET", `${API}/team`, undefined, signal) })
}

export function useInviteCoordinator() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: { email: string; coordinator_name: string }) => jsonRequest<Invitation>("POST", `${API}/invitations`, body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["team"] }),
  })
}

export function useDeleteInvitation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => jsonRequest<void>("DELETE", `${API}/invitations/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["team"] }),
  })
}

/** Public preview for the accept-invitation screen (token comes from the accept_url). */
export function useInvitationPreview(token: string) {
  return useQuery({
    queryKey: ["invitation", token],
    queryFn: ({ signal }) => jsonRequest<InvitationPreview>("GET", `${API}/invitations/${encodeURIComponent(token)}/preview`, undefined, signal),
  })
}

export function useAcceptInvitation(token: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: { name: string; password: string }) =>
      jsonRequest<Me>("POST", `${API}/invitations/${encodeURIComponent(token)}/accept`, body),
    onSuccess: (me) => queryClient.setQueryData(["me"], me),
  })
}

export function useCoordinatorNames() {
  return useQuery({ queryKey: ["coordinators", "names"], queryFn: ({ signal }) => jsonRequest<CoordinatorNames>("GET", `${API}/coordinator_names`, undefined, signal) })
}
