require "open3"
require "tmpdir"
require "fileutils"

# bin/affected-specs picks the specs related to a branch's changes (run after every task instead of the whole suite).
RSpec.describe "bin/affected-specs" do
  let(:script) { File.expand_path("../../bin/affected-specs", __dir__) }
  let(:dir) { Dir.mktmpdir("affected") }

  after { FileUtils.remove_entry(dir) }

  def git(*args) = system("git", "-C", dir, *args, out: File::NULL, err: File::NULL) || raise("git #{args.join(' ')} failed")

  def write(path, body = "")
    full = File.join(dir, path)
    FileUtils.mkdir_p(File.dirname(full))
    File.write(full, body)
  end

  def run_script(*args)
    out, err, status = Open3.capture3("python3", "-I", script, *args, chdir: dir)
    raise "affected-specs failed: #{err}" unless status.success?

    out.lines.map(&:strip).reject(&:empty?)
  end

  before do
    git("init", "-q", "-b", "main")
    git("config", "user.email", "t@t")
    git("config", "user.name", "t")
    write("app/packs/leads/app/services/leads/queues.rb", "module Leads; class Queues; end; end\n")
    write("app/packs/leads/app/services/leads/board.rb", "module Leads; class Board; end; end\n")
    write("spec/services/leads/queues_spec.rb", "RSpec.describe Leads::Queues do; end\n")
    write("spec/services/leads/board_spec.rb", "RSpec.describe Leads::Board do; end\n")
    write("spec/requests/leads_spec.rb", "RSpec.describe 'leads' do; Leads::Queues; end\n")
    write("spec/packs/boundaries_spec.rb", "")
    git("add", "-A")
    git("commit", "-qm", "base")
    git("update-ref", "refs/remotes/origin/main", "HEAD")
  end

  it "selects the spec at the conventional path, every spec naming the changed class, and the guard specs" do
    write("app/packs/leads/app/services/leads/queues.rb", "module Leads; class Queues; def x; end; end; end\n")
    specs = run_script("--rspec")
    expect(specs).to include("spec/services/leads/queues_spec.rb", "spec/requests/leads_spec.rb", "spec/packs/boundaries_spec.rb")
    expect(specs).not_to include("spec/services/leads/board_spec.rb")
  end

  it "includes a changed spec itself" do
    write("spec/services/leads/board_spec.rb", "RSpec.describe Leads::Board do; it('x') {}; end\n")
    expect(run_script("--rspec")).to include("spec/services/leads/board_spec.rb")
  end

  it "selects nothing for Ruby when only the frontend changed, and lists the frontend files" do
    write("app/javascript/features/x/Page.tsx", "export {}\n")
    expect(run_script("--rspec")).to eq([])
    expect(run_script("--vitest")).to eq([ "app/javascript/features/x/Page.tsx" ])
  end

  it "says FULL for a broad change (Gemfile, config, db, contracts) and SELECTIVE otherwise" do
    write("app/packs/leads/app/services/leads/queues.rb", "module Leads; class Queues; def y; end; end; end\n")
    expect(run_script("--full")).to eq([ "SELECTIVE" ])
    write("config/routes.rb", "# changed\n")
    expect(run_script("--full")).to eq([ "FULL" ])
  end
end
