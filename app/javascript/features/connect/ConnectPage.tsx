import { Copy } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { ApiError } from "@/api/client"
import { useMcpSettings, useRotateMcpKey } from "@/api/hooks/mcp"
import { Button } from "@/components/ui/Button"
import { ConfirmInline } from "@/components/ui/ConfirmInline"
import { ErrorState } from "@/components/ui/ErrorState"
import { Skeleton } from "@/components/ui/Skeleton"
import { useToast } from "@/components/ui/Toast"
import { useAsyncAction } from "@/hooks/useAsyncAction"

const TOOLS: { name: string; description: string }[] = [
  { name: "get_funnel", description: "Funnel stages, drop-offs and the qualified rate for a date range." },
  { name: "get_channel_performance", description: "Leads, qualified leads and cost per qualified by channel and campaign." },
  { name: "get_dropoff_reasons", description: "Why leads leave: exit reasons and where applicants stop in the form." },
  { name: "get_next_actions", description: "The coordinators' open follow-ups, by queue." },
  { name: "forecast_spend", description: "What a different ad budget is likely to produce." },
]

function configJson(url: string, key: string): string {
  return JSON.stringify({ mcpServers: { simbe: { url, headers: { Authorization: `Bearer ${key}` } } } }, null, 2)
}

function CopyField({ label, value, mono = true, copyable = true }: { label: string; value: string; mono?: boolean; copyable?: boolean }) {
  const toast = useToast()
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value)
      toast.show("Copied", { tone: "success" })
    } catch {
      toast.show("Could not copy: select the text and copy it manually")
    }
  }
  const id = `field-${label.toLowerCase().replace(/\s+/g, "-")}`
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-[13px] font-medium text-ink-secondary">
        {label}
      </label>
      <div className="flex gap-2">
        <input
          id={id}
          readOnly
          value={value}
          className={`h-10 min-w-0 flex-1 rounded-input border border-line bg-subtle px-3 text-[13px] text-ink ${mono ? "font-mono" : ""}`}
        />
        <Button variant="secondary" size="sm" className="h-10" leftIcon={<Copy aria-hidden className="h-3.5 w-3.5" />} onClick={copy} disabled={!copyable} aria-label={`Copy ${label}`}>
          Copy
        </Button>
      </div>
    </div>
  )
}

export function ConnectPage() {
  const settings = useMcpSettings()
  const rotate = useRotateMcpKey()
  const toast = useToast()
  const [confirming, setConfirming] = useState(false)
  // The full key lives in this component only: leaving the page discards it, nothing is stored client-side.
  const [fullKey, setFullKey] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const confirmRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLDivElement>(null)
  // Where focus goes when the inline confirmation closes: back to the trigger on cancel, to the key field on success.
  const focusAfterClose = useRef<"trigger" | "key" | null>(null)

  useEffect(() => {
    if (confirming) {
      confirmRef.current?.querySelectorAll("button")[1]?.focus()
    } else if (focusAfterClose.current) {
      if (focusAfterClose.current === "trigger") triggerRef.current?.querySelector("button")?.focus()
      else document.getElementById("field-api-key")?.focus()
      focusAfterClose.current = null
    }
  }, [confirming])

  const generate = useAsyncAction(async () => {
    setError(null)
    try {
      const rotated = await rotate.mutateAsync()
      setFullKey(rotated.key)
      rotate.reset() // the mutation cache would otherwise keep the full key for minutes
      focusAfterClose.current = "key"
      setConfirming(false)
      void settings.refetch()
    } catch (caught) {
      setConfirming(false)
      setError(caught instanceof ApiError && caught.status === 409 ? "A key is already being generated." : "We could not generate a key. Try again.")
    }
  })

  const header = (
    <header>
      <h1 className="hidden font-display text-[24px] font-semibold tracking-[-0.02em] text-ink md:block">Connect Claude</h1>
      <p className="mt-0.5 text-[14px] text-ink-muted">Let Claude read your funnel, channels and next actions.</p>
    </header>
  )

  if (settings.isPending) {
    return (
      <div className="flex flex-col gap-5">
        {header}
        <Skeleton className="h-[320px]" />
      </div>
    )
  }
  if (settings.isError) {
    return (
      <div className="flex flex-col gap-5">
        {header}
        <ErrorState message="We could not load your connection settings." onRetry={() => void settings.refetch()} />
      </div>
    )
  }

  const { url, key_prefix: prefix } = settings.data
  const shownKey = fullKey ?? (prefix ? `${prefix}•••••••••••` : "No key yet — generate one")
  const configKey = fullKey ?? "YOUR_KEY"

  return (
    <div className="flex flex-col gap-5">
      {header}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <section aria-labelledby="connection-heading" className="flex min-w-0 flex-col gap-4 rounded-card border border-line bg-surface p-5">
          <h2 id="connection-heading" className="font-display text-[16px] font-semibold text-ink">
            Connection
          </h2>
          <CopyField label="Server URL" value={url} />
          <CopyField label="API key" value={shownKey} copyable={fullKey !== null} />

          {/* The live region exists before the key does, so screen readers announce the text when it is filled in. */}
          <div role="status">
            {fullKey && (
              <p className="rounded-input border border-warning-border bg-warning-bg p-3 text-[13px] font-medium text-ink">
                This key is shown only once. Copy it now: after you leave this page only its beginning is visible.
              </p>
            )}
          </div>
          {error && (
            <p role="alert" className="text-[13px] font-medium text-danger-text">
              {error}
            </p>
          )}
          {confirming ? (
            <div ref={confirmRef}>
              <ConfirmInline
                message="This revokes the current key immediately."
                confirmLabel="Generate new key"
                pending={generate.pending}
                onCancel={() => {
                  focusAfterClose.current = "trigger"
                  setConfirming(false)
                }}
                onConfirm={() => void generate.run()}
              />
            </div>
          ) : (
            <div ref={triggerRef}>
              <Button variant="outline-brand" size="sm" onClick={() => setConfirming(true)}>
                Generate new key
              </Button>
            </div>
          )}

          <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between">
              <span className="text-[13px] font-medium text-ink-secondary">Claude configuration</span>
              <Button
                variant="ghost"
                size="sm"
                className="h-9"
                aria-label="Copy configuration"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(configJson(url, configKey))
                    toast.show("Copied", { tone: "success" })
                  } catch {
                    toast.show("Could not copy: select the text and copy it manually")
                  }
                }}
              >
                Copy
              </Button>
            </div>
            <pre aria-label="Claude configuration" tabIndex={0} className="max-w-full overflow-x-auto rounded-[10px] bg-dark p-4 font-mono text-[12px] leading-relaxed text-white">
              {configJson(url, configKey)}
            </pre>
          </div>
        </section>

        <section aria-labelledby="tools-heading" className="rounded-card border border-line bg-surface p-5">
          <h2 id="tools-heading" className="mb-3 font-display text-[16px] font-semibold text-ink">
            Tools Claude can use
          </h2>
          <ul className="flex flex-col gap-3">
            {TOOLS.map((tool) => (
              <li key={tool.name}>
                <p className="font-mono text-[13px] font-semibold text-brand-text">{tool.name}</p>
                <p className="text-[13px] text-ink-secondary">{tool.description}</p>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  )
}
