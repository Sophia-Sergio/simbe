module Api
  module V1
    class MeController < Api::BaseController
      def show = render json: MeSerializer.call(Current.user)
    end
  end
end
