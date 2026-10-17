module Api
  module V1
    # Owner-only coordinator performance (spec 2008 decision 9): GET /api/v1/coordinators returns a
    # card per coordinator; GET /api/v1/coordinators/:name adds KPIs and the leads needing action.
    # Coordinators get 403. The name is a URL-encoded path segment.
    class CoordinatorsController < Api::BaseController
      before_action :require_owner!

      def index
        render json: CoordinatorSerializer.list(Leads::CoordinatorStats.call(agency: Current.agency))
      end

      def show
        coordinator = Leads::CoordinatorStats.detail(agency: Current.agency, name: params[:name])
        render json: CoordinatorSerializer.detail(coordinator)
      end
    end
  end
end
