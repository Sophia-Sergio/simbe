// jsdom has no matchMedia and no real layout, so component tests stub the viewport.
const ORIGINAL_MATCH_MEDIA = window.matchMedia

export function setViewport(width: number): void {
  window.matchMedia = ((query: string) => ({
    matches: /min-width:\s*860px/.test(query) ? width >= 860 : false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => true,
  })) as unknown as typeof window.matchMedia
  Object.defineProperty(window, "innerWidth", { writable: true, configurable: true, value: width })
  window.dispatchEvent(new Event("resize"))
}

/** Restores the jsdom default so a mobile test cannot leak into the next test. */
export function restoreMatchMedia(): void {
  Object.defineProperty(window, "matchMedia", { writable: true, configurable: true, value: ORIGINAL_MATCH_MEDIA })
}
