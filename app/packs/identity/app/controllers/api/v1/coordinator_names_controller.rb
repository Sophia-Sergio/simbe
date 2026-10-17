module Api
  module V1
    # GET /coordinator_names (owner only): the coordinator names present in this agency's
    # leads, used by the invite picker (spec decision 7).
    class CoordinatorNamesController < Api::BaseController
      before_action :require_owner!

      def index
        render json: { names: Signup::Invitations.coordinator_names }
      end
    end
  end
end
