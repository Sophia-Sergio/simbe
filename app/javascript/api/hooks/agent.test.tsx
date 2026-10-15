import { act, waitFor } from "@testing-library/react"
import { useAgentSuggestions, useSendAgentMessage } from "./agent"
import { renderHookWithQuery } from "./testUtils"

it("useAgentSuggestions returns four chips for the owner", async () => {
  const { result } = renderHookWithQuery(() => useAgentSuggestions())
  await waitFor(() => expect(result.current.data?.suggestions).toHaveLength(4))
})

it("useSendAgentMessage posts the question and returns the assistant message", async () => {
  const { result } = renderHookWithQuery(() => useSendAgentMessage())
  await act(async () => {
    await result.current.mutateAsync({ text: "Which channel costs the most?" })
  })
  await waitFor(() => expect(result.current.data?.message.role).toBe("assistant"))
})
