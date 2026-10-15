import { act, fireEvent, render, screen } from "@testing-library/react"
import { ToastProvider, useToast } from "./Toast"

function setViewport(width: number): void {
  window.matchMedia = ((query: string) => ({
    matches: /min-width:\s*860px/.test(query) ? width >= 860 : false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => true,
  })) as unknown as typeof window.matchMedia
  Object.defineProperty(window, "innerWidth", { writable: true, configurable: true, value: width })
  window.dispatchEvent(new Event("resize"))
}

function Probe() {
  const { show } = useToast()
  return (
    <>
      <button onClick={() => show("A")}>a</button>
      <button onClick={() => show("B")}>b</button>
    </>
  )
}

it("shows, replaces and auto-dismisses after 2.6s", () => {
  vi.useFakeTimers()
  try {
    render(
      <ToastProvider>
        <Probe />
      </ToastProvider>,
    )
    fireEvent.click(screen.getByText("a"))
    expect(screen.getByRole("status")).toHaveTextContent("A")

    act(() => vi.advanceTimersByTime(2000))
    fireEvent.click(screen.getByText("b"))
    expect(screen.getByRole("status")).toHaveTextContent("B")

    act(() => vi.advanceTimersByTime(2599))
    expect(screen.queryByRole("status")).not.toBeNull()

    act(() => vi.advanceTimersByTime(2))
    expect(screen.queryByRole("status")).toBeNull()
  } finally {
    vi.useRealTimers()
  }
})

it("sits above the tab bar on mobile", () => {
  setViewport(390)
  render(
    <ToastProvider>
      <Probe />
    </ToastProvider>,
  )
  fireEvent.click(screen.getByText("a"))
  expect(screen.getByTestId("toast")).toHaveClass("bottom-[84px]")
})
