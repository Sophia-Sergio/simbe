import type { User } from "@/api/types"
import { Avatar } from "@/components/ui/Avatar"
import { Button } from "@/components/ui/Button"
import { Modal } from "@/components/ui/Modal"

/** Account bottom sheet: who is signed in, and Sign out. */
export function UserSheet({ user, open, onClose, onSignOut }: { user: User; open: boolean; onClose: () => void; onSignOut: () => void }) {
  return (
    <Modal open={open} onClose={onClose} title="Account">
      <div className="flex items-center gap-3">
        <Avatar name={user.name} size={44} />
        <div className="min-w-0">
          <p title={user.name} className="truncate text-[15px] font-semibold text-ink">
            {user.name}
          </p>
          <p title={user.email} className="truncate text-[13px] text-ink-muted">
            {user.email}
          </p>
          <p className="text-[12px] capitalize text-ink-muted">{user.role}</p>
        </div>
      </div>
      <Button
        variant="secondary"
        className="mt-5 w-full"
        onClick={() => {
          onClose()
          onSignOut()
        }}
      >
        Sign out
      </Button>
    </Modal>
  )
}
