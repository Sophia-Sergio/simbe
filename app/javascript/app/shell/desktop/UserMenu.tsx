import { useRef, useState } from "react"
import type { User } from "@/api/types"
import { Avatar } from "@/components/ui/Avatar"
import { useDismiss } from "@/hooks/useDismiss"

/** Avatar button that discloses a small panel: who is signed in, and Sign out. Focus returns to the button on close. */
export function UserMenu({ user, onSignOut }: { user: User; onSignOut: () => void }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const close = () => {
    setOpen(false)
    trigger.current?.focus()
  }
  useDismiss({ ref, onDismiss: close, enabled: open })

  return (
    <div ref={ref} className="relative">
      <button
        ref={trigger}
        type="button"
        aria-label="Account menu"
        aria-expanded={open}
        onClick={() => (open ? close() : setOpen(true))}
        className="rounded-full"
      >
        <Avatar name={user.name} size={30} />
      </button>
      {open && (
        <div className="absolute right-0 top-10 z-30 w-60 rounded-card border border-line bg-surface p-3 shadow-modal">
          <p title={user.name} className="truncate text-[13px] font-semibold text-ink">
            {user.name}
          </p>
          <p title={user.email} className="truncate text-[12px] text-ink-muted">
            {user.email}
          </p>
          <p className="mt-0.5 text-[12px] capitalize text-ink-muted">{user.role}</p>
          <button
            type="button"
            onClick={() => {
              close()
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
