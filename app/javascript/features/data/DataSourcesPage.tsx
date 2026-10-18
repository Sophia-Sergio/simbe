import { useEffect, useRef, useState } from "react"
import { Check, Upload } from "lucide-react"
import { useCurrentSnapshot } from "@/api/hooks/snapshots"
import { useAdConnections, useConnectPlatform, useDisconnectPlatform } from "@/api/hooks/account"
import type { AdConnection, AdPlatform, Snapshot } from "@/api/types"
import { useAuth } from "@/app/auth/useAuth"
import { UploadProgress } from "@/components/shared/UploadProgress"
import type { UploadProgressValue } from "@/components/shared/UploadProgress"
import { Button } from "@/components/ui/Button"
import { ChannelTile } from "@/components/ui/ChannelTile"
import { ConfirmInline } from "@/components/ui/ConfirmInline"
import { EmptyState } from "@/components/ui/EmptyState"
import { ErrorState } from "@/components/ui/ErrorState"
import { Skeleton } from "@/components/ui/Skeleton"
import { useAsyncAction } from "@/hooks/useAsyncAction"
import { formatInt } from "@/lib/format"
import { loadedLabel } from "./lib"
import { UploadModal } from "./UploadModal"

const PLATFORMS: { platform: AdPlatform; label: string; tile: string }[] = [
  { platform: "meta", label: "Meta Ads", tile: "Meta" },
  { platform: "google", label: "Google Ads", tile: "Google" },
]

const SAMPLE_NOTE = "Sample spend — live sync coming"

/** Connect / Connected (green pill-button) with an inline disconnect confirmation. */
function ConnectorCard({ platform, label, tile, connection }: { platform: AdPlatform; label: string; tile: string; connection: AdConnection | null }) {
  const connect = useConnectPlatform()
  const disconnect = useDisconnectPlatform()
  const [confirming, setConfirming] = useState(false)
  const cardRef = useRef<HTMLDivElement>(null)
  const confirmRef = useRef<HTMLDivElement>(null)
  // Focus returns to the card's button once the confirmation closes (Connected on cancel, Connect after a disconnect).
  const returnFocus = useRef(false)

  useEffect(() => {
    if (confirming) {
      confirmRef.current?.querySelectorAll("button")[1]?.focus()
    } else if (returnFocus.current) {
      returnFocus.current = false
      cardRef.current?.querySelector("button")?.focus()
    }
  }, [confirming])

  const closeConfirm = () => {
    returnFocus.current = true
    setConfirming(false)
  }

  const connectAction = useAsyncAction(async () => {
    try {
      await connect.mutateAsync(platform)
    } catch {
      // Surfaced by the mutation state below; the button stays on Connect.
    }
  })
  const disconnectAction = useAsyncAction(async () => {
    try {
      await disconnect.mutateAsync(platform)
    } catch {
      // Keep the confirmation open so the user can retry; the error shows in the card.
      return
    }
    closeConfirm()
  })

  const connected = connection?.status === "connected"

  return (
    <div ref={cardRef} className="flex flex-col gap-3 rounded-card border border-line bg-surface p-4">
      <div className="flex items-center gap-3">
        <ChannelTile channel={tile} size={38} />
        <div className="min-w-0 flex-1">
          <p className="font-display text-[15px] font-semibold text-ink">{label}</p>
          <p className="text-[12px] text-ink-muted">{SAMPLE_NOTE}</p>
        </div>
        {connected ? (
          <Button
            variant="secondary"
            size="sm"
            className="border-success-border bg-success-bg text-success-text hover:bg-success-bg"
            leftIcon={<Check aria-hidden className="h-3.5 w-3.5" />}
            aria-expanded={confirming}
            aria-label={`Connected to ${label} — click to disconnect`}
            onClick={() => setConfirming(true)}
          >
            Connected
          </Button>
        ) : (
          <Button size="sm" pending={connectAction.pending} onClick={() => void connectAction.run()}>
            Connect
          </Button>
        )}
      </div>
      {connect.isError || disconnect.isError ? (
        <p role="alert" className="text-[12px] text-danger-text">
          We couldn't update this connection. Try again.
        </p>
      ) : null}
      {confirming ? (
        <div ref={confirmRef}>
          <ConfirmInline
            message={`Disconnect ${label}?`}
            confirmLabel="Disconnect"
            pending={disconnectAction.pending}
            onConfirm={() => void disconnectAction.run()}
            onCancel={closeConfirm}
          />
        </div>
      ) : null}
    </div>
  )
}

/** The pending load strip: "Loading your data… 46%" over the phase bar. */
function LoadingStrip({ status, progress }: { status: string; progress: UploadProgressValue | null }) {
  const pct = progress?.pct
  const shown = typeof pct === "number" && Number.isFinite(pct) ? ` ${Math.min(100, Math.max(0, Math.round(pct)))}%` : ""
  return (
    <div className="mt-3 flex flex-col gap-2 rounded-row border border-brand-border bg-brand-tint px-3 py-3">
      <p role="status" className="text-[13px] font-medium text-ink">{`Loading your data…${shown}`}</p>
      <UploadProgress status={status} progress={progress} />
    </div>
  )
}

