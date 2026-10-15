import { Search } from "lucide-react"
import { useState } from "react"
import type { User } from "@/api/types"
import { useCurrentSnapshot } from "@/api/hooks/snapshots"
import { useSearchPalette } from "@/app/searchPalette"
import { Avatar } from "@/components/ui/Avatar"
import { BrandMark } from "@/components/ui/BrandMark"
import { UserSheet } from "./UserSheet"

/** Sticky 52px bar: mark + screen title, search, account. A pending data load draws a progress line on its bottom edge. */
export function TopBar({ title, user, onSignOut }: { title: string; user: User; onSignOut: () => void }) {
  const { open } = useSearchPalette()
  const { data } = useCurrentSnapshot()
  const [userOpen, setUserOpen] = useState(false)
  const pending = data?.pending ?? null
  const pct = pending?.progress?.pct

  return (
    <header className="sticky top-0 z-20 flex h-[52px] shrink-0 items-center gap-2 border-b border-line bg-surface px-3.5">
      <BrandMark size={26} />
      <div className="min-w-0 flex-1">
        {title && (
          <h1 title={title} className="truncate font-display text-[17px] font-semibold leading-tight text-ink">
            {title}
          </h1>
        )}
        {pending && <p className="-mt-0.5 truncate text-[11px] text-brand-text">Loading data…</p>}
      </div>
      <button
        type="button"
        aria-label="Search candidates"
        onClick={open}
        className="inline-flex h-11 w-11 items-center justify-center rounded-full text-ink-secondary hover:bg-subtle"
      >
        <Search aria-hidden className="h-5 w-5" />
      </button>
      <button
        type="button"
        aria-label="Account"
        onClick={() => setUserOpen(true)}
        className="inline-flex h-11 w-11 items-center justify-center rounded-full"
      >
        <Avatar name={user.name} size={30} />
      </button>
      {pending && (
        <div
          role="progressbar"
          aria-label="Loading data"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={typeof pct === "number" ? Math.round(pct) : undefined}
          className="absolute inset-x-0 bottom-0 h-0.5 overflow-hidden bg-transparent"
        >
          <div
            className={`h-full bg-brand ${typeof pct === "number" ? "" : "w-1/3 animate-pulse"}`}
            style={typeof pct === "number" ? { width: `${Math.min(100, Math.max(0, pct))}%` } : undefined}
          />
        </div>
      )}
      <UserSheet user={user} open={userOpen} onClose={() => setUserOpen(false)} onSignOut={onSignOut} />
    </header>
  )
}
