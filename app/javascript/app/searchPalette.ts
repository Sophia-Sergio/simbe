import { createContext, createElement, useCallback, useContext, useEffect, useMemo, useState } from "react"
import type { ReactNode } from "react"
import { useLeadPanel } from "./leadPanel"

export type SearchPalette = { isOpen: boolean; open: () => void; close: () => void }

const SearchPaletteContext = createContext<SearchPalette | null>(null)

/** Holds the palette's open state and the Cmd/Ctrl+K shortcut; the search lane renders the overlay. */
export function SearchPaletteProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false)
  const { close: closeLeadPanel } = useLeadPanel()

  // Two overlays never show at once: opening search closes the lead panel.
  const open = useCallback(() => {
    closeLeadPanel()
    setIsOpen(true)
  }, [closeLeadPanel])
  const close = useCallback(() => setIsOpen(false), [])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== "k" || !(event.metaKey || event.ctrlKey)) return
      event.preventDefault()
      if (isOpen) close()
      else open()
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [isOpen, open, close])

  const value = useMemo(() => ({ isOpen, open, close }), [isOpen, open, close])
  return createElement(SearchPaletteContext.Provider, { value }, children)
}

export function useSearchPalette(): SearchPalette {
  const palette = useContext(SearchPaletteContext)
  if (!palette) throw new Error("useSearchPalette must be used within <SearchPaletteProvider>")
  return palette
}
