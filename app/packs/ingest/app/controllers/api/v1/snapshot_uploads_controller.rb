module Api
  module V1
    # Upload → validate → commit lifecycle (owner only). Thin: the heavy work runs in the
    # `ingest` jobs; these actions only store files, flip status and enqueue (lane override 1).
    class SnapshotUploadsController < Api::BaseController
      MAX_UPLOAD_BYTES = 250.megabytes

      before_action :require_owner!

      # POST /api/v1/snapshot_uploads → 201 { status: "validating", progress: {phase: "storing", pct: 0}, … }
      def create
        files = upload_files
        return render_error("invalid_request", "Attach at least one CSV file", 422) if files.empty?
        return render_error("too_large", "Uploads are capped at 250 MB", 413) if too_large?(files)

        upload = Current.agency.snapshot_uploads.create!(
          user: Current.user, status: "validating", progress: { phase: "storing", pct: 0 }
        )
        Snapshot::Storage.store(upload, files)
        upload.update!(dir: Snapshot::Storage.dir(upload).to_s)
        Snapshot::ValidateUploadJob.perform_later(upload)
        render json: SnapshotUploadSerializer.call(upload), status: :created
      rescue ActiveRecord::RecordNotUnique
        render_error("already_in_progress", "A load is already running", :conflict)
      end

      # GET /api/v1/snapshot_uploads/:id → the polled status/report/snapshot.
      def show
        render json: SnapshotUploadSerializer.call(upload)
      end

      # POST /api/v1/snapshot_uploads/:id/commit → 202 committing, 409, or 422 with the report.
      def commit
        return render json: SnapshotUploadSerializer.call(upload), status: :accepted if upload.status == "committed"
        return render_error("already_in_progress", "A load is already running", :conflict) if upload.status == "committing"
        return render_error("not_validated", "Validation has not finished", :conflict) if upload.status == "validating"
        return render_error("not_validated", "This upload can no longer be committed", :conflict) if expired?(upload)

        return render_invalid(upload) unless upload.report&.dig("ok") == true

        upload.update!(status: "committing", progress: { phase: "importing", pct: 0 }, started_at: Time.current)
        Snapshot::CommitUploadJob.perform_later(upload)
        render json: SnapshotUploadSerializer.call(upload), status: :accepted
      rescue ActiveRecord::RecordNotUnique
        render_error("already_in_progress", "A load is already running", :conflict)
      end

      # DELETE /api/v1/snapshot_uploads/:id → cancels and removes the files.
      def destroy
        cancel(upload)
        head :no_content
      end

      private

      def upload
        @upload ||= Current.agency.snapshot_uploads.find(params[:id])
      end

      def upload_files
        Array(params[:files]).select { |file| file.respond_to?(:original_filename) }
      end

      def too_large?(files)
        Snapshot::Storage.total_bytes(files) > MAX_UPLOAD_BYTES
      end

      def render_invalid(upload)
        render json: {
          error: { code: "invalid_snapshot", message: "The upload has validation errors" },
          report: upload.report
        }, status: 422
      end

      def expired?(upload)
        %w[cancelled expired].include?(upload.status)
      end

      # A running commit job notices the flag between batches and aborts.
      def cancel(upload)
        return if upload.status == "committed"

        upload.update!(status: "cancelled", progress: nil, finished_at: Time.current)
        Snapshot::Storage.remove(upload)
      end
    end
  end
end
