import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { API, jsonRequest } from "../client"
import type { Me } from "../types"

/** Current user + agency. 401 surfaces as ApiError{status:401} for AuthProvider to redirect. */
export function useMe() {
  return useQuery({ queryKey: ["me"], queryFn: () => jsonRequest<Me>("GET", `${API}/me`) })
}

export function useSignIn() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: { email: string; password: string }) => jsonRequest<Me>("POST", `${API}/session`, body),
    onSuccess: (me) => queryClient.setQueryData(["me"], me),
  })
}

/** Signs out and clears the whole cache so no other session's data can linger. */
export function useSignOut() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => jsonRequest<void>("DELETE", `${API}/session`),
    onSuccess: () => queryClient.clear(),
  })
}
