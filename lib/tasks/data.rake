# Development convenience: load the real sample exports without going through the UI.
# The UI upload path is the way owners really load data (lane B-INGEST); this task just
# lets an agent get Harbor/Lakeside into a dev DB in seconds.
namespace :data do
  desc "Load the real sample exports (development only): rake 'data:load_real[harbor|lakeside|all]'"
  task :load_real, %i[slug] => :environment do |_task, args|
    abort "data:load_real is development only (you're in #{Rails.env})" unless Rails.env.development?

    # The support files live under spec/ (never autoloaded); require them explicitly.
    require Rails.root.join("spec/support/rows_loader").to_s
    require Rails.root.join("spec/support/real_data").to_s

    requested = args[:slug].to_s
    abort "usage: rake 'data:load_real[harbor|lakeside|all]'" if requested.empty?
    slugs = requested == "all" ? RealData::CONFIG.keys : [ requested ]
    slugs.each do |slug|
      config = RealData::CONFIG.fetch(slug) { abort "unknown slug #{slug.inspect} (use harbor, lakeside or all)" }
      agency = Agency.find_or_create_by!(slug: slug) do |record|
        record.name = slug.capitalize
        record.timezone = config[:timezone]
        record.qualified_milestone = config[:qualified_milestone]
      end
      Current.agency = agency
      snapshot = RealData.load!(agency, slug)
      puts "#{slug}: #{snapshot.row_counts.to_json} as_of=#{snapshot.as_of.iso8601}"
    end
  end
end
