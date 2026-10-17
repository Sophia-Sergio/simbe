class Snapshot
  # Stores an upload's files under storage/snapshot_uploads/<id>/ and deletes them after commit,
  # cancel or expiry (spec 2002 decisions 6 and 8). Every file is reduced to its basename, matched
  # to the seven export names case-insensitively and stored under the canonical name so
  # Snapshot::Reader can stream it; anything else is kept too (the report lists it as `ignored`)
  # and removed with the directory.
  #
  # `storage/` is git-ignored; the directory only lives between upload and commit/cancel/expiry.
  module Storage
    ROOT = "storage/snapshot_uploads"

    def self.root
      Rails.root.join(ROOT)
    end

    def self.dir(upload)
      root.join(upload.id.to_s)
    end

    def self.path(upload, name)
      dir(upload).join(name)
    end

    # Copies each uploaded file (ActionDispatch::Http::UploadedFile) into the upload's directory.
    # -> { stored: [names], ignored: [uploaded names that match none of the seven] }.
    def self.store(upload, files)
      FileUtils.mkdir_p(dir(upload))
      stored = []
      ignored = []
      Array(files).each do |file|
        name = safe_name(file.original_filename)
        next if name.nil?

        canonical = canonical_name(name)
        write(path(upload, canonical || name), file)
        stored << (canonical || name)
        ignored << name if canonical.nil?
      end
      { stored: stored.uniq, ignored: ignored.uniq }
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
