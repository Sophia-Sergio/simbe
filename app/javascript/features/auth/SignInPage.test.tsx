import { QueryClient } from "@tanstack/react-query"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom"
import { Providers } from "@/app/Providers"
import { asRole, mockApi } from "@/test/mockApi"
import { SignInPage } from "./SignInPage"

function LocationProbe() {
  const location = useLocation()
  return <div data-testid="location">{`${location.pathname}${location.search}`}</div>
}

function mount(route = "/signin") {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <Providers queryClient={queryClient}>
      <MemoryRouter initialEntries={[route]}>
        <LocationProbe />
        <Routes>
          <Route path="/signin" element={<SignInPage />} />
          <Route path="*" element={<div>landed</div>} />
        </Routes>
      </MemoryRouter>
    </Providers>,
  )
}

async function fillAndSubmit(email: string, password: string) {
  const user = userEvent.setup()
  await user.type(await screen.findByLabelText("Email"), email)
  await user.type(screen.getByLabelText("Password"), password)
  await user.click(screen.getByRole("button", { name: "Sign in" }))
}

it("renders the brand mark, heading, labelled fields, inert Forgot and the sign-up link", async () => {
  asRole(null)
  mount()
  expect(await screen.findByRole("heading", { name: "Welcome back" })).toHaveClass("font-display")
  expect(screen.getByText("Sign in to your agency workspace")).toBeInTheDocument()
  expect(screen.getByAltText("Simbe")).toHaveAttribute("width", "40")
  expect(screen.getByLabelText("Email")).toHaveClass("rounded-input")
  expect(screen.getByLabelText("Password")).toHaveAttribute("type", "password")
  expect(screen.getByText("Forgot?")).toHaveAttribute("aria-disabled", "true")
  expect(screen.getByRole("button", { name: "Sign in" })).toHaveClass("w-full")
  expect(screen.getByRole("link", { name: "Create an account" })).toHaveAttribute("href", "/signup")
})

it("shows an inline alert for a wrong password and stays on the page", async () => {
  asRole(null)
  mount()
  await fillAndSubmit("nobody@harbor.test", "x")
  expect(await screen.findByRole("alert")).toHaveTextContent("Email or password is incorrect")
  expect(screen.getByTestId("location")).toHaveTextContent("/signin")
})

it("a double click posts once", async () => {
  asRole(null)
  let posts = 0
  mockApi({
    "POST /api/v1/session": async () => {
      posts += 1
      await new Promise((resolve) => setTimeout(resolve, 50))
      return Response.json({ code: "invalid_credentials", message: "nope" }, { status: 401 })
    },
  })
  mount()
  const user = userEvent.setup()
  await user.type(await screen.findByLabelText("Email"), "erin@harbor.test")
  await user.type(screen.getByLabelText("Password"), "x")
  const button = screen.getByRole("button", { name: "Sign in" })
  await user.dblClick(button)
  await screen.findByRole("alert")
  expect(posts).toBe(1)
})

it("after success goes to ?next", async () => {
  asRole(null)
  mount("/signin?next=%2Fpipeline")
  await fillAndSubmit("erin@harbor.test", "x")
  await screen.findByText("landed")
  expect(screen.getByTestId("location")).toHaveTextContent("/pipeline")
})

it("after success goes to the role home when there is no ?next", async () => {
  asRole(null)
  mount()
  await fillAndSubmit("dana@harbor.test", "x")
  await screen.findByText("landed")
  expect(screen.getByTestId("location")).toHaveTextContent("/next-actions")
})

it("ignores an off-site ?next", async () => {
  asRole(null)
  mount("/signin?next=%2F%2Fevil.test")
  await fillAndSubmit("erin@harbor.test", "x")
  await screen.findByText("landed")
  expect(screen.getByTestId("location")).toHaveTextContent(/^\/$/)
})

it("redirects an already-authenticated visit home", async () => {
  asRole("coordinator")
  mount()
  await waitFor(() => expect(screen.getByTestId("location")).toHaveTextContent("/next-actions"))
})

it("ignores a backslash ?next that browsers read as another origin", async () => {
  asRole(null)
  mount("/signin?next=%2F%5Cevil.test")
  await fillAndSubmit("erin@harbor.test", "x")
  await screen.findByText("landed")
  expect(screen.getByTestId("location")).toHaveTextContent(/^\/$/)
})
