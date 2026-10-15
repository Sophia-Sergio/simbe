import { act, fireEvent, render, screen } from "@testing-library/react"
import { ToastProvider, useToast } from "./Toast"
import { restoreMatchMedia, setViewport } from "./test-utils"

afterEach(() => restoreMatchMedia())

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
    expect(screen.getByRole("status")).toHaveTextContent("B")

    act(() => vi.advanceTimersByTime(2))
    expect(screen.getByRole("status")).toHaveTextContent("")
  } finally {
    vi.useRealTimers()
  }
})

it("keeps an empty live region mounted while idle", () => {
  render(
    <ToastProvider>
      <Probe />
    </ToastProvider>,
  )
  // A live region inserted already holding its text is often not announced, so the
  // region must exist before the first toast and only its content may change.
  const region = screen.getByRole("status")
  expect(region).toHaveTextContent("")
  expect(region).toHaveAttribute("aria-live", "polite")
  expect(region).toHaveClass("sr-only")
})

it("portals the live region to document.body so a locked dialog cannot hide it", () => {
  const root = document.createElement("div")
  root.id = "root"
  document.body.append(root)

  render(
    <ToastProvider>
      <Probe />
    </ToastProvider>,
    { container: root },
  )
  // useLockBody marks #root aria-hidden (and inert) while a dialog is open.
  root.setAttribute("aria-hidden", "true")

  fireEvent.click(screen.getByText("a"))
  const region = screen.getByRole("status")
  expect(root.contains(region)).toBe(false)
  expect(region).toHaveTextContent("A")

  root.remove()
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
