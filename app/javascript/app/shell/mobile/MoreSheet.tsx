import { ChevronRight } from "lucide-react"
import { Link } from "react-router-dom"
import { Modal } from "@/components/ui/Modal"
import type { NavItem } from "../../feature"

/** Bottom sheet (the kit Modal draws the drag handle) listing the `mobile.more` rows; picking one navigates and closes. */
export function MoreSheet({ items, open, onClose }: { items: NavItem[]; open: boolean; onClose: () => void }) {
  return (
    <Modal open={open} onClose={onClose} title="More">
      <ul className="-mx-2 flex flex-col">
        {items.map((item) => {
          const Icon = item.icon
          return (
            <li key={item.id}>
              <Link to={item.to ?? "/"} onClick={onClose} className="flex h-12 items-center gap-3 rounded-input px-2 text-[15px] font-medium text-ink hover:bg-subtle">
                <Icon aria-hidden className="h-5 w-5 text-ink-muted" />
                <span className="flex-1">{item.label}</span>
                <ChevronRight aria-hidden className="h-4 w-4 text-ink-faint" />
              </Link>
            </li>
          )
        })}
      </ul>
    </Modal>
  )
}
