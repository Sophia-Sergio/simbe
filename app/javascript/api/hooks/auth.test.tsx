import { act, waitFor } from "@testing-library/react"
import { ApiError } from "../client"
import { db } from "@/mocks/db"
import { mockApi } from "@/test/mockApi"
import { useMe, useSignOut } from "./auth"
import { renderHookWithQuery } from "./testUtils"

it("useMe returns the signed-in user", async () => {
  const { result } = renderHookWithQuery(() => useMe())
  await waitFor(() => expect(result.current.data?.user.email).toBe("erin@harbor.test"))
})

it("useMe surfaces an expired session as ApiError{status:401}", async () => {
  db.session = null
  const { result } = renderHookWithQuery(() => useMe())
  await waitFor(() => expect(result.current.error).toBeInstanceOf(ApiError))
  expect((result.current.error as ApiError).status).toBe(401)
})

it("useSignOut clears the whole query cache", async () => {
  const { result, client } = renderHookWithQuery(() => useSignOut())
  client.setQueryData(["leads", "board", null], { columns: {} })
  await act(async () => {
    await result.current.mutateAsync()
  })
  expect(client.getQueryData(["leads", "board", null])).toBeUndefined()
})

it("useSignOut clears the cache even when the request fails", async () => {
  mockApi({ "DELETE /api/v1/session": () => new Response("{}", { status: 500 }) })
  const { result, client } = renderHookWithQuery(() => useSignOut())
  client.setQueryData(["leads", "board", null], { columns: {} })
  await act(async () => {
    await result.current.mutateAsync().catch(() => undefined)
  })
  expect(client.getQueryData(["leads", "board", null])).toBeUndefined()
})
