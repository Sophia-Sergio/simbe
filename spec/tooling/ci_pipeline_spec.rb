require "json"
require "yaml"
require "uri"
require "tmpdir"
require "open3"

# Static guards on .github/workflows/ci.yml, bin/lane-id-from-branch and bin/ci-parity: the
# mistakes review round 1 found in the pipeline cannot come back unnoticed.
RSpec.describe "CI pipeline" do
  let(:root) { Pathname.new(File.expand_path("../..", __dir__)) }
  let(:workflow) { YAML.safe_load(File.read(root.join(".github/workflows/ci.yml")), aliases: true) }
  let(:steps) { workflow.fetch("jobs").flat_map { |name, job| job.fetch("steps", []).map { |step| [ name, step ] } } }

  it "gives every database URL a database name (database.yml rewrites the last path segment)" do
    urls = File.read(root.join(".github/workflows/ci.yml")).scan(%r{DATABASE_URL:\s*"?(postgres://[^\s"]+)})
    expect(urls).not_to be_empty
    urls.flatten.each { |url| expect(URI.parse(url).path).to match(%r{\A/\w+}), "#{url} has no database name" }
  end

  it "never skips CI on main (strict: false means the squashed commit was never tested)" do
    expect(workflow.fetch("jobs")).not_to have_key("decide")
    expect(File.read(root.join(".github/workflows/ci.yml"))).not_to include("needs.decide")
  end

  it "makes deploy wait for every other gating job of the same run" do
    deploy = workflow.fetch("jobs").fetch("deploy")
    gating = workflow.fetch("jobs").keys - %w[deploy e2e_real ownership_check]
    expect(deploy.fetch("needs")).to match_array(gating)
    expect(deploy.fetch("if")).not_to include("always()")
  end

  it "pins every third-party action to a commit SHA" do
    first_party = %r{\A(actions|docker|ruby)/}
    uses = steps.filter_map { |_, step| step["uses"] }.reject { |u| u.match?(first_party) }
    expect(uses).not_to be_empty
    uses.each { |u| expect(u).to match(/@\h{40}\z/), "#{u} is not pinned to a SHA" }
  end

  it "has a timeout on every job" do
    workflow.fetch("jobs").each { |name, job| expect(job["timeout-minutes"]).to be_a(Integer), "#{name} has no timeout-minutes" }
  end

  it "uploads Playwright traces from where Playwright writes them" do
    text = File.read(root.join(".github/workflows/ci.yml"))
    expect(text).to include("e2e/test-results")
    expect(text).not_to match(%r{^\s+test-results\s*$})
  end

  it "runs when the e2e label is added" do
    expect(workflow.fetch(true).fetch("pull_request").fetch("types")).to include("labeled")
  end

  it "fails the deploy smoke check when the SPA shell or the auth boundary is wrong" do
    smoke = steps.map(&:last).find { |s| s["name"].to_s.start_with?("Health checks") }
    expect(smoke["shell"]).to eq("bash")
    expect(smoke["run"]).to include('|| { echo "SPA shell missing"; exit 1; }')
    expect(smoke["run"]).not_to include("&& echo \"GET / returned")
  end

  it "requires exactly the CI jobs (by display name) that bin/setup-github lists, so a rename cannot block every merge" do
    listed = JSON.parse(File.read(root.join("bin/setup-github"))[/^ci_checks='(.+)'$/, 1])
    names = workflow.fetch("jobs").transform_values { |job| job["name"] }
    optional = names.values_at("deploy", "e2e_real", "ownership_check")
    expect(listed).to match_array(names.values - optional)
  end

  it "keeps the nightly run from cancelling a push run (separate concurrency groups per event)" do
    expect(workflow.fetch("concurrency").fetch("group")).to include("github.event_name")
  end

  it "checks that the gitleaks allowlist is a single [allowlist] table (the pinned gitleaks ignores [[allowlists]])" do
    toml = File.read(root.join(".gitleaks.toml"))
    expect(toml).to match(/^\[allowlist\]$/)
    expect(toml).not_to match(/^\[\[allowlists\]\]/)
    expect(toml).to match(/commits = \["\h{40}"\]/)
  end

  describe "bin/lane-id-from-branch" do
    {
      "lane/W0-7-ci-cd-pipeline" => "W0-7",
      "lane/W0-3-backend-core" => "W0-3",
      "lane/W0-4A-ui-kit-primitives" => "W0-4A",
      "lane/B-INGEST-importer" => "B-INGEST",
      "lane/F-WEEK-this-week" => "F-WEEK",
      "lane/W3-1-integration-real-api" => "W3-1"
    }.each do |branch, id|
      it "maps #{branch} to #{id}" do
        out, status = Open3.capture2(root.join("bin/lane-id-from-branch").to_s, branch)
        expect(status).to be_success
        expect(out.strip).to eq(id)
      end
    end

    it "rejects a branch that is not a lane branch" do
      _out, _err, status = Open3.capture3(root.join("bin/lane-id-from-branch").to_s, "feature/whatever")
      expect(status).not_to be_success
    end
  end

  describe "bin/ci-parity" do
    def run_parity(workflow_text, local: "npm audit --omit=dev --audit-level=high")
      Dir.mktmpdir do |dir|
        path = File.join(dir, "ci.yml")
        File.write(path, workflow_text)
        parity = root.join("bin/ci-parity").to_s
        load_helper = <<~PY
          import importlib.machinery, importlib.util, sys
          loader = importlib.machinery.SourceFileLoader("ci_parity", #{parity.inspect})
          spec = importlib.util.spec_from_loader("ci_parity", loader)
          mod = importlib.util.module_from_spec(spec); loader.exec_module(mod)
          problems, _ = mod.problems_for(open(#{path.inspect}).read(), #{local.inspect})
          print("\\n".join(problems))
        PY
        out, status = Open3.capture2({ "PYTHONDONTWRITEBYTECODE" => "1" }, "python3", "-c", load_helper)
        raise "helper failed" unless status.success?
        out.lines.map(&:strip).reject(&:empty?)
      end
    end

    def wf(step)
      "jobs:\n  a:\n    steps:\n#{step}"
    end

    it "accepts a marked step whose flags match" do
      expect(run_parity(wf("      - run: npm audit --omit=dev --audit-level=high   # parity\n"))).to eq([])
    end

    it "fails a run step that is marked neither parity nor ci-only" do
      problems = run_parity(wf("      - run: echo hello\n"))
      expect(problems.join).to match(/no `# parity` or `# ci-only` marker/)
    end

    it "accepts a ci-only step" do
      expect(run_parity(wf("      - run: npm ci   # ci-only\n"))).to eq([])
    end

    it "fails when CI audits with different flags than make verify" do
      problems = run_parity(wf("      - run: npm audit --audit-level=high   # parity\n"))
      expect(problems.join).to match(/npm-audit.*runs with/)
    end

    it "fails a parity check that make verify does not run" do
      problems = run_parity(wf("      - run: npx knip   # parity\n"))
      expect(problems.join).to match(/'knip' is in CI/)
    end

    it "reads a marker on the name line of a multi-line step" do
      step = "      - name: Several checks   # ci-only\n        run: |\n          echo one\n          echo two\n"
      expect(run_parity(wf(step))).to eq([])
    end
  end
end
