import { ChannelTile } from "@/components/ui/ChannelTile"
import { Pill } from "@/components/ui/Pill"

const PLATFORMS: { name: string; tile: string }[] = [
  { name: "Meta Ads", tile: "Meta" },
  { name: "Google Ads", tile: "Google" },
]

/** One ad-platform row: 38px logo tile, name and a "Coming soon" pill. Display only — nothing to click. */
function PlatformRow({ name, tile }: { name: string; tile: string }) {
  return (
    <div className="flex items-center gap-3 rounded-card border border-line bg-surface p-3">
      <ChannelTile channel={tile} size={38} />
      <div className="min-w-0 flex-1">
        <p className="text-[14px] font-semibold text-ink">{name}</p>
        <p className="text-[12px] text-ink-muted">Sample spend — live sync coming</p>
      </div>
      <Pill>Coming soon</Pill>
    </div>
  )
}

/**
 * Step 3: shows where Meta/Google will connect. A preview only — there is no connect action, request
 * or stored state; spend stays "sample" until a real sync exists.
 */
export function AdAccountsStep() {
  return (
    <div className="flex flex-col gap-3">
      {PLATFORMS.map((platform) => (
        <PlatformRow key={platform.name} {...platform} />
      ))}
      <p className="text-[12px] text-ink-muted">Ad-account connections are on the way — nothing to do here yet. Continue to the next step.</p>
    </div>
  )
}
