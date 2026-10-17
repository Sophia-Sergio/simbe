# Ask the agent from the CLI with the real Anthropic key (spec 2013, acceptance 6):
#   docker compose exec web bundle exec rails "agent:smoke[harbor,Which channel costs the most per qualified lead?]"
# It runs one full turn (tools + the model) and prints the structured answer body. The
# spend ledger row is written by the turn itself; check it with the psql query in the PR.
namespace :agent do
  desc "Ask the agent from the CLI: rails 'agent:smoke[slug,question]'"
  task :smoke, %i[slug question] => :environment do |_task, args|
    abort "agent:smoke is disabled in production" if Rails.env.production?
    abort "ANTHROPIC_API_KEY is not set" if ENV["ANTHROPIC_API_KEY"].blank?

    slug = args[:slug].to_s
    question = args[:question].to_s
    abort "usage: rake 'agent:smoke[slug,question]'" if slug.empty? || question.empty?

    agency = Agency.find_by(slug: slug) or abort "no agency #{slug.inspect}"
    user = agency.users.find_by(role: "owner") or abort "agency #{slug} has no owner"
    Current.agency = agency

    conversation = AgentConversation.create!(agency: agency, user: user, title: question[0, 60])
    message = Agent::TurnRunner.call(conversation: conversation, text: question)
    puts JSON.pretty_generate(message.body)
  end
end
