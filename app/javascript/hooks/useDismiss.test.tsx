import { useRef } from "react"
import { render } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { useDismiss } from "./useDismiss"

function Probe({ onDismiss }: { onDismiss: () => void }) {
  const ref = useRef<HTMLDivElement>(null)
  useDismiss({ ref, onDismiss })
  return (
    <div>
      <div ref={ref} data-testid="inside">
        in
      </div>
      <div data-testid="outside">out</div>
    </div>
  )
}

it("useDismiss fires on Escape and outside click, not inside", async () => {
  const onDismiss = vi.fn()
  const { getByTestId } = render(<Probe onDismiss={onDismiss} />)

  await userEvent.keyboard("{Escape}")
  expect(onDismiss).toHaveBeenCalledTimes(1)

  await userEvent.click(getByTestId("outside"))
  expect(onDismiss).toHaveBeenCalledTimes(2)

  await userEvent.click(getByTestId("inside"))
  expect(onDismiss).toHaveBeenCalledTimes(2)
})

it("useDismiss is inert while disabled", async () => {
  const onDismiss = vi.fn()
  function Wrapper() {
    const ref = useRef<HTMLDivElement>(null)
    useDismiss({ ref, onDismiss, enabled: false })
    return <div ref={ref}>y</div>
  }
  render(<Wrapper />)
  await userEvent.keyboard("{Escape}")
  expect(onDismiss).not.toHaveBeenCalled()
})
