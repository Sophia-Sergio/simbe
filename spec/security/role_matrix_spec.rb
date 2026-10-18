require "rails_helper"
require "yaml"

# Role and tenancy matrix (W3-1 plan task 3 step 1).
#
# The table is **generated from the bundled OpenAPI** (the arbiter, plan Global Constraints): every
# documented operation is one row, and "owner-only" is derived from the operation's documented `403`
# response (the contract has no `x-roles`). Each operation then runs against the real app as
#
#   :signed_out  -> 401, except the public operations (createSession, signup, getInvitation,
#                   acceptInvitation), which must answer one of their documented statuses
#   :owner       -> a documented success status (never 401/403/404)
#   :coordinator -> 403 for owner-only operations, never 403 otherwise
#   :foreign     -> the id-taking operations answer 404 for another agency's ids (the exhaustive
#                   per-route 404 sweep lives in spec/isolation/isolation_spec.rb)
#
# Requests carry `X-Simbe-Contract-Probe` (the documented probe escape hatch, spec/support/contract.rb)
# because this spec pins *authorization statuses*: several of them (401 on an operation whose contract
# declares only 200/404, the 403s below) are intentionally outside the response schemas.
#
# CONTRACT_GAPS are the operations the app correctly restricts to owners but whose contract omits the
# 403: they are Contract Change Requests, recorded in docs/superpowers/parallel/integration-log.md.
# NOT_A_ROLE_GATE is createSession, whose documented 403 is not an owner gate (any role may sign in).
RSpec.describe "Role and tenancy matrix", type: :request do
  CONTRACT_DOCUMENT = YAML.load_file(Rails.root.join("contracts/dist/openapi.bundled.yaml"))
  HTTP_METHODS = %w[get post patch put delete].freeze

  OPERATIONS = CONTRACT_DOCUMENT["paths"].flat_map do |path, item|
    item.filter_map do |method, operation|
      next unless HTTP_METHODS.include?(method) && operation.is_a?(Hash) && operation["operationId"]

      { method: method.upcase, path: path, id: operation["operationId"],
        owner_only: operation["responses"].to_h.key?("403"),
        statuses: operation["responses"].to_h.keys.map(&:to_i) }
    end
  end.freeze

  PUBLIC_OPERATIONS = %w[createSession signup getInvitation acceptInvitation].freeze
  NOT_A_ROLE_GATE = %w[createSession].freeze
  CONTRACT_GAPS = {
    "deleteInvitation" => "invitations_controller requires owner; contract declares only 204/404",
    "cancelSnapshotUpload" => "snapshot_uploads_controller requires owner; contract declares only 204/404",
    "commitSnapshotUpload" => "snapshot_uploads_controller requires owner; contract declares no 403",
    "getAgency" => "agencies_controller requires owner; contract declares only 200/401"
  }.freeze
  FOREIGN_ID_OPERATIONS = %w[getLead completeNextAction undoNextAction getCoordinator
                             getAgentConversation deleteInvitation].freeze

  let(:agency) { create(:agency, slug: "harbor", name: "Harbor Surrogacy") }
  let!(:owner) { create(:user, agency: agency, email: "erin@harbor.test", name: "Erin Walsh") }
  let!(:dana) do
    create(:user, :coordinator, agency: agency, email: "dana@harbor.test", name: "Dana Ortiz",
                                coordinator_name: "Dana Ortiz")
  end

  let!(:beta) do
    other = create(:agency, slug: "beta", name: "Beta")
    Current.agency = other
    AlphaScenario.load!(other, :other_leads)
    Lead.unscoped.where(agency_id: other.id).find_by!(first_name: "L4").update!(coordinator_name: "Beta Only")
    Current.reset
    other
  end
  let!(:beta_owner) { create(:user, agency: beta, email: "owner@beta.test", name: "Beta Owner") }
  let!(:beta_conversation) do
    Current.set(agency: beta) { AgentConversation.create!(agency: beta, user: beta_owner, title: "theirs") }
  end
  let!(:beta_invitation) do
    Current.set(agency: beta) do
      Signup::Invitations.issue!(agency: beta, invited_by: beta_owner, email: "guest@beta.test",
                                 coordinator_name: "Beta Only").first
    end
  end

  before do
    Current.agency = agency
    AlphaScenario.load!(agency)
    AlphaSpend.load!(agency)
    @owner_conversation = AgentConversation.create!(agency: agency, user: owner, title: "mine")
    @dana_conversation = AgentConversation.create!(agency: agency, user: dana, title: "hers")
    # Two non-in-flight uploads so show/commit/cancel each answer their documented success.
    # The commit fixture carries a contract-shaped ok report (contracts/examples) so the response is
    # conformant and commit reaches its 202 path rather than the 422 not-validated error.
    validated_report = JSON.parse(Rails.root.join("contracts/examples/snapshots/upload-ok.json").read).fetch("report")
    @upload_commit = SnapshotUpload.create!(agency: agency, user: owner, status: "validated",
                                            progress: nil, report: validated_report)
    @upload_cancel = SnapshotUpload.create!(agency: agency, user: owner, status: "validated", progress: nil)
    @delete_invitation = Signup::Invitations.issue!(agency: agency, invited_by: owner, email: "delete@harbor.test",
                                                    coordinator_name: "Dana Ortiz").first
    @preview_token = Signup::Invitations.issue!(agency: agency, invited_by: owner, email: "preview@harbor.test",
                                                coordinator_name: "Dana Ortiz").last
    @accept_token = Signup::Invitations.issue!(agency: agency, invited_by: owner, email: "accept@harbor.test",
                                               coordinator_name: "Dana Ortiz").last
    Current.reset
    allow(Spend::SampleGenerator).to receive(:call).and_return(true)
    stub_anthropic(anthropic_message(
      content: [ tool_use("respond", { "text" => "Facebook is cheapest." }, id: "t") ], stop_reason: "tool_use"
    ))
  end

  def probe = { "X-Requested-With" => "simbe", "X-Simbe-Contract-Probe" => "1" }

  # This spec pins authorization statuses, several of which the contract does not declare
  # (a 401 on an operation that documents only 200/404, the 403s in CONTRACT_GAPS). The
  # documented opt-out keeps those deliberate responses from failing response conformance;
  # request/response *schemas* are still validated by the lane specs and spec/contract.
  around do |example|
    configuration = OpenapiFirst::Test.configuration
    previous = configuration.ignore_unknown_response_status?
    configuration.ignore_unknown_response_status = true
    example.run
  ensure
    configuration.ignore_unknown_response_status = previous
  end

  def lead(first_name) = Lead.unscoped.where(agency_id: agency.id).find_by!(first_name: first_name)

  def beta_lead = Lead.unscoped.where(agency_id: beta.id).find_by!(first_name: "L4")

  def conversation_id_for(principal) = principal == :coordinator ? @dana_conversation.id : @owner_conversation.id

  def upload_files
    Dir[File.join(AlphaScenario.copy_dir, "*.csv")].sort.map { |path| Rack::Test::UploadedFile.new(path, "text/csv") }
  end

  def sign_in_as(principal)
    user = principal == :coordinator ? dana : owner
    post "/api/v1/session", params: { email: user.email, password: "secret-pass-1" }, headers: probe, as: :json
    Current.agency = user.agency
  end

  def sign_out
    delete "/api/v1/session", headers: probe
  end

  DRIVERS = {
    "listAdConnections" => ->(_p) { get "/api/v1/ad_connections", headers: probe; response.status },
    "connectAdPlatform" => ->(_p) { post "/api/v1/ad_connections", params: { platform: "meta" }, headers: probe, as: :json; response.status },
    "disconnectAdPlatform" => ->(_p) {
      post "/api/v1/ad_connections", params: { platform: "meta" }, headers: probe, as: :json
      delete "/api/v1/ad_connections/meta", headers: probe
      response.status
    },
    "getAgency" => ->(_p) { get "/api/v1/agency", headers: probe; response.status },
    "updateAgency" => ->(_p) { patch "/api/v1/agency", params: { timezone: "America/Chicago" }, headers: probe, as: :json; response.status },
    "getAgentConversation" => ->(p) {
      id = p == :foreign ? beta_conversation.id : conversation_id_for(p)
      get "/api/v1/agent/conversations/#{id}", headers: probe
      response.status
    },
    "sendAgentMessage" => ->(_p) { post "/api/v1/agent/messages", params: { text: "Which channel is cheapest?" }, headers: probe, as: :json; response.status },
    "getAgentSuggestions" => ->(_p) { get "/api/v1/agent/suggestions", headers: probe; response.status },
    "getAgentUsage" => ->(_p) { get "/api/v1/agent/usage", headers: probe; response.status },
    "listCoordinatorNames" => ->(_p) { get "/api/v1/coordinator_names", headers: probe; response.status },
    "listCoordinators" => ->(_p) { get "/api/v1/coordinators", headers: probe; response.status },
    "getCoordinator" => ->(p) { get "/api/v1/coordinators/#{p == :foreign ? 'Beta%20Only' : 'Dana%20Ortiz'}", headers: probe; response.status },
    "createInvitation" => ->(_p) { post "/api/v1/invitations", params: { email: "new@harbor.test", coordinator_name: "Dana Ortiz" }, headers: probe, as: :json; response.status },
    "deleteInvitation" => ->(p) { delete "/api/v1/invitations/#{p == :foreign ? beta_invitation.id : @delete_invitation.id}", headers: probe; response.status },
    "acceptInvitation" => ->(_p) { post "/api/v1/invitations/#{@accept_token}/accept", params: { name: "New Coordinator", password: "long-enough-pass" }, headers: probe, as: :json; response.status },
    "getInvitation" => ->(_p) { get "/api/v1/invitations/#{@preview_token}/preview", headers: probe; response.status },
    "listLeads" => ->(_p) { get "/api/v1/leads", headers: probe; response.status },
    "getBoard" => ->(_p) { get "/api/v1/leads/board", headers: probe; response.status },
    "getLead" => ->(p) { get "/api/v1/leads/#{p == :foreign ? beta_lead.external_id : lead('L4').external_id}", headers: probe; response.status },
    "getMcpSettings" => ->(_p) { get "/api/v1/mcp", headers: probe; response.status },
    "rotateMcpKey" => ->(_p) { post "/api/v1/mcp/rotate", headers: probe; response.status },
    "getMe" => ->(_p) { get "/api/v1/me", headers: probe; response.status },
    "getMetricsChannels" => ->(_p) { get "/api/v1/metrics/channels", params: { range: "30d" }, headers: probe; response.status },
    "getMetricsChannel" => ->(_p) { get "/api/v1/metrics/channels/Facebook", params: { range: "30d" }, headers: probe; response.status },
    "getMetricsFunnel" => ->(_p) { get "/api/v1/metrics/funnel", params: { range: "30d" }, headers: probe; response.status },
    "getMetricsSummary" => ->(_p) { get "/api/v1/metrics/summary", params: { range: "30d" }, headers: probe; response.status },
    "getNextActions" => ->(_p) { get "/api/v1/next_actions", headers: probe; response.status },
    "completeNextAction" => ->(p) {
      id = p == :foreign ? beta_lead.external_id : lead("L4").external_id
      post "/api/v1/next_actions/#{id}/nudge_applications/completion", headers: probe
      response.status
    },
    "undoNextAction" => ->(p) {
      id = p == :foreign ? beta_lead.external_id : lead("L4").external_id
      delete "/api/v1/next_actions/#{id}/nudge_applications/completion", headers: probe
      response.status
    },
    "getRecommendations" => ->(_p) { get "/api/v1/recommendations", params: { range: "30d" }, headers: probe; response.status },
    "createSession" => ->(_p) { post "/api/v1/session", params: { email: owner.email, password: "secret-pass-1" }, headers: probe, as: :json; response.status },
    "deleteSession" => ->(_p) { sign_out; response.status },
    "signup" => ->(_p) {
      post "/api/v1/signup",
           params: { user: { name: "New Owner", email: "brand-new@signup.test", password: "long-enough-pass" },
                     agency: { name: "Brand New", timezone: "America/Denver", qualified_milestone: "records" } },
           headers: probe, as: :json
      response.status
    },
    # Cancels the in-flight upload it just created so the fixture agency keeps no "validating" upload
    # (the unique in-flight index would otherwise make commitSnapshotUpload answer 409, not its 202).
    "createSnapshotUpload" => ->(_p) {
      post "/api/v1/snapshot_uploads", params: { files: upload_files }, headers: probe
      status = response.status
      created = response.parsed_body["id"]
      delete "/api/v1/snapshot_uploads/#{created}", headers: probe if created
      status
    },
    "getSnapshotUpload" => ->(_p) { get "/api/v1/snapshot_uploads/#{@upload_commit.id}", headers: probe; response.status },
    "cancelSnapshotUpload" => ->(_p) { delete "/api/v1/snapshot_uploads/#{@upload_cancel.id}", headers: probe; response.status },
    "commitSnapshotUpload" => ->(_p) { post "/api/v1/snapshot_uploads/#{@upload_commit.id}/commit", headers: probe; response.status },
    "getCurrentSnapshot" => ->(_p) { get "/api/v1/snapshots/current", headers: probe; response.status },
    "getTeam" => ->(_p) { get "/api/v1/team", headers: probe; response.status }
  }.freeze

  # The exact status each operation answers for its owner-column driver payload. Derived from the
  # contract as the lowest documented 2xx; the overrides are the operations whose driver legitimately
  # exercises a different documented success (so a 409/422 error path can never count as "exercised").
  SUCCESS_OVERRIDES = {
    # A first connect answers 201 (/a repeat connect answers 200 - both documented).
    "connectAdPlatform" => 201,
    # A validated upload with an ok report is claimed and queued: 202 committing. 409/422 are the
    # already-in-progress / not-validated error paths the driver must not hit.
    "commitSnapshotUpload" => 202
  }.freeze

  def expected_success(operation)
    SUCCESS_OVERRIDES.fetch(operation[:id]) { operation[:statuses].select { |status| (200..299).cover?(status) }.min }
  end

  def owner_only?(operation)
    return false if NOT_A_ROLE_GATE.include?(operation[:id])

    operation[:owner_only] || CONTRACT_GAPS.key?(operation[:id])
  end

  it "has a driver for every documented operation" do
    missing = OPERATIONS.map { |operation| operation[:id] } - DRIVERS.keys
    expect(missing).to be_empty, "no matrix driver for: #{missing.join(', ')}"
    expect(DRIVERS.keys - OPERATIONS.map { |operation| operation[:id] }).to be_empty
    expect(OPERATIONS.size).to eq(39)
  end

  # A CONTRACT_GAPS entry records "the app is owner-only but the contract omits the 403". Once the
  # contract documents the 403 the entry is stale and must be deleted: this example fails then.
  it "has no stale CONTRACT_GAPS entry (a gap whose contract now documents a 403)" do
    by_id = OPERATIONS.index_by { |operation| operation[:id] }
    stale = CONTRACT_GAPS.keys.select { |id| by_id.fetch(id)[:owner_only] }
    expect(stale).to be_empty,
                   "the contract now documents a 403 for #{stale.join(', ')}; delete those CONTRACT_GAPS entries"
  end

  %i[signed_out owner coordinator foreign].each do |principal|
    it "matches the #{principal} column of the matrix for every operation" do
      failures = []

      OPERATIONS.each do |operation|
        case principal
        when :signed_out then sign_out
        when :foreign then sign_in_as(:owner)
        else sign_in_as(principal)
        end

        status = instance_exec(principal, &DRIVERS.fetch(operation[:id]))

        matched, expectation =
          case principal
          when :signed_out
            if PUBLIC_OPERATIONS.include?(operation[:id])
              [ operation[:statuses].include?(status), operation[:statuses] ]
            else
              [ status == 401, 401 ]
            end
          when :owner
            [ status == expected_success(operation), expected_success(operation) ]
          when :coordinator
            owner_only?(operation) ? [ status == 403, 403 ] : [ status == expected_success(operation), expected_success(operation) ]
          when :foreign
            next unless FOREIGN_ID_OPERATIONS.include?(operation[:id])

            [ status == 404, 404 ]
          end

        next if matched

        failures << "#{operation[:method]} #{operation[:path]} (#{operation[:id]}): got #{status}, expected #{expectation.inspect}"
      end

      expect(failures).to be_empty, "#{principal} matrix mismatches:\n  #{failures.join("\n  ")}"
    end
  end
end
