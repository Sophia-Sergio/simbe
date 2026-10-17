class Snapshot
  # Stores an upload's files under storage/snapshot_uploads/<id>/ and deletes them after commit,
  # cancel or expiry (spec 2002 decisions 6 and 8). Only the seven required names are written to
  # disk (canonicalised, case-insensitively); any other uploaded name is reported as `ignored` and
  # never stored, so a crafted upload cannot fill the disk or hide a payload.
  #
  # `storage/` is git-ignored; the directory only lives between upload and commit/cancel/expiry.
  module Storage
    ROOT = "storage/snapshot_uploads"
    # A DoS bound on a single upload; the seven required files plus a little slack.
    MAX_FILES = 20
    # Browsers disagree about a CSV's content type; these are accepted (blank too).
    CSV_CONTENT_TYPES = %w[
      text/csv application/csv application/vnd.ms-excel text/plain application/octet-stream
    ].freeze

    def self.root
      Rails.root.join(ROOT)
    end

    def self.dir(upload)
      root.join(upload.id.to_s)
    end

    def self.path(upload, name)
      dir(upload).join(name)
    end

    # Only the seven required files are ever written to disk; anything else is reported as
    # `ignored` (never stored) so a crafted upload cannot fill the disk or hide a payload.
    # -> { stored: [names], ignored: [uploaded names that match none of the seven] }.
    def self.store(upload, files)
      FileUtils.mkdir_p(dir(upload))
      stored = []
      ignored = []
      Array(files).each do |file|
        name = safe_name(file.original_filename)
        next if name.nil?

        canonical = canonical_name(name)
        if canonical.nil?
          ignored << name
          next
        end
        write(path(upload, canonical), file)
        stored << canonical
      end
      { stored: stored.uniq, ignored: ignored.uniq }
    end

    # -> nil when the set is acceptable, or a reason symbol for the caller to turn into a 422.
    # Unknown names are allowed (they are ignored, not stored); everything else is rejected.
    def self.invalid_files(files)
      list = Array(files)
      return :invalid_request if list.empty?
      return :too_many_files if list.size > MAX_FILES

      names = list.map { |file| safe_name(file.original_filename) }
      return :unsafe_name if names.any?(&:nil?)
      return :duplicate_file if names.uniq.size != names.size

      matched = list.select { |file| canonical_name(safe_name(file.original_filename)) }
      return :duplicate_file if matched.map { |file| canonical_name(safe_name(file.original_filename)) }.uniq.size != matched.size
      return :not_csv if matched.any? { |file| !csv_content_type?(file) }

      nil
    end

    def self.csv_content_type?(file)
      content_type = file.respond_to?(:content_type) ? file.content_type.to_s : ""
      content_type.empty? || CSV_CONTENT_TYPES.include?(content_type)
    end

    # Total bytes of the uploaded files, for the 250 MB upload cap.
    def self.total_bytes(files)
      Array(files).sum do |file|
        io = file.respond_to?(:tempfile) ? file.tempfile : nil
        io ? io.size : file.to_s.bytesize
      end
    end

    def self.remove(upload)
      path = dir(upload).to_s
      FileUtils.rm_rf(path) if path.start_with?(root.to_s)
    end

    # nil unless the basename is one of the seven export names (case-insensitive).
    def self.canonical_name(name)
      Constants::REQUIRED_FILES.find { |required| required == name.downcase }
    end

    # Basename only, so a crafted filename can never escape the upload directory. Returns nil for
    # anything unsafe (empty, "..", a control character such as a NUL byte — File.basename itself
    # raises ArgumentError on a NUL), so callers can reject the request instead of 500ing.
    def self.safe_name(name)
      raw = name.to_s
      return nil if raw.empty? || raw.match?(/[[:cntrl:]]/)

      base = File.basename(raw.tr("\\", "/")).strip
      return nil if base.empty? || base == "." || base == ".."

      base
    rescue ArgumentError
      nil
    end

    def self.write(path, file)
      source = file.respond_to?(:tempfile) ? file.tempfile : file
      source.rewind if source.respond_to?(:rewind)
      File.open(path, "wb") { |out| IO.copy_stream(source, out) }
    end
  end
end
