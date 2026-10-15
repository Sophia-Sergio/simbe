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

it("blocks both paths while disabled", async () => {
  const onFiles = vi.fn()
  render(<Dropzone label="Drop your CSV exports" ariaLabel="CSV files" disabled onFiles={onFiles} />)

  expect(screen.getByLabelText("CSV files")).toBeDisabled()
  fireEvent.drop(screen.getByTestId("dropzone"), { dataTransfer: { files: [csv("leads.csv")] } })
  await userEvent.click(screen.getByTestId("dropzone"), { pointerEventsCheck: 0 })
  expect(onFiles).not.toHaveBeenCalled()
})
