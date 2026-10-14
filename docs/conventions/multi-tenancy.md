# Multi-tenancy (agency isolation)

Two agencies must never see each other's data. The CSV exports carry no agency id, so **we tag every row ourselves**.

1. `Current.agency` is set once per request from the signed-in user (`user.agency`), never from a request parameter or URL.
2. Every tenant model includes `AgencyScoped` (`default_scope { where(agency_id: Current.agency.id) }` + `before_validation` that assigns `agency_id`, and raises `Agency::MissingContext` when `Current.agency` is nil). `unscoped` is forbidden outside `app/services/snapshot/` and specs (boundary check).
3. Controllers inherit `Api::BaseController` which authenticates, sets `Current.agency`, and renders 404 (not 403) for other agencies' ids.
4. Raw SQL (metrics) always receives `agency_id` as a bind parameter. A shared `Metrics::Base` enforces it.
5. The MCP key and the AI agent are bound to one agency; tools take no agency argument.
6. **Isolation spec** (`spec/isolation/`): create two agencies with data, sign in as agency A, and request every API route with agency B's ids; every response must be 404/empty. New routes are added to this spec in the same task.
