class Snapshot
  # Throttled writer for `snapshot_uploads.progress`, used by the ingest jobs so the UI can poll
  # a long load (spec 2002 decision 6). It writes at most every THROTTLE seconds or when the
  # percentage moves by >= MIN_STEP, and always on a phase change, so a per-batch update never
  # floods the database.
  #
  # The commit job passes a dedicated `connection:` because the import runs in ONE big
  # transaction: a write on the job's own connection would only become visible at commit, so the
  # polled progress would never move. Without `connection:` the upload's own connection is used
  # (validation has no transaction), which keeps the service simple in specs.
  class Progress
    THROTTLE = 0.5
    MIN_STEP = 1

    UPDATE_SQL = "UPDATE snapshot_uploads SET progress = $1::jsonb, updated_at = now() WHERE id = $2"

    def initialize(upload, clock: nil, connection: nil)
      @upload = upload
      @clock = clock || -> { Process.clock_gettime(Process::CLOCK_MONOTONIC) }
      @connection = connection
      @last = nil
    end

    # -> the written Hash, or nil when throttled. `phase` is one of the contract's Phase values.
    def update(phase:, pct:, rows_done: nil, rows_total: nil)
      phase = phase.to_s
      pct = pct.to_i.clamp(0, 100)
      return nil if throttled?(phase, pct)

      data = { phase: phase, pct: pct }
      data[:rows_done] = rows_done if rows_done
      data[:rows_total] = rows_total if rows_total
      write(data)
      @last = { phase: phase, pct: pct, at: @clock.call }
      data
    end

    # Terminal states report `progress: null`.
    def finish
      write(nil)
      @last = nil
    end

    private

    def throttled?(phase, pct)
      return false if @last.nil?
      return false if @last[:phase] != phase
      return false if pct >= @last[:pct] + MIN_STEP

      @clock.call - @last[:at] < THROTTLE
    end

    def write(data)
      if @connection
        @connection.exec_update(self.class::UPDATE_SQL, "Snapshot::Progress",
                                [ bind("progress", data&.to_json), bind("id", @upload.id) ])
      else
        @upload.update_column(:progress, data)
      end
    end

    def bind(name, value)
      ActiveRecord::Relation::QueryAttribute.new(name, value, ActiveRecord::Type::String.new)
    end
  end
end
