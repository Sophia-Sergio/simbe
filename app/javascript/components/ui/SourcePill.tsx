import { Pill } from "./Pill"
import { channelColor } from "./ChannelTile"

/** Compact channel badge: a colour dot (from ChannelTile's map) plus the name. */
export function SourcePill({ channel }: { channel: string }) {
  return (
    <Pill tone="neutral" className="min-w-0 max-w-full">
      <span
        data-testid="source-dot"
        className="h-1.5 w-1.5 shrink-0 rounded-full"
        style={{ backgroundColor: channelColor(channel) }}
      />
      <span className="min-w-0 truncate">{channel}</span>
    </Pill>
  )
}
