# Load an agency snapshot from the command line, the same path the upload API uses.
# The UI upload is how owners really load data (lane B-INGEST); this task is the local/ops
# equivalent (spec 2002 decision 10). It prints aggregates only — never a row.
namespace :snapshot do
  desc "Load an agency snapshot: rails 'snapshot:load[harbor,../handoff/takehome/exports/harbor]'"
  task :load, %i[slug dir] => :environment do |_task, args|
    abort "usage: rake 'snapshot:load[slug,dir]'" if args[:slug].to_s.empty? || args[:dir].to_s.empty?

    importer = Snapshot::Importer # also loads Invalid/InProgress for the rescues below
    slug = args[:slug].to_s
    # A replace is destructive: in production it must be confirmed by naming the agency.
    if Rails.env.production? && ENV["SIMBE_CONFIRM_REPLACE"] != slug
      abort "refusing to replace #{slug} in production: set SIMBE_CONFIRM_REPLACE=#{slug} to confirm"
    end

    agency = Agency.find_by!(slug: slug)
    dir = File.expand_path(args[:dir], Rails.root)
    started = Process.clock_gettime(Process::CLOCK_MONOTONIC)
    snapshot = importer.call(agency: agency, dir: dir)
    elapsed = Process.clock_gettime(Process::CLOCK_MONOTONIC) - started
    puts "#{agency.slug}: #{snapshot.row_counts.to_json} as_of=#{snapshot.as_of.iso8601} " \
         "in #{elapsed.round(1)}s"
  rescue Snapshot::Invalid => e
    abort e.report[:errors].map { |error| "#{error[:file]} row #{error[:row]}: #{error[:code]} #{error[:message]}" }
      .first(20).join("\n")
  rescue Snapshot::InProgress
    abort "#{args[:slug]}: a load is already running for this agency"
  rescue StandardError => e
    # Only the class: a PG::Error message carries the COPY row contents and a KeyError carries an
    # external_id (docs/conventions/sensitive-data.md). Never print e.message.
    abort "#{args[:slug]}: snapshot load failed (#{e.class})"
  end

  desc "Fail stuck uploads and expire uploads older than 24h (run hourly)"
  task expire_uploads: :environment do
    Snapshot::ExpireUploadsJob.perform_now
    puts "snapshot:expire_uploads done"
  end
end
