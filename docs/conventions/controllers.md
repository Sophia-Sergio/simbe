# Controllers and services

- Controllers are thin: authenticate → authorize (Pundit-style policies in `app/policies`) → call one service → render a serializer. No query logic.
- Services live in `app/services/<domain>/`, expose `.call(...)`, return a value object or raise a typed error.
- Errors render as `{ "error": { "code": "snake_case", "message": "…" } }` with the right status. `409 already_in_progress` for single-flight conflicts.
- Serializers are plain Ruby (`app/serializers`), explicit attribute lists; never `render json: record`.
- Roles: `owner` and `coordinator`. Authorize with policies; coordinator-only data is enforced server-side, never by hiding UI.
