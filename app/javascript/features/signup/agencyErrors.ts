export type AgencyFieldErrors = { name?: string; timezone?: string; milestone?: string }

const TIMEZONE_ERROR = "Pick a supported time zone"
const MILESTONE_ERROR = "Pick a definition of qualified"

/**
 * `POST /signup` answers `invalid_agency` with one message. A message about the time zone or the definition of
 * qualified belongs under that input (a combined one is split); any other problem stays under the agency name.
 */
export function agencyFieldErrors(message: string | null): AgencyFieldErrors {
  if (!message) return {}
  const timezone = /time zone/i.test(message)
  const milestone = /definition of qualified/i.test(message)
  if (!timezone && !milestone) return { name: message }
  return { ...(timezone ? { timezone: TIMEZONE_ERROR } : {}), ...(milestone ? { milestone: MILESTONE_ERROR } : {}) }
}
