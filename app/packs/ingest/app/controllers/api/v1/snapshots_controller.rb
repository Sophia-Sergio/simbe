module Api
  module V1
    # The latest snapshot plus any upload in flight. Any role: the top-bar pill needs `as_of`,
    # and the aggregates are not sensitive (docs/conventions/sensitive-data.md).
    class SnapshotsController < Api::BaseController
      def current
        render json: SnapshotSerializer.current(Current.agency)
      end
    end
  end
end
