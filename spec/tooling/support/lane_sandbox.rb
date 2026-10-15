# frozen_string_literal: true

require "fileutils"
require "json"
require "open3"
require "tmpdir"

# Runs bin/lane as a black box inside a throwaway git repo: copies of bin/lane, bin/worktree-env and the lane plans,
# a local bare `origin`, and fake `gh` / `opencode` executables first on PATH. Nothing touches the real checkout or GitHub.
class LaneSandbox
  REPO = File.expand_path("../../..", __dir__)

  Result = Struct.new(:out, :err, :status) do
    def success? = status.success?
    def exitstatus = status.exitstatus
  end

  attr_reader :root, :state_path

  def initialize
    @dir = Dir.mktmpdir("lane-sandbox-")
    @root = File.join(@dir, "repo")
    @remote = File.join(@dir, "origin.git")
    @fake_bin = File.join(@dir, "fake-bin")
    @gh_dir = File.join(@dir, "gh")
    @state_path = File.join(@dir, "state.json")
    @stubs = 0
    build
  end

  def cleanup = FileUtils.rm_rf(@dir)

  def lane(*args, chdir: root, env: {})
    out, err, status = Open3.capture3(base_env.merge(env), "python3", File.join(root, "bin/lane"), *args, chdir: chdir)
    Result.new(out, err, status)
  end

  # The first stub whose extended regexp matches the gh arguments wins; stubs added in a test beat the defaults (900+).
  def stub_gh(pattern, out: "", exit_code: 0, err: "", priority: nil)
    name = format("%03d", priority || (@stubs += 1))
    File.write(File.join(@gh_dir, "#{name}.match"), pattern)
    File.write(File.join(@gh_dir, "#{name}.out"), out)
    File.write(File.join(@gh_dir, "#{name}.err"), err)
    File.write(File.join(@gh_dir, "#{name}.exit"), exit_code.to_s)
  end

  def gh_calls = File.exist?(calls_log) ? File.readlines(calls_log, chomp: true) : []

  def state = JSON.parse(File.read(state_path))

  def env_for(extra = {}) = base_env.merge(extra)

  def write_state(hash) = File.write(state_path, JSON.generate(hash))

  def git(*args, chdir: root)
    out, err, status = Open3.capture3(base_env, "git", *args, chdir: chdir)
    raise "git #{args.join(' ')} failed: #{err}" unless status.success?

    out.strip
  end

  def worktree(lane_id) = File.join(root, ".worktrees", lane_id.downcase)

  def start_lane(lane_id)
    res = lane("start", lane_id)
    raise "bin/lane start #{lane_id} failed: #{res.err}#{res.out}" unless res.success?

    worktree(lane_id)
  end

  def commit_in(lane_id, file:, content: "work\n", message: "feat: task 1")
    commit(worktree(lane_id), file, content, message)
  end

  # Someone else pushes a commit to `branch` on origin (from a separate clone).
  def foreign_push(branch, file: "other.txt", content: "someone else\n")
    clone = File.join(@dir, "foreign-#{@stubs += 1}")
    git("clone", "-q", @remote, clone, chdir: @dir)
    git("checkout", "-q", branch, chdir: clone)
    File.write(File.join(clone, file), content)
    git("add", file, chdir: clone)
    git("commit", "-qm", "foreign commit", chdir: clone)
    git("push", "-q", "origin", branch, chdir: clone)
  end

  # Advances origin/main from the sandbox main checkout.
  def commit_on_main(file:, content:)
    commit(root, file, content, "main moves on")
    git("push", "-q", "origin", "main")
  end

  private

  def commit(dir, file, content, message)
    path = File.join(dir, file)
    FileUtils.mkdir_p(File.dirname(path))
    File.write(path, content)
    git("add", file, chdir: dir)
    git("commit", "-qm", message, chdir: dir)
  end

  def calls_log = File.join(@gh_dir, "calls.log")

  def base_env
    {
      "PATH" => "#{@fake_bin}:#{ENV.fetch('PATH')}",
      "LANE_STATE" => state_path,
      "LANE_MODEL" => nil,
      "FAKE_GH_DIR" => @gh_dir,
      "GIT_AUTHOR_NAME" => "sandbox", "GIT_AUTHOR_EMAIL" => "sandbox@example.com",
      "GIT_COMMITTER_NAME" => "sandbox", "GIT_COMMITTER_EMAIL" => "sandbox@example.com"
    }
  end

  def build
    FileUtils.mkdir_p([ File.join(@root, "bin"), File.join(@root, "docs/superpowers/plans"), @fake_bin, @gh_dir ])
    FileUtils.cp(File.join(REPO, "bin/lane"), File.join(@root, "bin/lane"))
    FileUtils.cp(File.join(REPO, "bin/worktree-env"), File.join(@root, "bin/worktree-env"))
    FileUtils.cp(File.join(REPO, "bin/guard-no-health-data"), File.join(@root, "bin/guard-no-health-data"))
    FileUtils.cp_r(File.join(REPO, "docs/superpowers/plans/2026-10"), File.join(@root, "docs/superpowers/plans"))
    File.write(File.join(@root, "opencode.json"), JSON.generate(agent: { lane: { permission: { edit: "allow" } } }))
    File.write(File.join(@root, ".gitignore"), ".env\n.worktrees/\n.superpowers/\n.lane-prompt.md\n")
    File.write(File.join(@root, ".env"), "ANTHROPIC_API_KEY=test\n")
    write_fakes
    git("init", "-q", "--bare", "-b", "main", @remote, chdir: @dir)
    git("init", "-q", "-b", "main")
    git("add", ".")
    git("commit", "-qm", "init")
    git("remote", "add", "origin", @remote)
    git("push", "-q", "origin", "main")
    stub_gh("^pr list", out: "[]", priority: 900)
    stub_gh("^repo view", out: "me/simbe", priority: 901)
  end

  def write_fakes
    gh = <<~BASH
      #!/usr/bin/env bash
      args="$*"
      echo "$args" >> "$FAKE_GH_DIR/calls.log"
      for m in "$FAKE_GH_DIR"/*.match; do
        [ -e "$m" ] || continue
        if printf '%s' "$args" | grep -Eq -- "$(cat "$m")"; then
          base="${m%.match}"
          cat "$base.out"
          cat "$base.err" >&2
          exit "$(cat "$base.exit")"
        fi
      done
      exit 0
    BASH
    opencode = <<~BASH
      #!/usr/bin/env bash
      echo '{"type":"step_start","sessionID":"ses_fake123","part":{"type":"step-start"}}'
      echo "not json noise"
      [ -n "${FAKE_OPENCODE_ARGS:-}" ] && printf '%s\n' "$@" > "$FAKE_OPENCODE_ARGS"
      [ -n "${FAKE_OPENCODE_STDIN:-}" ] && readlink /proc/self/fd/0 > "$FAKE_OPENCODE_STDIN"
      [ -n "${FAKE_OPENCODE_CORRUPT:-}" ] && echo '{not json' > "$FAKE_OPENCODE_CORRUPT"
      [ -n "${FAKE_OPENCODE_TOUCH:-}" ] && touch "$FAKE_OPENCODE_TOUCH"
      sleep "${FAKE_OPENCODE_SLEEP:-0}"
      exit "${FAKE_OPENCODE_EXIT:-0}"
    BASH
    { "gh" => gh, "opencode" => opencode }.each do |name, body|
      path = File.join(@fake_bin, name)
      File.write(path, body)
      File.chmod(0o755, path)
    end
  end
end
