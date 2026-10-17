import { Check } from "lucide-react"
import { useAdConnections, useConnectPlatform } from "@/api/hooks/account"
import type { AdPlatform } from "@/api/types"
import { Button } from "@/components/ui/Button"
import { ChannelTile } from "@/components/ui/ChannelTile"
import { useAsyncAction } from "@/hooks/useAsyncAction"

const PLATFORMS: { platform: AdPlatform; name: string; tile: string }[] = [
  { platform: "meta", name: "Meta Ads", tile: "Meta" },
  { platform: "google", name: "Google Ads", tile: "Google" },
]

/** One ad-platform row: 38px logo tile, name, the honest "sample spend" note and a single-flight Connect. */
function PlatformRow({ platform, name, tile }: { platform: AdPlatform; name: string; tile: string }) {
  const connections = useAdConnections()
  const connect = useConnectPlatform()
  const action = useAsyncAction(() => connect.mutateAsync(platform))
  const connected = (connections.data?.connections ?? []).some((connection) => connection.platform === platform)

  return (
    <div className="flex items-center gap-3 rounded-card border border-line bg-surface p-3">
      <ChannelTile channel={tile} size={38} />
      <div className="min-w-0 flex-1">
        <p className="text-[14px] font-semibold text-ink">{name}</p>
        <p className="text-[12px] text-ink-muted">Sample spend — live sync coming</p>
      </div>
      {connected ? (
        <button
          type="button"
          disabled
          className="inline-flex h-9 items-center gap-1.5 whitespace-nowrap rounded-full border border-success-border bg-success-bg px-4 text-[14px] font-semibold text-success-text"
        >
          <Check aria-hidden className="h-4 w-4" />
          Connected
        </button>
      ) : (
        <Button pending={action.pending} onClick={() => void action.run()}>
          Connect
        </Button>
      )}
    </div>
  )
}

/** Step 3: connect Meta/Google (a stub — spend stays "sample" until a real sync exists). Optional. */
export function AdAccountsStep() {
  return (
    <div className="flex flex-col gap-3">
      {PLATFORMS.map((platform) => (
        <PlatformRow key={platform.platform} {...platform} />
      ))}
      <p className="text-[12px] text-ink-muted">This step is optional — you can connect these later in Settings.</p>
    </div>
  )
}
