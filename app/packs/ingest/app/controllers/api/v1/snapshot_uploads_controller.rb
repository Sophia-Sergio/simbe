module Api
  module V1
    # Upload → validate → commit lifecycle (owner only). Thin: the heavy work runs in the
    # `ingest` jobs; these actions only store files, flip status and enqueue (lane override 1).
    class SnapshotUploadsController < Api::BaseController
      MAX_UPLOAD_BYTES = 250.megabytes
      # Cancel is allowed from the statuses the plan lists: an in-flight or finished-but-not-
      # committed upload. `committed`, `cancelled` and `expired` are terminal.
      CANCELLABLE = %w[validating validated committing failed].freeze

      before_action :require_owner!

      # POST /api/v1/snapshot_uploads → 201 { status: "validating", progress: {phase: "storing", pct: 0}, … }
      def create
        files = upload_files
        return render_error("invalid_request", "Attach at least one CSV file", 422) if files.empty?
        return render_error("invalid_request", "A filename is not usable", 422) if unsafe_names?(files)
        return render_error("too_large", "Uploads are capped at 250 MB", 413) if too_large?(files)

        upload = Current.agency.snapshot_uploads.create!(
          user: Current.user, status: "validating", progress: { phase: "storing", pct: 0 }
        )
        return render_error("upload_failed", "The upload could not be stored", 500) unless store_and_enqueue(upload, files)

        render json: SnapshotUploadSerializer.call(upload), status: :created
      rescue ActiveRecord::RecordNotUnique
        render_error("already_in_progress", "A load is already running", :conflict)
      end

      # GET /api/v1/snapshot_uploads/:id → the polled status/report/snapshot.
      def show
        render json: SnapshotUploadSerializer.call(upload)
      end

      # POST /api/v1/snapshot_uploads/:id/commit → 202 committing, 409, or 422 with the report.
      # The validated → committing claim is atomic (row lock + status check), so two concurrent
      # POSTs can never both enqueue a job.
      def commit
        upload.with_lock do
          case upload.status
          when "committed"
            return render json: SnapshotUploadSerializer.call(upload), status: :accepted
          when "committing"
            return render_error("already_in_progress", "A load is already running", :conflict)
          when "validating"
            return render_error("not_validated", "Validation has not finished", :conflict)
          when "cancelled", "expired"
            return render_error("not_validated", "This upload can no longer be committed", :conflict)
          end

          return render_invalid(upload) unless upload.report&.dig("ok") == true

          upload.update!(status: "committing", progress: { phase: "importing", pct: 0 }, started_at: Time.current)
        end

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

      def unsafe_names?(files)
        files.any? { |file| Snapshot::Storage.safe_name(file.original_filename).nil? }
      end

      # A failure here (disk full, a bad name, the queue) must not leave the row in the in-flight
      # unique index, or the agency could never upload again. Remove any partial files and mark the
      # row failed; the caller renders the error.
      def store_and_enqueue(upload, files)
        Snapshot::Storage.store(upload, files)
        upload.update!(dir: Snapshot::Storage.dir(upload).to_s)
        Snapshot::ValidateUploadJob.perform_later(upload)
        true
      rescue StandardError => e
        Snapshot::Storage.remove(upload)
        upload.update!(status: "failed", progress: nil, finished_at: Time.current,
                       error: { "code" => "upload_failed", "message" => "The upload could not be stored" })
        Rails.logger.error("snapshot upload store failed for upload #{upload.id} (#{e.class})")
        false
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

      # Compare-and-set cancel: only the statuses the plan allows are cancellable, so a committed,
      # expired or already-cancelled row is never rewritten (and a job's conditional writes still
      # win from their own starting status).
      def cancel(upload)
        affected = SnapshotUpload.where(id: upload.id, status: CANCELLABLE)
                                 .update_all(status: "cancelled", progress: nil,
                                             finished_at: Time.current, updated_at: Time.current)
        Snapshot::Storage.remove(upload) if affected.positive?
      end
    end
  end
end
