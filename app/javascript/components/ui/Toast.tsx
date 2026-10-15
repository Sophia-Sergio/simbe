import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react"
import type { ReactNode } from "react"
import { Check } from "lucide-react"

export type ToastTone = "success"
export type ToastState = { id: number; message: string; tone?: ToastTone }

type ToastContextValue = { show: (message: string, opts?: { tone?: ToastTone }) => void }

const ToastContext = createContext<ToastContextValue | null>(null)

export const TOAST_DURATION = 2600

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext)
  if (!context) throw new Error("useToast must be used within <ToastProvider>")
  return context
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ToastState | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const counter = useRef(0)

  const show = useCallback((message: string, opts?: { tone?: ToastTone }) => {
    if (timer.current) clearTimeout(timer.current)
    counter.current += 1
    setToast({ id: counter.current, message, tone: opts?.tone })
    // Replacing the current toast always restarts the timer.
    timer.current = setTimeout(() => setToast(null), TOAST_DURATION)
  }, [])

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current)
    },
    [],
  )

  const value = useMemo(() => ({ show }), [show])

  return (
    <ToastContext.Provider value={value}>
      {children}
      <Toast toast={toast} />
    </ToastContext.Provider>
  )
}

export function Toast({ toast }: { toast: ToastState | null }) {
  if (!toast) return null
  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="toast"
      className="fixed bottom-[84px] left-1/2 z-50 flex max-w-[calc(100vw-32px)] -translate-x-1/2 items-center gap-2 rounded-full bg-dark px-4 py-2.5 text-[14px] font-medium text-white shadow-toast md:bottom-[28px]"
    >
      <Check aria-hidden className="h-4 w-4 shrink-0 text-success" />
      <span>{toast.message}</span>
    </div>
  )
}
