import type { Config } from "tailwindcss"

// Tokens come from docs/design/brand.md (binding override of the handoff's brand values); semantic colors from handoff/design/README.md.
export default {
  content: ["app/javascript/**/*.{ts,tsx}", "app/views/**/*.erb"],
  theme: {
    screens: { md: "860px" },
    extend: {
      colors: {
        brand: { DEFAULT: "#FF1B5A", hover: "#E0124F", text: "#C8104A", tint: "#FAEEEE", border: "#FBC4D2" },
        app: "#FCFBFA",
        surface: "#FFFFFF",
        subtle: "#F4F3EF",
        dark: "#2E1A28",
        line: { DEFAULT: "#E2E8F0", subtle: "#F4F3EF", strong: "#CBD5E1" },
        ink: { DEFAULT: "#2E1A28", secondary: "#4B4550", muted: "#646464", faint: "#9CA3AF" },
        success: { DEFAULT: "#22A559", text: "#15803D", bg: "#F0FDF4", border: "#BBF7D0" },
        warning: { DEFAULT: "#F59E0B", text: "#B45309", bg: "#FFFBEB", border: "#FDE68A" },
        danger: { DEFAULT: "#E5484D", text: "#B91C1C", bg: "#FEF2F2", border: "#FECACA" },
        violet: { DEFAULT: "#8B5CF6", text: "#6D28D9", bg: "#F5F3FF", border: "#DDD6FE" },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        display: ["Outfit", "Inter", "system-ui", "sans-serif"],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "Consolas", "monospace"],
      },
      borderRadius: { input: "8px", tile: "10px", row: "16px", card: "20px", modal: "24px", panel: "24px", sheet: "24px 24px 0 0" },
      boxShadow: { modal: "0 20px 60px rgba(46,26,40,.18)", fab: "0 8px 24px rgba(255,27,90,.35)", card: "0 1px 2px rgba(46,26,40,.06)", toast: "0 8px 24px rgba(46,26,40,.25)" },
      backgroundImage: { "gradient-brand": "linear-gradient(135deg, #FFAD61 0%, #FF1B5A 100%)" },
    },
  },
} satisfies Config
