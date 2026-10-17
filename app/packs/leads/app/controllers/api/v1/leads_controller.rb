# Thin controller over the leads services (docs/conventions/controllers.md): authenticate and
# role-scope in the service, render the service's hash. `Api::BaseController` sets
# Current.agency and turns ActiveRecord::RecordNotFound into a 404, so another agency's — or
# another coordinator's — lead never leaks.
module Api
  module V1
    class LeadsController < Api::BaseController
      # GET /api/v1/leads?status=&coordinator=&q=&cursor=&per=
      # Params are passed raw: Leads::List owns the strict scalar coercion and the `status`
      # default (a malformed param is ignored, never a 500).
      def index
        render json: Leads::List.call(
          user: Current.user, status: params[:status], coordinator: params[:coordinator],
          q: params[:q], cursor: params[:cursor], per: params[:per]
        )
      end

      # GET /api/v1/leads/board?coordinator=
      def board
        render json: Leads::Board.call(user: Current.user, coordinator: params[:coordinator])
      end

      # GET /api/v1/leads/:id
      def show
        render json: Leads::Detail.call(user: Current.user, id: params[:id])
      end
    end
  end
end
