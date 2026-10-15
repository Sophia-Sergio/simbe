module Api
  # Unknown /api/* paths answer the error envelope, never the HTML shell.
  class NotFoundController < ActionController::API
    def show = render(json: { error: { code: "not_found", message: "Not found" } }, status: :not_found)
  end
end
