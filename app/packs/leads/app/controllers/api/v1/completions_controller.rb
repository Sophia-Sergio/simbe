module Api
  module V1
    # POST /api/v1/next_actions/:lead_id/:queue/completion  -> { done: true }
    # DELETE ... -> { done: false }
    # Both idempotent; an unknown queue is 422 bad_queue, a lead outside the user's scope (or not
    # in that queue) is 404 (docs/conventions/controllers.md).
    class CompletionsController < Api::BaseController
      rescue_from Leads::NextActions::BadQueue do
        render_error("bad_queue", "Unknown queue", :unprocessable_entity)
      end

      def create
        Leads::NextActions.complete!(user: Current.user, lead_id: params[:lead_id], queue: params[:queue])
        render json: { done: true }
      end

      def destroy
        Leads::NextActions.undo!(user: Current.user, lead_id: params[:lead_id], queue: params[:queue])
        render json: { done: false }
      end
    end
  end
end
