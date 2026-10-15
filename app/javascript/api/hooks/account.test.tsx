import { act, waitFor } from "@testing-library/react"
import agencyFixture from "@contracts/examples/account/agency.json"
import type { Agency } from "../types"
import { ApiError } from "../client"
import { asRole } from "@/test/mockApi"
import { useInviteCoordinator, useTeam, useUpdateAgency } from "./account"
import { createQueryClient, renderHookWithQuery } from "./testUtils"

it("useInviteCoordinator exposes valid_names from ApiError.extra", async () => {
  const { result } = renderHookWithQuery(() => useInviteCoordinator())
  await act(async () => {
    await result.current.mutateAsync({ email: "maya@harbor.test", coordinator_name: "Nobody" }).catch(() => undefined)
  })
  await waitFor(() => expect(result.current.error).toBeInstanceOf(ApiError))
  expect((result.current.error as ApiError).extra.valid_names).toContain("Dana Ortiz")
})

it("useUpdateAgency is optimistic and invalidates the derived caches", async () => {
  const client = createQueryClient()
  client.setQueryData(["agency"], agencyFixture as Agency)
  const invalidate = vi.spyOn(client, "invalidateQueries")
  const { result } = renderHookWithQuery(() => useUpdateAgency(), { client })
  await act(async () => {
    await result.current.mutateAsync({ qualified_milestone: "records" })
  })
  expect(client.getQueryData<Agency>(["agency"])?.qualified_milestone).toBe("records")
  expect(invalidate).toHaveBeenCalledWith({ queryKey: ["metrics"] })
  expect(invalidate).toHaveBeenCalledWith({ queryKey: ["leads"] })
  expect(invalidate).toHaveBeenCalledWith({ queryKey: ["coordinators"] })
})

it("useTeam surfaces 403 for a coordinator", async () => {
  asRole("coordinator")
  const { result } = renderHookWithQuery(() => useTeam())
  await waitFor(() => expect(result.current.error).toBeInstanceOf(ApiError))
  expect((result.current.error as ApiError).status).toBe(403)
})
