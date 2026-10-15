import { fireEvent, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { Dropzone } from "./Dropzone"

const csv = (name: string) => new File(["a"], name, { type: "text/csv" })

it("calls onFiles for uploaded matching files", async () => {
  const onFiles = vi.fn()
  render(<Dropzone label="Drop your CSV exports" ariaLabel="CSV files" multiple accept=".csv" onFiles={onFiles} />)

  const first = csv("leads.csv")
  const second = csv("appointments.csv")
  await userEvent.upload(screen.getByLabelText("CSV files"), [first, second])

  expect(onFiles).toHaveBeenCalledTimes(1)
  expect(onFiles.mock.calls[0][0]).toEqual([first, second])
})

it("accepts dropped files and reports the rejected ones", () => {
  const onFiles = vi.fn()
  const onRejected = vi.fn()
  render(<Dropzone label="Drop your CSV exports" ariaLabel="CSV files" accept=".csv" onFiles={onFiles} onRejected={onRejected} />)

  const good = csv("leads.csv")
  const bad = new File(["b"], "chart.png", { type: "image/png" })
  fireEvent.drop(screen.getByTestId("dropzone"), { dataTransfer: { files: [good, bad] } })

  expect(onFiles).toHaveBeenCalledWith([good])
  expect(onRejected).toHaveBeenCalledWith([bad])
})

it("delivers only the first dropped file when multiple is false", () => {
  const onFiles = vi.fn()
  render(<Dropzone label="Drop your CSV exports" ariaLabel="CSV files" accept=".csv" onFiles={onFiles} />)

  fireEvent.drop(screen.getByTestId("dropzone"), {
    dataTransfer: { files: [csv("leads.csv"), csv("appointments.csv")] },
  })

  expect(onFiles).toHaveBeenCalledTimes(1)
  expect(onFiles.mock.calls[0][0]).toHaveLength(1)
  expect(onFiles.mock.calls[0][0][0].name).toBe("leads.csv")
})

it("keeps the hidden input out of the tab order and swallows its click", () => {
  render(<Dropzone label="Drop your CSV exports" ariaLabel="CSV files" onFiles={vi.fn()} />)
  const input = screen.getByLabelText("CSV files")
  expect(input).toHaveAttribute("tabindex", "-1")

  const clickSpy = vi.spyOn(input, "click")
  fireEvent.click(input)
  // The container's click handler must not re-open the picker from the input's own click.
  expect(clickSpy).not.toHaveBeenCalled()
})

it("opens the picker on Enter and Space", () => {
  render(<Dropzone label="Drop your CSV exports" ariaLabel="CSV files" onFiles={vi.fn()} />)
  const input = screen.getByLabelText("CSV files")
  const clickSpy = vi.spyOn(input, "click")

  fireEvent.keyDown(screen.getByTestId("dropzone"), { key: "Enter" })
  expect(clickSpy).toHaveBeenCalledTimes(1)

  fireEvent.keyDown(screen.getByTestId("dropzone"), { key: " " })
  expect(clickSpy).toHaveBeenCalledTimes(2)
})

it("blocks both paths while disabled", async () => {
  const onFiles = vi.fn()
  render(<Dropzone label="Drop your CSV exports" ariaLabel="CSV files" disabled onFiles={onFiles} />)

  const input = screen.getByLabelText("CSV files")
  expect(input).toBeDisabled()

  const clickSpy = vi.spyOn(input, "click")
  await userEvent.click(screen.getByTestId("dropzone"), { pointerEventsCheck: 0 })
  expect(clickSpy).not.toHaveBeenCalled()

  // A disabled dropzone must still cancel the drop so the browser does not open the CSV.
  expect(fireEvent.drop(screen.getByTestId("dropzone"), { dataTransfer: { files: [csv("leads.csv")] } })).toBe(false)
  expect(onFiles).not.toHaveBeenCalled()
})
