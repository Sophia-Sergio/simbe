import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { renderHook } from "@testing-library/react"
import type { ReactNode } from "react"
import { ToastProvider } from "@/components/ui/Toast"

/** A QueryClient with retries off so mutation/query errors surface on the first attempt. */
export function createQueryClient(): QueryClient {
  return new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
}

function Wrapper({ client, children }: { client: QueryClient; children: ReactNode }) {
  return (
    <QueryClientProvider client={client}>
      <ToastProvider>{children}</ToastProvider>
    </QueryClientProvider>
  )
}

/** `renderHook` with the providers the hooks need: TanStack Query (retry off) and the toast region. */
export function renderHookWithQuery<Props, Result>(
  hook: (props: Props) => Result,
  options: { initialProps?: Props; client?: QueryClient } = {},
) {
  const client = options.client ?? createQueryClient()
  const rendered = renderHook(hook, {
    wrapper: ({ children }) => <Wrapper client={client}>{children}</Wrapper>,
    initialProps: options.initialProps as Props,
  })
  return { ...rendered, client }
}
