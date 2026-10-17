# Development convenience: fabricate deterministic sample ad spend for an agency so the
# spend-dependent metrics (Cost per qualified, Channels, channel detail) have a source
# while the real Google/Meta connectors do not exist yet (spec 2004 decision 6).
namespace :spend do
  desc "Generate deterministic sample ad spend: rake 'spend:sample[harbor|lakeside]'"
  task :sample, %i[slug] => :environment do |_task, args|
    slug = args[:slug].to_s
    abort "usage: rake 'spend:sample[slug]'" if slug.empty?

    agency = Agency.find_by(slug: slug) or abort "no agency #{slug.inspect}"
    Current.agency = agency
    written = Spend::SampleGenerator.call(agency: agency)
    puts "spend: #{written} sample row(s) for #{slug}"
  end
end
