import { BarChart3 } from "lucide-react"
import { createElement, lazy, Suspense } from "react"
import type { FeatureModule } from "../../app/feature"

// Lazy: the registry spec loads every feature.ts through a Vite server with no `@` alias.
const ChannelsPage = lazy(() => import("./ChannelsPage").then((module) => ({ default: module.ChannelsPage })))
const ChannelPage = lazy(() => import("./ChannelPage").then((module) => ({ default: module.ChannelPage })))
const page = (Component: typeof ChannelsPage) => createElement(Suspense, { fallback: null }, createElement(Component))

export const feature: FeatureModule = {
  id: "channels",
  routes: [
    { path: "channels", element: page(ChannelsPage), handle: { roles: ["owner"], title: "Channels" } },
    { path: "channels/:channel", element: page(ChannelPage), handle: { roles: ["owner"], title: "Channel" } },
  ],
  nav: [
    {
      id: "channels",
      label: "Channels",
      icon: BarChart3,
      section: "insights",
      roles: ["owner"],
      order: 30,
      to: "/channels",
      mobile: { tab: { order: 3 } },
    },
  ],
}
