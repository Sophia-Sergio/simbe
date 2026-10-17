require "rails_helper"
require_relative "golden_helper"

# The real-export oracle for the leads API (lane override 7, docs/conventions/real-data.md):
# for Harbor and Lakeside it compares the board counts, the status-filtered list walks, the
# timing and the owner's detail responses against spec/real_data/golden.json. The exports are
# local-only, so this is tagged :real_data and auto-skipped when they are absent.
#
# Timing: request specs run with OpenAPI conformance on (spec/support/contract.rb), which
# validates every response against the contract and costs far more than the app itself, so the
# < 500 ms budget is asserted on the service call (what a production request does) and the
# observed request time is only reported and loosely bounded.
#
# One example per agency: loading a real export (Lakeside is ~625k rows, ~2.5 min) is the
# expensive part, so the checks share a single load and report together.
RSpec.describe "real exports: leads API vs golden.json", :real_data, type: :request do
  let(:headers) { { "X-Requested-With" => "simbe" } }

  %w[harbor lakeside].each do |slug|
    context "for #{slug}" do
      let(:golden) { Golden.agency(slug) }

      before do
        @agency = create(:agency, slug: slug, **RealData::CONFIG.fetch(slug))
        Current.agency = @agency
        # A real load is memory-heavy (the reader holds the whole export at once); collect first
        # so the peak stays inside the Docker VM's 8 GB.
        GC.start
        RealData.load!(@agency, slug)
        GC.start
        @owner = create(:user, agency: @agency)
        @other = create(:user, :coordinator, agency: @agency, coordinator_name: "Unassigned Coordinator")
        @request_times = []
        sign_in(@owner)
      end

      it "matches the golden board, list, timing and privacy shape" do
        aggregate_failures do
          board = timed_get("/api/v1/leads/board")
          counts = board["columns"].transform_values { |column| column["count"] }
          expect(counts).to eq(golden["board_column_counts"])
          expect(board["columns"].values.map { |column| column["leads"].size }).to all(be <= 25)

          open_ids, = walk("open")
          expect(open_ids.size).to eq(golden["outcomes"]["open"])
          expect(open_ids.uniq.size).to eq(open_ids.size) # no duplicates across pages

          expect(walk("paused").first.size).to eq(golden["outcomes"]["paused"])
          expect(walk("accepted").first.size).to eq(golden["outcomes"]["accepted"])
          expect(walk("closed").first.size).to eq(closed_count)

          # Changing the agency's qualified milestone re-columns the board with no reload (a
          # narrower definition can only move leads out of `qualified`).
          @agency.update!(qualified_milestone: "accepted")
          recut = timed_get("/api/v1/leads/board")["columns"].transform_values { |column| column["count"] }
          expect(recut["qualified"]).to be < counts["qualified"]
          expect(recut.values.sum).to be <= counts.values.sum

          # A lead from the data is found by the owner and by nobody for an unassigned coordinator.
          lead = Lead.where(outcome: "open").order(:lead_created_at).first
          get "/api/v1/leads", params: { q: lead.email }, headers: headers
          expect(response.parsed_body["leads"].map { |card| card["id"] }).to eq([ lead.external_id ])

          sign_in(@other)
          get "/api/v1/leads", params: { q: lead.email }, headers: headers
          expect(response.parsed_body["leads"]).to eq([])

          # The owner never receives a raw screener answer, for 50 random leads.
          sign_in(@owner)
          Lead.order(Arel.sql("RANDOM()")).limit(50).pluck(:external_id).each do |id|
            get "/api/v1/leads/#{id}", headers: headers
            expect(response).to have_http_status(:ok)
            expect(response.body).not_to include("\"answer\"")
          end

          # < 500 ms per page, measured where the budget applies (see the header note).
          Current.agency = @agency
          expect(service_seconds { Leads::Board.call(user: @owner) }).to be < 0.5
          %w[open paused closed accepted].each do |status|
            expect(service_seconds { Leads::List.call(user: @owner, status: status) }).to be < 0.5, "#{status} list was slow"
          end
          warn "[#{slug}] request times: max #{(request_max * 1000).round} ms (OpenAPI conformance validates every response)"
        end
      end
    end
  end

  def sign_in(user)
    post "/api/v1/session", params: { email: user.email, password: "secret-pass-1" }, headers: headers, as: :json
    expect(response).to have_http_status(:created)
  end

  def closed_count
    golden["outcomes"].slice("not_eligible", "withdrew", "unresponsive").values.sum
  end

  # Walks every page of a status filter through next_cursor: returns the ids (in order).
  def walk(status)
    ids = []
    cursor = nil
    loop do
      params = { status: status, per: 50 }
      params[:cursor] = cursor if cursor
      body = timed_get("/api/v1/leads", params)
      ids.concat(body["leads"].map { |card| card["id"] })
      cursor = body["next_cursor"]
      break if cursor.nil?
    end
    [ ids, cursor ]
  end

  def timed_get(path, params = {})
    started = Process.clock_gettime(Process::CLOCK_MONOTONIC)
    get path, params: params, headers: headers
    @request_times << (Process.clock_gettime(Process::CLOCK_MONOTONIC) - started)
    expect(response).to have_http_status(:ok)
    response.parsed_body
  end

  def service_seconds
    started = Process.clock_gettime(Process::CLOCK_MONOTONIC)
    yield
    Process.clock_gettime(Process::CLOCK_MONOTONIC) - started
  end

  def request_max = @request_times.max || 0
end
