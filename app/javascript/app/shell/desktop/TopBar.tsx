import { Search } from "lucide-react"
import type { ReactNode } from "react"
import type { User } from "@/api/types"
import { useSearchPalette } from "@/app/searchPalette"
import { SnapshotPill } from "./SnapshotPill"
import { UserMenu } from "./UserMenu"

/** 56px sticky bar: centered search trigger, then the lanes' items, the snapshot pill and the user menu. */
export function TopBar({ user, topBarRight, onSignOut }: { user: User; topBarRight: ReactNode; onSignOut: () => void }) {
  const { open } = useSearchPalette()
  return (
    <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-3 border-b border-line bg-surface px-6">
      <div className="flex flex-1 justify-center">
        <button
          type="button"
          onClick={open}
          className="flex h-9 w-full max-w-[360px] items-center gap-2 rounded-input border border-line bg-surface px-3 text-left text-[14px] text-ink-muted hover:border-line-strong"
        >
          <Search aria-hidden className="h-4 w-4 shrink-0" />
          <span className="flex-1 truncate">Search candidates…</span>
          <kbd className="rounded-input border border-line px-1.5 text-[11px] font-medium text-ink-muted">⌘K</kbd>
        </button>
      </div>
      <div className="flex shrink-0 items-center gap-3">
        {topBarRight}
        <SnapshotPill />
        <UserMenu user={user} onSignOut={onSignOut} />
      </div>
    </header>
  )
}
