import { waitFor } from "@testing-library/react"
import summaryFixture from "@contracts/examples/metrics/summary.json"
import { mockApi } from "@/test/mockApi"
import { useSummary } from "./metrics"
import { renderHookWithQuery } from "./testUtils"

it("requests the range and keys by it", async () => {
  const { result, rerender } = renderHookWithQuery(({ r }: { r: "30d" | "90d" }) => useSummary(r), { initialProps: { r: "30d" } })
  await waitFor(() => expect(result.current.data?.kpis.leads.value).toBe(10))

  mockApi({
    "GET /api/v1/metrics/summary?range=90d": {
      ...summaryFixture,
      range: "90d",
      kpis: { ...summaryFixture.kpis, leads: { value: 99, previous: null, delta: null } },
    },
  })
  rerender({ r: "90d" })
  await waitFor(() => expect(result.current.data?.range).toBe("90d"))
  expect(result.current.data?.kpis.leads.value).toBe(99)
})
