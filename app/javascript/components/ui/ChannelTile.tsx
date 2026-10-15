// Channel logo tiles. The hex values below are the handoff's placeholder
// channel colours (docs/design/brand.md keeps them); replace with official marks.
export const CHANNEL_COLORS: Record<string, string> = {
  Facebook: "#1877f2",
  Instagram: "#d62976",
  Google: "#ea4335",
  TikTok: "#111111",
  Referral: "#22a559",
  Unknown: "#a8a29e",
}

const UNKNOWN = CHANNEL_COLORS.Unknown

/** Known channel colour, or the Unknown grey for anything else. */
export function channelColor(channel: string): string {
  return CHANNEL_COLORS[channel] ?? UNKNOWN
}

const SIZES: Record<28 | 36, string> = {
  28: "h-7 w-7 text-[12px]",
  36: "h-9 w-9 text-[14px]",
}

/** Square channel tile with the channel's initial and placeholder colour. */
export function ChannelTile({ channel, size = 28 }: { channel: string; size?: 28 | 36 }) {
  return (
    <span
      title={channel}
      className={`inline-flex shrink-0 items-center justify-center rounded-tile font-semibold text-white ${SIZES[size]}`}
      style={{ backgroundColor: channelColor(channel) }}
    >
      {channel.charAt(0).toUpperCase()}
    </span>
  )
}