/** "CRM exports": the loaded snapshot's seven rows, dimmed while a replacement loads. */
function CrmExportsCard({
  snapshot,
  files,
  pending,
  timezone,
  onUpload,
}: {
  snapshot: Snapshot | null
  files: { name: string; rows: number }[]
  pending: { status: string; progress: UploadProgressValue | null } | null
  timezone: string
  onUpload: () => void
}) {
  const loaded = loadedLabel(snapshot?.loaded_at, timezone)

  return (
    <section aria-labelledby="crm-exports-heading" data-testid="crm-exports" className="rounded-card border border-line bg-surface p-5">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="crm-exports-heading" className="font-display text-[16px] font-semibold text-ink">
          CRM exports
        </h2>
        {loaded && !pending ? <p className="text-[12px] text-ink-muted">{`Loaded ${loaded}`}</p> : null}
      </div>

      {pending ? <LoadingStrip status={pending.status} progress={pending.progress} /> : null}

      {snapshot ? (
        <ul className={`mt-3 ${pending ? "opacity-70" : ""}`} aria-hidden={pending ? true : undefined}>
          {files.map((file) => (
            <li key={file.name} className="flex items-center gap-3 border-b border-line-subtle py-2.5 last:border-b-0">
              <span aria-hidden className="h-2 w-2 shrink-0 rounded-full bg-success" />
              <span className="min-w-0 flex-1 truncate text-[13px] text-ink" title={file.name}>
                {file.name}
              </span>
              <span className="shrink-0 text-[12px] text-ink">{`${formatInt(file.rows)} rows`}</span>
            </li>
          ))}
        </ul>
      ) : !pending ? (
        <EmptyState
          className="mt-3"
          title="No data loaded yet"
          body="Upload your seven CSV exports to see your funnel, channels and pipeline."
          action={<Button onClick={onUpload}>Upload new snapshot</Button>}
        />
      ) : null}
    </section>
  )
}

/**
 * Owner-only Data sources screen (handoff §10, spec decisions 4–6): connector cards, the CRM exports
 * card and the asynchronous upload modal. While `snapshots/current.pending` is set the card shows the
 * current snapshot dimmed under a "Loading your data…" strip; with no snapshot at all it is empty.
 */
export function DataSourcesPage() {
  const { agency } = useAuth()
  const snapshot = useCurrentSnapshot()
  const connections = useAdConnections()
  const [uploadOpen, setUploadOpen] = useState(false)

  const timezone = agency?.timezone ?? "UTC"
  const agencyName = agency?.name ?? "your agency"

  const header = (
    <header className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
      <div>
        <h1 className="font-display text-[24px] font-semibold tracking-[-0.02em] text-ink">Data sources</h1>
        <p className="mt-0.5 text-[13px] text-ink-muted">{`What Simbe reads for ${agencyName}`}</p>
      </div>
      <Button className="w-full md:w-auto" leftIcon={<Upload aria-hidden className="h-4 w-4" />} onClick={() => setUploadOpen(true)}>
        Upload new snapshot
      </Button>
    </header>
  )

  const pending = snapshot.data?.pending ?? null
  const current = snapshot.data?.snapshot ?? null
  const files = snapshot.data?.files ?? []
  const byPlatform = new Map((connections.data?.connections ?? []).map((connection) => [connection.platform, connection]))

  // Each card fails on its own: a broken connections call must not hide the CRM exports or the upload path.
  // A query that already has data keeps rendering it when a later poll fails (`refetchInterval` refetches
  // every 2 s while a load is pending): only a first load with no data at all shows the error card, so an
  // in-flight upload is never dropped mid-validate/commit by a transient failure.
  const connectors =
    connections.data !== undefined ? (
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {PLATFORMS.map((config) => (
          <ConnectorCard key={config.platform} {...config} connection={byPlatform.get(config.platform) ?? null} />
        ))}
      </div>
    ) : connections.isError ? (
      <ErrorState message="We couldn't load your ad connections." onRetry={() => void connections.refetch()} />
    ) : (
      <Skeleton className="h-[104px]" />
    )

  const crm =
    snapshot.data !== undefined ? (
      <CrmExportsCard snapshot={current} files={files} pending={pending} timezone={timezone} onUpload={() => setUploadOpen(true)} />
    ) : snapshot.isError ? (
      <ErrorState message="We couldn't load your data." onRetry={() => void snapshot.refetch()} />
    ) : (
      <Skeleton className="h-[280px]" />
    )

  return (
    <div className="flex flex-col gap-5" aria-busy={snapshot.isPending || connections.isPending}>
      {header}
      {connectors}
      {crm}
      {/* Mounted outside every loading/error branch: the header button must always work. */}
      <UploadModal open={uploadOpen} onClose={() => setUploadOpen(false)} agencyName={agencyName} />
    </div>
  )
}
