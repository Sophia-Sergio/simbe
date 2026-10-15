import { useRef, useState } from "react"
import type { User } from "@/api/types"
import { Avatar } from "@/components/ui/Avatar"
import { useDismiss } from "@/hooks/useDismiss"

/** Avatar button with a small popover: who is signed in, and Sign out. */
export function UserMenu({ user, onSignOut }: { user: User; onSignOut: () => void }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useDismiss({ ref, onDismiss: () => setOpen(false), enabled: open })

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-label="Account menu"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="rounded-full"
      >
        <Avatar name={user.name} size={30} />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-10 z-30 w-60 rounded-card border border-line bg-surface p-3 shadow-modal">
          <p title={user.name} className="truncate text-[13px] font-semibold text-ink">
            {user.name}
          </p>
          <p title={user.email} className="truncate text-[12px] text-ink-muted">
            {user.email}
          </p>
          <p className="mt-0.5 text-[12px] capitalize text-ink-muted">{user.role}</p>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false)
              onSignOut()
            }}
            className="mt-3 flex h-9 w-full items-center justify-center rounded-full border border-line text-[14px] font-semibold text-ink hover:bg-subtle"
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  )
}
