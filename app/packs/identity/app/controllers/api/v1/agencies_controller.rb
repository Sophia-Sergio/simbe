module Api
  module V1
    # GET/PATCH /agency (owner only). Settings saves immediately via PATCH and every number
    # uses the new definition on the next request (spec decisions 3 and 8).
    class AgenciesController < Api::BaseController
      before_action :require_owner!

      def show
        render json: agency_json
      end

      def update
        Current.agency.update!(agency_params)
        render json: agency_json
      rescue ActiveRecord::RecordInvalid => e
        render json: {
          error: { code: "invalid_agency", message: e.record.errors.full_messages.to_sentence },
          errors: e.record.errors.to_hash
        }, status: :unprocessable_entity
      end

      private

      # The Agency contract block of MeSerializer — the same shape as GET /me's agency.
      def agency_json = MeSerializer.call(Current.user)[:agency]

      def agency_params
        params.permit(:name, :timezone, :qualified_milestone).to_h.symbolize_keys
      end
    end
  end
end
