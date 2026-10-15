import { useMediaQuery } from "./useMediaQuery"

/** `md` breakpoint (860px): true on desktop and during SSR/test default. */
export function useIsDesktop(): boolean {
  return useMediaQuery("(min-width: 860px)")
}
