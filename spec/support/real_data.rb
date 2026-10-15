# Access to the real sample exports (handoff/takehome/exports/{harbor,lakeside}, git-ignored
# and therefore absent from CI and from linked worktrees). `bin/worktree-env` points
# SIMBE_EXPORTS_DIR at the main checkout; inside the container it is mounted at /exports.
#
# RealData.load! is the fast path the :real_data specs use (Reader → RowsLoader); the
# importer and the UI upload path are verified separately (docs/conventions/real-data.md).
module RealData
  CONFIG = {
    "harbor" => { timezone: "America/Los_Angeles", qualified_milestone: "consult_attended" },
    "lakeside" => { timezone: "America/Chicago", qualified_milestone: "records" }
  }.freeze

  class << self
    # -> String | nil. ENV["SIMBE_EXPORTS_DIR"] or <Rails.root>/handoff/takehome/exports, + "/slug".
    def dir(slug)
      base = ENV["SIMBE_EXPORTS_DIR"].to_s
      base = Rails.root.join("handoff/takehome/exports").to_s if base.empty?
      path = File.join(base, slug.to_s)
      File.directory?(path) ? path : nil
    end

    # true when the directory and all seven export files exist.
    def available?(slug = nil)
      return CONFIG.keys.all? { |name| available?(name) } if slug.nil?

      dir = dir(slug)
      !dir.nil? && Snapshot::Constants::REQUIRED_FILES.all? { |file| File.file?(File.join(dir, file)) }
    end

    def load!(agency, slug)
      dir = dir(slug)
      raise ArgumentError, "real exports not found for #{slug.inspect}" if dir.nil?

      RowsLoader.load!(agency, Snapshot::Reader.call(dir))
    end
  end
end

# Skip :real_data specs (and say so visibly) when the exports are not on this machine.
if defined?(RSpec) && RSpec.respond_to?(:configure)
  RSpec.configure do |config|
    unless RealData.available?
      config.filter_run_excluding :real_data
      puts "real_data specs skipped: exports not found"
    end
  end
end
