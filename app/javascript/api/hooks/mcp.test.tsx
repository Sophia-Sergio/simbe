import { act, waitFor } from "@testing-library/react"
import { useMcpSettings, useRotateMcpKey } from "./mcp"
import { renderHookWithQuery } from "./testUtils"

it("useMcpSettings loads the masked prefix and useRotateMcpKey returns a fresh key", async () => {
  const settings = renderHookWithQuery(() => useMcpSettings())
  await waitFor(() => expect(settings.result.current.data?.key_prefix).toBe("simbe_live_ab12"))

  const rotate = renderHookWithQuery(() => useRotateMcpKey())
  await act(async () => {
    await rotate.result.current.mutateAsync()
  })
  await waitFor(() => expect(rotate.result.current.data?.key).toMatch(/^simbe_live_[A-Za-z0-9]{24}$/))
})
