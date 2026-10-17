module Api
  module V1
    # GET /api/v1/next_actions — the four queues for the signed-in coordinator, or, for an owner,
    # every queue (narrowed by ?coordinator=). Thin: one service, one serializer.
    class NextActionsController < Api::BaseController
      def index
        render json: NextActionsSerializer.call(
          Leads::NextActions.call(user: Current.user, coordinator: params[:coordinator])
        )
      end
    end
  end
end
