import { CheckSquare } from "lucide-react"
import type { FeatureModule } from "@/app/feature"
import { useNextActionsBadge } from "./useNavBadge"

export const feature: FeatureModule = {
  id: "next-actions",
  nav: [
    {
      id: "next-actions",
      label: "Next actions",
      icon: CheckSquare,
      section: "today",
      roles: ["coordinator"],
      order: 10,
      to: "/next-actions",
      useBadge: useNextActionsBadge,
      mobile: { tab: { order: 1 } },
    },
  ],
}
