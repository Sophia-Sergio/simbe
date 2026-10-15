# Lane Conductor Tooling Implementation Plan

> **For Cursor / OpenCode:** Implement task-by-task. Follow `docs/conventions/`. Stop if blocked — do not replan silently. **Commit after every task** (`tooling(conductor): task N – <title>`).
> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give `bin/lane` the commands the lane conductor needs (`next`, `state`, state-recording `run`, PR-updating `pr`, `ci`, `rebase`) plus the batch-approval docs, all covered by RSpec black-box specs.
**Spec:** `docs/superpowers/specs/2026-10/2026-10-14-2330-lane-conductor-design.md`
**Depends on:** W0-1 merged (Makefile, Docker `web`, RSpec) and the review-gate tooling on `main` (`bin/lane` with the OpenCode 2.x `lane` agent and auto-merge, `bin/setup-github` stage 1/2, `opencode.json`) — Task 1 checks both · **Unblocks:** running Wave 0 (after the W0-1 pilot) and Wave 1 in conductor mode
**Files owned (not a lane; no lane's `Owns` overlaps):** `bin/lane`, `bin/setup-github` (header already trimmed in this branch), `opencode.json` (the `lane` agent allowlist; W0-7's `Owns` lists the file, so W0-7 must rebase onto this change), `spec/tooling/**`, `docs/superpowers/parallel/{review-gate,playbook,README}.md`
**Architecture:** `bin/lane` stays one stdlib-Python file. New code goes in a "conductor" section: a JSON state store (`LANE_STATE` or `.superpowers/orchestrator/state.json` in the main checkout), a scheduler built on the existing `direct_deps`, and thin wrappers over `git`/`gh`. Specs run `bin/lane` as a subprocess inside a throwaway git repo with a local bare `origin` and fake `gh`/`opencode` executables, so they never touch the real checkout, GitHub or a model.
**Tech Stack:** Python 3 stdlib (`bin/lane`), RSpec + `Open3` (specs), git, GitHub CLI.

## Global Constraints

- `bin/lane` imports only the Python standard library and stays a single file; match its compact style (one-line helpers, `sh(...)`, `sys.exit("message")` for user errors).
- Tests are **RSpec only**, in `spec/tooling/`, `require "spec_helper"` (no database, no `rails_helper`). No Python test suite.
- Specs never call the real `gh`, `opencode`, GitHub or the real checkout: everything goes through `LaneSandbox` (Task 1).
- Run specs with `make spec ARGS=spec/tooling` (Docker). Run `make verify` before every commit; do not commit while it fails.
- Do not edit any lane plan, any lane's `Owns` files, `opencode.json` or the OpenCode permission set.
- State keys and phases are exactly those in the spec: phases `queued running verifying fixing ready approved ci merged blocked`; lane keys `phase session model log fix_rounds ci_rounds pr head blocked_reason` (+ `updated_at`, written automatically); caps `max_running=4 max_stacks=5 max_waiting=4`; model tiers `top mid cheap`.
- Tier map (copied from the playbook): top = W0-1, W0-3, W0-5, B-INGEST, B-AGENT, W3-1; cheap = F-COORDINATORS, F-SEARCH, F-SETTINGS, F-CONNECT; mid = every other lane.

## Review Focus

1. **Corrupt state file** (half-written JSON after a crash): every command must fail with a message naming the state file and must not overwrite it. Test in Task 1.
2. **OpenCode times out**: the lane must stay reviewable (`phase=verifying`, session id kept, exit 4) rather than crash with a traceback. Test in Task 3.
3. **A new commit after approval** (CI fix): `bin/lane pr` must refuse to publish it until it is re-approved, and when re-approved must update the same PR. Tests in Task 4.
4. **Rebase conflict**: `bin/lane rebase` must abort the rebase and leave the worktree exactly as before (same HEAD, no rebase in progress). Test in Task 5.
5. **Open `ccr` PR**: `bin/lane next` must start nothing and say why on stderr. Test in Task 2.

## File Map

| Action | Path |
|---|---|
| Modify | `bin/lane` (imports, docstring, conductor section, `cmd_status`, `cmd_run`, `cmd_canary`, `cmd_pr`, `main`) |
| Modify | `opencode.json` (Task 6) |
| Create | `spec/tooling/opencode_config_spec.rb` (Task 6) |
| Create | `spec/tooling/support/lane_sandbox.rb` |
| Create | `spec/tooling/lane_state_spec.rb` |
| Create | `spec/tooling/lane_next_spec.rb` |
| Create | `spec/tooling/lane_run_spec.rb` |
| Create | `spec/tooling/lane_pr_spec.rb` |
| Create | `spec/tooling/lane_ci_rebase_spec.rb` |
| Modify | `docs/superpowers/parallel/review-gate.md`, `docs/superpowers/parallel/playbook.md`, `docs/superpowers/parallel/README.md` |

---

## Task 1: Prerequisites, test sandbox and `bin/lane state`

**Files:** Create `spec/tooling/support/lane_sandbox.rb`, `spec/tooling/lane_state_spec.rb`; modify `bin/lane`.

**Interfaces — Produces:**
- Python: `STATE_PATH: str`, `PHASES: list`, `LANE_KEYS: set`, `DEFAULT_CAPS: dict`, `TIERS: dict`, `tier_of(lane_id) -> "top"|"mid"|"cheap"`, `load_state() -> {"caps","models","lanes"}`, `save_state(state) -> None`, `parse_pairs(list[str]) -> dict`, `update_lane(lane_id, **fields) -> dict`, `cmd_state(a)`.
- CLI: `bin/lane state show [LANE]`, `state set LANE key=value…`, `state set-caps key=value…`, `state set-models tier=model…`.
- Ruby: `LaneSandbox.new`, `#lane(*args, chdir:, env:) -> Result(out, err, status)` with `#success?`/`#exitstatus`, `#stub_gh(pattern, out:, exit_code:, priority:)`, `#gh_calls -> [String]`, `#state -> Hash`, `#write_state(Hash)`, `#git(*args, chdir:) -> String`, `#worktree(id) -> path`, `#start_lane(id) -> path`, `#commit_in(id, file:, content:, message:)`, `#commit_on_main(file:, content:)`, `#root`, `#state_path`, `#cleanup`.

- [ ] **Step 1: Check the prerequisites (STOP if any line fails; report which)**

```bash
make up
test -f Makefile && test -f spec/spec_helper.rb && echo "W0-1 ok"
docker compose exec web python3 --version && docker compose exec web git --version
grep -q 'auto_merge' bin/lane && grep -q '"lane"' opencode.json && grep -q 'claude-review' bin/setup-github && echo "review-gate tooling ok"
```
Expected: `W0-1 ok`, a Python 3.x and a git version, `review-gate tooling ok`. A missing `python3`/`git` in `web` is a W0-1 ownership change (`Dockerfile.dev`), not something to work around here.

- [ ] **Step 2: Write the sandbox helper**

`spec/tooling/support/lane_sandbox.rb`:

```ruby
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
  def stub_gh(pattern, out: "", exit_code: 0, priority: nil)
    name = format("%03d", priority || (@stubs += 1))
    File.write(File.join(@gh_dir, "#{name}.match"), pattern)
    File.write(File.join(@gh_dir, "#{name}.out"), out)
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
```

- [ ] **Step 3: Write the failing spec**

`spec/tooling/lane_state_spec.rb`:

```ruby
# frozen_string_literal: true

require "spec_helper"
require_relative "support/lane_sandbox"

RSpec.describe "bin/lane state" do
  let(:sandbox) { LaneSandbox.new }

  after { sandbox.cleanup }

  it "records lane fields and shows them" do
    expect(sandbox.lane("state", "set", "F-WEEK", "phase=running", "session=abc")).to be_success
    expect(JSON.parse(sandbox.lane("state", "show", "F-WEEK").out)).to include("phase" => "running", "session" => "abc")
  end

  it "stores the canonical lane id whatever the case typed" do
    sandbox.lane("state", "set", "f-week", "phase=queued")
    expect(sandbox.state["lanes"].keys).to eq([ "F-WEEK" ])
  end

  it "rejects an unknown phase, key or lane without writing anything" do
    expect(sandbox.lane("state", "set", "F-WEEK", "phase=bogus")).not_to be_success
    expect(sandbox.lane("state", "set", "F-WEEK", "colour=red")).not_to be_success
    expect(sandbox.lane("state", "set", "NOPE", "phase=queued")).not_to be_success
    expect(File.exist?(sandbox.state_path)).to be(false)
  end

  it "stores round counters as integers" do
    sandbox.lane("state", "set", "B-LEADS", "fix_rounds=2")
    expect(sandbox.state.dig("lanes", "B-LEADS", "fix_rounds")).to eq(2)
  end

  it "starts from the default caps and lets them change" do
    expect(JSON.parse(sandbox.lane("state", "show").out)["caps"]).to eq("max_running" => 4, "max_stacks" => 5, "max_waiting" => 4)
    sandbox.lane("state", "set-caps", "max_running=2")
    expect(sandbox.state.dig("caps", "max_running")).to eq(2)
    expect(sandbox.lane("state", "set-caps", "max_cats=1")).not_to be_success
  end

  it "stores one model per tier" do
    sandbox.lane("state", "set-models", "top=p/strong", "cheap=p/small")
    expect(sandbox.state["models"]).to eq("top" => "p/strong", "cheap" => "p/small")
    expect(sandbox.lane("state", "set-models", "huge=p/x")).not_to be_success
  end

  it "refuses to touch a corrupt state file" do
    File.write(sandbox.state_path, "{not json")
    res = sandbox.lane("state", "set", "F-WEEK", "phase=queued")
    expect(res).not_to be_success
    expect(res.err).to include("state file")
    expect(File.read(sandbox.state_path)).to eq("{not json")
  end
end
```

- [ ] **Step 4: Run it, expect FAIL**

Run: `make spec ARGS=spec/tooling/lane_state_spec.rb`
Expected: FAIL — `bin/lane` prints `invalid choice: 'state'`.

- [ ] **Step 5: Implement**

In `bin/lane`, change the import line to:

```python
import argparse, os, re, subprocess, sys, glob, json, time, datetime
```

Add to the module docstring, after the `bin/lane stop` line:

```
  bin/lane next [--json] [--assume-merged IDS] [--limit N]   lanes that may start now (conductor)
  bin/lane state show|set|set-caps|set-models …              conductor state (.superpowers/orchestrator/state.json or $LANE_STATE)
  bin/lane ci F-WEEK                    wait for the PR checks; print failing job logs
  bin/lane rebase F-WEEK                rebase the lane on origin/main and print a range-diff
```

Append this section just above `def cmd_stop(a):`:

```python
# ---------------------------------------------------------------- conductor (docs/superpowers/specs/2026-10/2026-10-14-2330-lane-conductor-design.md)
STATE_PATH = os.environ.get("LANE_STATE") or os.path.join(MAIN_ROOT, ".superpowers", "orchestrator", "state.json")
PHASES = ["queued", "running", "verifying", "fixing", "ready", "approved", "ci", "merged", "blocked"]
LANE_KEYS = {"phase", "session", "model", "log", "fix_rounds", "ci_rounds", "pr", "head", "blocked_reason"}
INT_KEYS = {"fix_rounds", "ci_rounds"}
DEFAULT_CAPS = {"max_running": 4, "max_stacks": 5, "max_waiting": 4}
TIERS = {"top": {"W0-1", "W0-3", "W0-5", "B-INGEST", "B-AGENT", "W3-1"}, "cheap": {"F-COORDINATORS", "F-SEARCH", "F-SETTINGS", "F-CONNECT"}}

def tier_of(lane_id): return next((t for t, ids in TIERS.items() if lane_id in ids), "mid")

def load_state():
    try:
        with open(STATE_PATH) as f: s = json.load(f)
    except FileNotFoundError: s = {}
    except ValueError as e: sys.exit(f"corrupt state file {STATE_PATH}: {e}. Fix or delete it (GitHub still holds PR/merge state).")
    s.setdefault("models", {}); s.setdefault("lanes", {})
    s["caps"] = {**DEFAULT_CAPS, **s.get("caps", {})}
    return s

def save_state(s):
    os.makedirs(os.path.dirname(STATE_PATH), exist_ok=True)
    tmp = STATE_PATH + ".tmp"
    with open(tmp, "w") as f: json.dump(s, f, indent=2, sort_keys=True)
    os.replace(tmp, STATE_PATH)

def parse_pairs(pairs):
    out = {}
    for p in pairs:
        if "=" not in p: sys.exit(f"expected key=value, got {p!r}")
        k, v = p.split("=", 1); out[k] = v
    return out

def update_lane(lane_id, **fields):
    bad = set(fields) - LANE_KEYS
    if bad: sys.exit(f"unknown state key(s): {', '.join(sorted(bad))} (allowed: {', '.join(sorted(LANE_KEYS))})")
    if "phase" in fields and fields["phase"] not in PHASES: sys.exit(f"unknown phase {fields['phase']!r} (allowed: {', '.join(PHASES)})")
    for k in INT_KEYS & set(fields):
        try: fields[k] = int(fields[k])
        except ValueError: sys.exit(f"{k} must be an integer")
    s = load_state(); rec = s["lanes"].setdefault(lane_id, {})
    rec.update(fields); rec["updated_at"] = datetime.datetime.now().isoformat(timespec="seconds")
    save_state(s); return rec

def cmd_state(a):
    if a.action == "show":
        s = load_state()
        print(json.dumps(s["lanes"].get(get_lane(a.args[0])["id"], {}) if a.args else s, indent=2, sort_keys=True)); return
    if a.action == "set":
        if not a.args: sys.exit("usage: bin/lane state set LANE key=value ...")
        print(json.dumps(update_lane(get_lane(a.args[0])["id"], **parse_pairs(a.args[1:])), indent=2, sort_keys=True)); return
    s, pairs = load_state(), parse_pairs(a.args)
    allowed = set(DEFAULT_CAPS) if a.action == "set-caps" else set(TIERS) | {"mid"}
    bad = set(pairs) - allowed
    if bad: sys.exit(f"unknown {a.action[4:]} key(s): {', '.join(sorted(bad))} (allowed: {', '.join(sorted(allowed))})")
    if a.action == "set-caps":
        try: s["caps"].update({k: int(v) for k, v in pairs.items()})
        except ValueError: sys.exit("caps must be integers")
    else: s["models"].update(pairs)
    save_state(s); print(json.dumps({k: s[k] for k in ("caps", "models")}, indent=2, sort_keys=True))
```

In `main()`, before the `t = sub.add_parser("stop")` line, add:

```python
    st = sub.add_parser("state"); st.add_argument("action", choices=["show", "set", "set-caps", "set-models"]); st.add_argument("args", nargs="*"); st.set_defaults(f=cmd_state)
```

- [ ] **Step 6: Run it, expect PASS**

Run: `make spec ARGS=spec/tooling/lane_state_spec.rb`
Expected: 7 examples, 0 failures.

- [ ] **Step 7: Verify and commit**

```bash
make verify
git add bin/lane spec/tooling
git commit -m "tooling(conductor): task 1 – test sandbox and bin/lane state"
```

---

## Task 2: `bin/lane next` (scheduler)

**Files:** Create `spec/tooling/lane_next_spec.rb`; modify `bin/lane` (`cmd_status`, conductor section, `main`).

**Interfaces — Consumes:** `lanes()`, `direct_deps(ls)`, `get_lane(id)`, `load_state()`, `tier_of(id)` (Task 1). **Produces:** `lane_states(ls) -> {id: (state, link)}` with state in `merged | PR open | draft PR | in progress | not started`; `has_worktree(id) -> bool`; `ccr_open() -> bool`; `transitive_dependents(deps) -> {id: int}`; `ready_lanes(ls, merged: set, started: set, limit=None) -> [id]`; `cap_room(ls, state) -> (room: int, stack_room: int)`; CLI `bin/lane next [--json] [--assume-merged IDS] [--limit N]`.

- [ ] **Step 1: Write the failing spec**

`spec/tooling/lane_next_spec.rb`:

```ruby
# frozen_string_literal: true

require "spec_helper"
require_relative "support/lane_sandbox"

RSpec.describe "bin/lane next" do
  let(:sandbox) { LaneSandbox.new }

  after { sandbox.cleanup }

  def next_ids(*args)
    res = sandbox.lane("next", "--json", *args)
    raise "bin/lane next failed: #{res.err}" unless res.success?

    JSON.parse(res.out)
  end

  def merged_pr(lane_id) = { "headRefName" => "lane/#{lane_id}-x", "state" => "MERGED", "url" => "https://gh/#{lane_id}", "isDraft" => false }

  def merged_on_github(*ids) = sandbox.stub_gh("^pr list --state all", out: JSON.generate(ids.map { |id| merged_pr(id) }))

  describe "--assume-merged (offline what-if)" do
    it "offers only W0-1 when nothing is merged" do
      expect(next_ids("--assume-merged", "")).to eq([ "W0-1" ])
    end

    it "offers the four lanes W0-1 unblocks, critical path first" do
      expect(next_ids("--assume-merged", "W0-1")).to eq(%w[W0-4A W0-2 W0-3 W0-7])
    end

    it "adds the five backend lanes once W0-3 is merged" do
      expect(next_ids("--assume-merged", "W0-1,W0-3")).to include("B-INGEST", "B-METRICS", "B-LEADS", "B-ACTIONS", "B-ACCOUNT")
    end

    it "never offers a lane before its prerequisites" do
      expect(next_ids("--assume-merged", "W0-1,W0-3")).not_to include("B-AGENT", "B-MCP", "F-WEEK")
    end

    it "honours --limit" do
      expect(next_ids("--assume-merged", "W0-1,W0-3", "--limit", "2").size).to eq(2)
    end

    it "does not call GitHub" do
      next_ids("--assume-merged", "W0-1")
      expect(sandbox.gh_calls).to be_empty
    end

    it "rejects an unknown lane id" do
      expect(sandbox.lane("next", "--assume-merged", "W9-9")).not_to be_success
    end
  end

  describe "live (GitHub + state)" do
    before { merged_on_github("W0-1", "W0-3") }

    it "uses the merged PRs on GitHub" do
      sandbox.write_state("caps" => { "max_running" => 20 }) # the default cap of 4 would cut the 8 ready lanes
      expect(next_ids).to include("W0-2", "B-LEADS")
    end

    it "skips a lane that already has a worktree" do
      sandbox.start_lane("W0-2")
      expect(next_ids).not_to include("W0-2")
    end

    it "starts nothing while a ccr PR is open, and says why" do
      sandbox.stub_gh("^pr list --state open --label ccr", out: '[{"number": 7}]')
      res = sandbox.lane("next", "--json")
      expect(JSON.parse(res.out)).to eq([])
      expect(res.err).to include("ccr")
    end

    it "starts nothing when max_waiting lanes wait for review" do
      sandbox.write_state("lanes" => %w[W0-2 W0-4A W0-7 B-LEADS].to_h { |id| [ id, { "phase" => "ready" } ] })
      expect(next_ids).to eq([])
    end

    it "fills only the free running slots and skips lanes the state marks as started" do
      sandbox.write_state("caps" => { "max_running" => 3 }, "lanes" => { "W0-2" => { "phase" => "running" } })
      ids = next_ids
      expect(ids.size).to eq(2)
      expect(ids).not_to include("W0-2")
    end

    it "stops offering Docker lanes at max_stacks but still offers frontend lanes" do
      substrate = %w[W0-1 W0-2 W0-3 W0-4A W0-4B W0-5 W0-6A W0-6B]
      sandbox.stub_gh("^pr list --state all", out: JSON.generate(substrate.map { |id| merged_pr(id) }), priority: 0)
      sandbox.write_state("caps" => { "max_stacks" => 0, "max_running" => 20 })
      ids = next_ids
      expect(ids.size).to eq(13)
      expect(ids).to all(start_with("F-"))
    end
  end
end
```

(The last example stubs with `priority: 0` so it beats the `before` block's stub: the first matching stub wins.)

- [ ] **Step 2: Run it, expect FAIL**

Run: `make spec ARGS=spec/tooling/lane_next_spec.rb`
Expected: FAIL — `invalid choice: 'next'`.

- [ ] **Step 3: Implement**

Replace the whole `cmd_status` function with:

```python
def lane_states(ls):
    """lane -> (state, link) from GitHub: merged / PR open / draft PR / in progress / not started."""
    prs = json.loads(sh("gh", "pr", "list", "--state", "all", "--limit", "300", "--json", "headRefName,state,url,isDraft") or "[]")
    heads = sh("git", "ls-remote", "--heads", "origin", "lane/*").splitlines()
    branches = [h.split("refs/heads/")[1] for h in heads if "refs/heads/" in h]
    out = {}
    for k in ls:
        pre = f"lane/{k}-"
        mine = [p for p in prs if p["headRefName"].startswith(pre)]
        if any(p["state"] == "MERGED" for p in mine): out[k] = ("merged", next(p["url"] for p in mine if p["state"] == "MERGED"))
        elif any(p["state"] == "OPEN" for p in mine):
            p = next(p for p in mine if p["state"] == "OPEN"); out[k] = ("draft PR" if p["isDraft"] else "PR open", p["url"])
        elif any(b.startswith(pre) for b in branches): out[k] = ("in progress", next(b for b in branches if b.startswith(pre)))
        else: out[k] = ("not started", "")
    return out

def cmd_status(a):
    ls = lanes(); st = lane_states(ls)
    print(f"{'LANE':<14}{'WAVE':<6}{'STATE':<16}LINK")
    for l in sorted(ls.values(), key=lambda x: (x["wave"], x["id"])):
        state, link = st[l["id"]]
        print(f"{l['id']:<14}{l['wave']:<6}{state:<16}{link}")
```

Append to the conductor section (after `cmd_state`):

```python
def has_worktree(lane_id): return os.path.isdir(os.path.join(MAIN_ROOT, ".worktrees", lane_id.lower()))

def ccr_open(): return bool(json.loads(sh("gh", "pr", "list", "--state", "open", "--label", "ccr", "--json", "number") or "[]"))

def transitive_dependents(deps):
    """lane -> how many lanes wait for it, directly or not (the critical-path weight)."""
    rev = {k: set() for k in deps}
    for k, ds in deps.items():
        for d in ds: rev[d].add(k)
    def reach(k, seen):
        for n in rev[k]:
            if n not in seen: seen.add(n); reach(n, seen)
        return seen
    return {k: len(reach(k, set())) for k in deps}

def ready_lanes(ls, merged, started, limit=None):
    deps = direct_deps(ls); weight = transitive_dependents(deps)
    cands = sorted((k for k in ls if k not in merged and k not in started and deps[k] <= merged), key=lambda k: (-weight[k], ls[k]["wave"], k))
    return cands if limit is None else cands[:max(limit, 0)]

def cap_room(ls, state):
    """(lanes that may start, of which non-F lanes that may still get a Docker stack) under state['caps']."""
    caps, recs = state["caps"], state["lanes"]
    phase = lambda k: recs.get(k, {}).get("phase")
    running = sum(phase(k) in ("running", "verifying", "fixing") for k in ls)
    waiting = sum(phase(k) in ("ready", "approved", "ci") for k in ls)
    stacks = sum(not k.startswith("F-") and has_worktree(k) for k in ls)
    room = 0 if waiting >= caps["max_waiting"] else max(caps["max_running"] - running, 0)
    return room, max(caps["max_stacks"] - stacks, 0)

def cmd_next(a):
    """Lanes that may start now: prerequisites merged, not started, no open ccr; critical path first; within the caps."""
    ls = lanes()
    if a.assume_merged is not None:
        merged = {get_lane(x.strip())["id"] for x in a.assume_merged.split(",") if x.strip()}
        out = ready_lanes(ls, merged, set(), a.limit)
    elif ccr_open():
        print("paused: a `ccr` PR is open; merge it and rebase the open lanes first (bin/lane rebase <LANE>)", file=sys.stderr); out = []
    else:
        st, state = lane_states(ls), load_state()
        merged = {k for k, (s, _) in st.items() if s == "merged"}
        started = ({k for k, (s, _) in st.items() if s != "not started"} | {k for k in ls if has_worktree(k)}
                   | {k for k, r in state["lanes"].items() if r.get("phase") not in (None, "queued")})
        room, stack_room = cap_room(ls, state); out = []
        for k in ready_lanes(ls, merged, started):
            if len(out) >= room or (a.limit is not None and len(out) >= a.limit): break
            if not k.startswith("F-"):
                if stack_room <= 0: continue
                stack_room -= 1
            out.append(k)
    if a.json: print(json.dumps(out)); return
    for k in out: print(f"{k:<14}{ls[k]['wave']:<6}{tier_of(k):<7}{ls[k]['rel']}")
```

In `main()`, after the `state` parser line, add:

```python
    n = sub.add_parser("next"); n.add_argument("--json", action="store_true"); n.add_argument("--assume-merged"); n.add_argument("--limit", type=int); n.set_defaults(f=cmd_next)
```

- [ ] **Step 4: Run it, expect PASS**

Run: `make spec ARGS=spec/tooling`
Expected: all examples pass (Task 1 + 13 new).

- [ ] **Step 5: Verify and commit**

```bash
make verify
git add bin/lane spec/tooling/lane_next_spec.rb
git commit -m "tooling(conductor): task 2 – bin/lane next (scheduler with caps and ccr pause)"
```

---

## Task 3: `bin/lane run` records state, tier model and session id

**Files:** Create `spec/tooling/lane_run_spec.rb`; modify `bin/lane` (`cmd_run`, conductor section, `main`).

**Interfaces — Consumes:** `update_lane`, `load_state`, `tier_of` (Task 1); existing `worktree_of`, `gate_dir`, `require_lane_agent`, `opencode_bin`, `main_state`, `prompt_for`. **Produces:** `session_id(log_path) -> str|None`; `bin/lane run` exits 0 (ran), 3 (tripwire, `phase=blocked`), 4 (timed out, `phase=verifying`); `--timeout` accepts fractional minutes; `--prompt-file PATH` replaces the lane prompt on a fix round.

- [ ] **Step 1: Write the failing spec**

`spec/tooling/lane_run_spec.rb`:

```ruby
# frozen_string_literal: true

require "spec_helper"
require_relative "support/lane_sandbox"

RSpec.describe "bin/lane run" do
  let(:sandbox) { LaneSandbox.new }

  before { sandbox.start_lane("F-WEEK") }

  after { sandbox.cleanup }

  def record = sandbox.state.dig("lanes", "F-WEEK")

  it "records running, then verifying with the session id from the event log" do
    res = sandbox.lane("run", "F-WEEK", "--model", "p/m")
    expect(res).to be_success, res.err + res.out
    expect(record).to include("phase" => "verifying", "session" => "ses_fake123", "model" => "p/m")
    expect(File.exist?(record["log"])).to be(true)
  end

  it "uses the lane's tier model from the state when no --model is given" do
    sandbox.lane("state", "set-models", "mid=p/mid", "cheap=p/cheap")
    sandbox.start_lane("F-SEARCH")
    sandbox.lane("run", "F-WEEK")
    sandbox.lane("run", "F-SEARCH")
    expect(record["model"]).to eq("p/mid")
    expect(sandbox.state.dig("lanes", "F-SEARCH", "model")).to eq("p/cheap")
  end

  it "refuses to run without any model" do
    res = sandbox.lane("run", "F-WEEK")
    expect(res).not_to be_success
    expect(res.err).to include("--model")
  end

  it "sends the findings instead of the lane prompt on a fix round, keeping the gated-run rules" do
    findings = File.join(sandbox.root, "..", "findings.md")
    args = File.join(sandbox.root, "..", "args.txt")
    File.write(findings, "Fix: spec/x_spec.rb expects 3, got 4")
    res = sandbox.lane("run", "F-WEEK", "--model", "p/m", "--session", "ses_1", "--prompt-file", findings, env: { "FAKE_OPENCODE_ARGS" => args })
    expect(res).to be_success, res.err + res.out
    sent = File.read(args)
    expect(sent).to include("ses_1", "Fix: spec/x_spec.rb expects 3, got 4", "GATED RUN RULES", "edit tool")
    expect(sent).not_to include("Implement `@")
  end

  it "starts OpenCode with stdin closed even when the caller's stdin is an open pipe (otherwise it waits for EOF forever)" do
    seen = File.join(sandbox.root, "..", "stdin.txt")
    cmd = [ "python3", File.join(sandbox.root, "bin/lane"), "run", "F-WEEK", "--model", "p/m" ]
    Open3.popen3(sandbox.env_for("FAKE_OPENCODE_STDIN" => seen), *cmd, chdir: sandbox.root) do |stdin, out, err, wait|
      out.read
      err.read
      wait.value # the caller's stdin is deliberately left open until here
      stdin.close
    end
    expect(File.read(seen).strip).to eq("/dev/null")
  end

  it "writes no state on --dry-run" do
    sandbox.lane("run", "F-WEEK", "--model", "p/m", "--dry-run")
    expect(File.exist?(sandbox.state_path)).to be(false)
  end

  it "keeps the lane reviewable when OpenCode times out" do
    res = sandbox.lane("run", "F-WEEK", "--model", "p/m", "--timeout", "0.02", env: { "FAKE_OPENCODE_SLEEP" => "5" })
    expect(res.exitstatus).to eq(4)
    expect(res.out).to include("timed out")
    expect(record).to include("phase" => "verifying", "session" => "ses_fake123")
  end

  it "blocks the lane when the main checkout changes during the run" do
    res = sandbox.lane("run", "F-WEEK", "--model", "p/m", env: { "FAKE_OPENCODE_TOUCH" => File.join(sandbox.root, "escaped.txt") })
    expect(res.exitstatus).to eq(3)
    expect(record["phase"]).to eq("blocked")
    expect(record["blocked_reason"]).to include("main checkout")
  end
end
```

- [ ] **Step 2: Run it, expect FAIL**

Run: `make spec ARGS=spec/tooling/lane_run_spec.rb`
Expected: FAIL — no `state.json` is written by `run` (the first example raises `Errno::ENOENT` reading the state) and `--timeout 0.02` is rejected as `invalid int value`.

- [ ] **Step 3: Implement**

Append to the conductor section:

```python
def session_id(log):
    """The OpenCode session id from a `--format json` event log (every event carries `sessionID`)."""
    with open(log) as f:
        for line in f:
            line = line.strip()
            if not line.startswith("{"): continue
            try: e = json.loads(line)
            except ValueError: continue
            sid = e.get("sessionID") or (e.get("part") or {}).get("sessionID")
            if sid: return sid
    return None
```

Replace the whole `cmd_run` function with:

```python
def cmd_run(a):
    """Hand a lane to OpenCode 2.x headlessly under the `lane` agent from opencode.json: deny by default, commits stay local, nothing can be published.
    Records the run in the conductor state: running -> verifying (with the session id), or blocked on the tripwire."""
    l = get_lane(a.lane); wt = worktree_of(l); gd = gate_dir(l)
    model = a.model or os.environ.get("LANE_MODEL") or load_state()["models"].get(tier_of(l["id"]))
    if not model: sys.exit(f"gate: pass --model provider/model (or set LANE_MODEL, or `bin/lane state set-models {tier_of(l['id'])}=provider/model`). List them: opencode models")
    require_lane_agent(wt)
    extra = ("\n\nGATED RUN RULES (enforced by permissions): you cannot push, open PRs, touch remotes, run fly/gh, or leave this worktree. "
             "Commit locally after every plan task with the plan's message pattern. When finished, stop and print a short summary: tasks done, "
             "commands you ran with their results, anything you could not do, and any plan deviations. Do not claim a command passed unless you ran it. "
             "Your shell is allowlisted (git add/commit/status/diff/log, make, bin/rails, bundle, npm/npx/node, docker compose, ...); anything else, "
             "including shell redirection to write files, is denied: create and change files with your edit tool.")
    extra += f"\nFIRST ACTION: run `git rev-parse --show-toplevel`; it must print exactly {wt}. If it prints anything else, STOP immediately and report it (do not edit or commit anything)."
    # A fix round (--session) sends the reviewer's findings instead of the lane prompt; the gated-run rules always follow.
    prompt = (open(a.prompt_file).read().strip() if a.prompt_file else prompt_for(l)) + extra
    cmd = [opencode_bin(), "run", "--standalone", "--auto", "--agent", "lane", "--format", "json", "--title", f"{l['id']} gated run", "-m", model] + (["--session", a.session] if a.session else []) + [prompt]
    print("$ (cd %s && %s)" % (wt, " ".join(c if " " not in c else repr(c[:60] + "…") for c in cmd)))
    if a.dry_run: return
    log = os.path.join(gd, f"opencode.{int(time.time())}.jsonl")
    update_lane(l["id"], phase="running", model=model, log=log)
    before, timed_out, code = main_state(), False, None
    with open(log, "w") as f:
        # stdin=DEVNULL: `opencode run` waits for EOF on a non-TTY stdin, so an inherited open pipe or socket hangs it forever.
        try: code = subprocess.run(cmd, cwd=wt, env=dict(os.environ, PWD=wt), stdin=subprocess.DEVNULL, stdout=f, stderr=subprocess.STDOUT, text=True, timeout=a.timeout * 60 if a.timeout else None).returncode
        except subprocess.TimeoutExpired: timed_out = True
    after, sid = main_state(), session_id(log) or a.session or ""
    if before != after:
        update_lane(l["id"], phase="blocked", session=sid, blocked_reason=f"tripwire: the main checkout changed during the run {before} -> {after}")
        print(f"TRIPWIRE: the main checkout changed during the run (HEAD/branch/status {before} -> {after}). The agent worked outside its worktree. STOP and inspect before anything else.")
        sys.exit(3)
    update_lane(l["id"], phase="verifying", session=sid)
    if timed_out:
        print(f"opencode timed out after {a.timeout} min; partial commits stay in the worktree; session {sid or '?'}; event log: {log}\nNext: bin/lane review {l['id']}")
        sys.exit(4)
    print(f"opencode exited {code}; session {sid or '?'}; event log: {log}\nNext: bin/lane review {l['id']}")
```

In `main()`, in the `run` parser line change `u.add_argument("--timeout", type=int, default=120, help="minutes")` to `u.add_argument("--timeout", type=float, default=120, help="minutes"); u.add_argument("--prompt-file", help="fix round: send this file (the findings) instead of the lane prompt")`.

- [ ] **Step 4: Run it, expect PASS**

Run: `make spec ARGS=spec/tooling`
Expected: all examples pass.

- [ ] **Step 5: Check the session-id field against a real OpenCode log**

Run (host): `ls .superpowers/gate/*/opencode.*.jsonl 2>/dev/null | head -1 | xargs -r grep -o '"sessionID":"[^"]*"' | head -1`
Expected: one `"sessionID":"ses_…"` line if any gated run has happened on this machine (the W0-1 pilot); no output means no log exists yet — note that in the PR. If a log exists but prints nothing, STOP: the field name differs and `session_id` must be fixed before conductor use.

- [ ] **Step 6: Verify and commit**

```bash
make verify
git add bin/lane spec/tooling/lane_run_spec.rb
git commit -m "tooling(conductor): task 3 – bin/lane run records state, tier model and session id"
```

---

## Task 4: `bin/lane pr` updates an existing PR

**Files:** Create `spec/tooling/lane_pr_spec.rb`; modify `bin/lane` (`cmd_pr`, conductor section).

**Interfaces — Consumes:** `update_lane` (Task 1); existing `require_approval`, `cmd_check`, `gate_dir`, `current_lane`. **Produces:** `open_pr_for(branch) -> {"number", "url"}|None`; `bin/lane pr` creates the PR once, afterwards pushes with `--force-with-lease` to the same branch, always posts `claude-review` on HEAD, keeps auto-merge, and records `phase=ci pr=<url> head=<sha>`.

- [ ] **Step 1: Write the failing spec**

`spec/tooling/lane_pr_spec.rb`:

```ruby
# frozen_string_literal: true

require "spec_helper"
require_relative "support/lane_sandbox"

RSpec.describe "bin/lane pr" do
  let(:sandbox) { LaneSandbox.new }
  let(:wt) { sandbox.worktree("F-WEEK") }
  let(:file) { "app/javascript/features/week/week.ts" }

  before do
    sandbox.start_lane("F-WEEK")
    sandbox.commit_in("F-WEEK", file: file)
    sandbox.lane("approve", "F-WEEK", "--by", "tester")
    sandbox.stub_gh("^pr create", out: "https://gh/pull/9\n")
  end

  after { sandbox.cleanup }

  def pr = sandbox.lane("pr", chdir: wt)
  def head = sandbox.git("rev-parse", "HEAD", chdir: wt)
  def branch = sandbox.git("branch", "--show-current", chdir: wt)
  def remote_head = sandbox.git("ls-remote", "origin", "refs/heads/#{branch}").split.first
  def existing_pr = sandbox.stub_gh("^pr list --head", out: '[{"number": 9, "url": "https://gh/pull/9"}]')

  it "opens one PR, posts claude-review on the reviewed head, enables auto-merge and records ci" do
    res = pr
    expect(res).to be_success, res.err + res.out
    expect(sandbox.gh_calls.grep(/^pr create/).size).to eq(1)
    expect(sandbox.gh_calls).to include(a_string_matching(%r{^api -X POST repos/me/simbe/statuses/#{head}}))
    expect(sandbox.gh_calls).to include(a_string_matching(/^pr merge \S+ --auto --squash/))
    expect(sandbox.state.dig("lanes", "F-WEEK")).to include("phase" => "ci", "pr" => "https://gh/pull/9", "head" => head)
  end

  it "updates the existing PR after an approved fix commit instead of opening a second one" do
    pr
    existing_pr
    sandbox.commit_in("F-WEEK", file: file, content: "fix\n", message: "fix: ci")
    sandbox.lane("approve", "F-WEEK", "--by", "tester")
    res = pr
    expect(res).to be_success, res.err + res.out
    expect(sandbox.gh_calls.grep(/^pr create/).size).to eq(1)
    expect(remote_head).to eq(head)
    expect(sandbox.gh_calls).to include(a_string_matching(%r{statuses/#{head}}))
  end

  it "publishes rewritten history (a rebase) with a lease-protected force push" do
    pr
    existing_pr
    sandbox.git("commit", "--amend", "-qm", "feat: task 1 (reworded)", chdir: wt)
    sandbox.lane("approve", "F-WEEK", "--by", "tester")
    res = pr
    expect(res).to be_success, res.err + res.out
    expect(remote_head).to eq(head)
  end

  it "refuses to publish a commit that was not approved" do
    pr
    existing_pr
    sandbox.commit_in("F-WEEK", file: file, content: "unreviewed\n", message: "fix: sneaky")
    res = pr
    expect(res).not_to be_success
    expect(res.err).to include("approval is for")
    expect(remote_head).not_to eq(head)
  end
end
```

- [ ] **Step 2: Run it, expect FAIL**

Run: `make spec ARGS=spec/tooling/lane_pr_spec.rb`
Expected: the first example fails (no `phase=ci` state is recorded) and the update examples fail because `gh pr create` runs a second time / the plain push is rejected as non-fast-forward.

- [ ] **Step 3: Implement**

Append to the conductor section:

```python
def open_pr_for(branch):
    """The open PR whose head is `branch` ({number, url}), or None."""
    prs = json.loads(sh("gh", "pr", "list", "--head", branch, "--state", "open", "--json", "number,url") or "[]")
    return prs[0] if prs else None
```

Replace the whole `cmd_pr` function with:

```python
def cmd_pr(a):
    l = get_lane(a.lane or current_lane())
    if not a.skip_gate: require_approval(l)
    cmd_check(argparse.Namespace(lane=l["id"], base=a.base, ccr=False))
    if a.dry_run:
        print("dry run: would push, open or update the PR, post the `claude-review` status on the reviewed commit" + (" and enable auto-merge (squash)" if a.auto_merge else "")); return
    branch = sh("git", "branch", "--show-current")
    existing = open_pr_for(branch)
    if existing:
        # A fix round or a rebase after approval: update the same PR; the lease refuses to clobber commits we have not seen.
        sh("git", "push", "--force-with-lease", "origin", f"HEAD:refs/heads/{branch}", capture=False)
        url = existing["url"]; print(f"updated {url}")
    else:
        sh("git", "push", "-u", "origin", "HEAD", capture=False)
        body = f"""## Lane {l['id']} (wave {l['wave']})

Plan: `{l['rel']}`

## Checklist (paste outputs below)
- [ ] The plan's **Done when** commands pass (outputs pasted)
- [ ] `make verify` is green
- [ ] `bin/lane check` is clean (only files in the plan's `Owns` list changed)
- [ ] Desktop (1280x800) and mobile (390x844) screenshots attached and compared with the design handoff and `docs/design/brand.md` (UI lanes)
- [ ] No contract change needed (otherwise a separate `ccr` PR)

## Outputs / screenshots
"""
        for lab, col in (("lane", "0E8A16"), (f"wave-{l['wave']}", "1D76DB")):
            sh("gh", "label", "create", lab, "--color", col, check=False)
        cmd = ["gh", "pr", "create", "--base", "main", "--title", f"{l['id']}: {l['title'].split(' — ')[0]}", "--body", body, "--label", f"lane,wave-{l['wave']}"]
        if a.draft: cmd.append("--draft")
        url = sh(*cmd); print(url)
    # The reviewer's approval is bound to the exact commit: publish it as the `claude-review` commit status that branch protection requires.
    head, repo = sh("git", "rev-parse", "HEAD"), sh("gh", "repo", "view", "--json", "nameWithOwner", "-q", ".nameWithOwner")
    ap = json.load(open(os.path.join(gate_dir(l), "approved.json"))) if os.path.exists(os.path.join(gate_dir(l), "approved.json")) else {}
    sh("gh", "api", "-X", "POST", f"repos/{repo}/statuses/{head}", "-f", "state=success", "-f", "context=claude-review",
       "-f", f"description=reviewed by {ap.get('by', 'reviewer')} (independent verification + code review)"[:140])
    print(f"posted claude-review=success on {head[:9]}")
    if a.auto_merge and not a.draft:
        r = subprocess.run(["gh", "pr", "merge", url, "--auto", "--squash", "--delete-branch"], text=True, capture_output=True)
        print("auto-merge enabled (merges when the required checks are green)" if r.returncode == 0 else "auto-merge not enabled: " + (r.stderr or r.stdout).strip()[:200])
    update_lane(l["id"], phase="ci", pr=url, head=head)
```

- [ ] **Step 4: Run it, expect PASS**

Run: `make spec ARGS=spec/tooling`
Expected: all examples pass.

- [ ] **Step 5: Verify and commit**

```bash
make verify
git add bin/lane spec/tooling/lane_pr_spec.rb
git commit -m "tooling(conductor): task 4 – bin/lane pr updates an existing PR and records ci"
```

---

## Task 5: `bin/lane ci` and `bin/lane rebase`

**Files:** Create `spec/tooling/lane_ci_rebase_spec.rb`; modify `bin/lane` (conductor section, `main`).

**Interfaces — Consumes:** `open_pr_for` (Task 4), `update_lane` (Task 1), existing `worktree_of`, `sh_in`. **Produces:** `cmd_ci` — exit 0 green (or already merged, which records `phase=merged`), 1 red (failing job logs printed), 2 no PR, 3 timed out; `cmd_rebase` — exit 0 with a `range-diff`, 1 on conflict (rebase aborted, worktree unchanged), non-zero on a dirty worktree.

- [ ] **Step 1: Write the failing spec**

`spec/tooling/lane_ci_rebase_spec.rb`:

```ruby
# frozen_string_literal: true

require "spec_helper"
require_relative "support/lane_sandbox"

RSpec.describe "bin/lane ci and rebase" do
  let(:sandbox) { LaneSandbox.new }
  let(:wt) { sandbox.worktree("F-WEEK") }
  let(:file) { "app/javascript/features/week/week.ts" }

  after { sandbox.cleanup }

  describe "ci" do
    it "prints the checks command on --dry-run, even before the lane starts, without calling GitHub" do
      res = sandbox.lane("ci", "F-WEEK", "--dry-run")
      expect(res).to be_success
      expect(res.out).to include("gh pr checks")
      expect(sandbox.gh_calls).to be_empty
    end

    context "with a started lane" do
      before { sandbox.start_lane("F-WEEK") }

      def open_pr = sandbox.stub_gh("^pr list --head \\S+ --state open", out: '[{"number": 9, "url": "https://gh/pull/9"}]')

      it "exits 2 when the lane has no PR" do
        expect(sandbox.lane("ci", "F-WEEK").exitstatus).to eq(2)
      end

      it "records merged when the PR has already merged" do
        sandbox.stub_gh("^pr list --head \\S+ --state merged", out: '[{"url": "https://gh/pull/9"}]')
        expect(sandbox.lane("ci", "F-WEEK")).to be_success
        expect(sandbox.state.dig("lanes", "F-WEEK", "phase")).to eq("merged")
      end

      it "exits 0 when the checks are green" do
        open_pr
        sandbox.stub_gh("^pr checks", out: "claude-review\tpass\n")
        expect(sandbox.lane("ci", "F-WEEK")).to be_success
      end

      it "exits 1 and prints only the failing jobs' logs when a check is red" do
        open_pr
        sandbox.stub_gh("^pr checks", out: "Backend tests\tfail\n", exit_code: 1)
        sandbox.stub_gh("^run list", out: JSON.generate([
          { "databaseId" => 42, "name" => "Backend tests", "conclusion" => "failure" },
          { "databaseId" => 43, "name" => "Lint backend", "conclusion" => "success" }
        ]))
        sandbox.stub_gh("^run view 42 --log-failed", out: "expected 3, got 4\n")
        res = sandbox.lane("ci", "F-WEEK")
        expect(res.exitstatus).to eq(1)
        expect(res.out).to include("Backend tests", "expected 3, got 4")
        expect(sandbox.gh_calls.grep(/^run view 43/)).to be_empty
      end
    end
  end

  describe "rebase" do
    before do
      sandbox.start_lane("F-WEEK")
      sandbox.commit_in("F-WEEK", file: file, content: "lane\n")
    end

    it "rebases onto the new origin/main and prints a range-diff" do
      sandbox.commit_on_main(file: "README.md", content: "main moved\n")
      res = sandbox.lane("rebase", "F-WEEK")
      expect(res).to be_success, res.err + res.out
      expect(sandbox.git("merge-base", "--is-ancestor", "origin/main", "HEAD", chdir: wt)).to eq("")
      expect(res.out).not_to be_empty
    end

    it "aborts on a conflict and leaves the worktree as it was" do
      before_head = sandbox.git("rev-parse", "HEAD", chdir: wt)
      sandbox.commit_on_main(file: file, content: "main\n")
      res = sandbox.lane("rebase", "F-WEEK")
      expect(res.exitstatus).to eq(1)
      expect(res.out).to include(file)
      expect(sandbox.git("rev-parse", "HEAD", chdir: wt)).to eq(before_head)
      expect(sandbox.git("status", chdir: wt)).not_to include("rebase in progress")
    end

    it "refuses to rebase a dirty worktree" do
      File.write(File.join(wt, file), "uncommitted\n")
      expect(sandbox.lane("rebase", "F-WEEK")).not_to be_success
    end
  end
end
```

- [ ] **Step 2: Run it, expect FAIL**

Run: `make spec ARGS=spec/tooling/lane_ci_rebase_spec.rb`
Expected: FAIL — `invalid choice: 'ci'` / `invalid choice: 'rebase'`.

- [ ] **Step 3: Implement**

Append to the conductor section:

```python
def cmd_ci(a):
    """Wait for the lane PR's checks. 0 green (or already merged), 1 red (failing job logs printed), 2 no PR, 3 timed out."""
    l = get_lane(a.lane); wt = os.path.join(MAIN_ROOT, ".worktrees", l["id"].lower())
    branch = sh_in(wt, "git", "branch", "--show-current") if os.path.isdir(wt) else f"lane/{l['id']}-<slug>"
    watch = ["gh", "pr", "checks", branch, "--watch", "--interval", "30"]
    if a.dry_run: print("$ " + " ".join(watch)); return
    worktree_of(l)
    if not open_pr_for(branch):
        merged = json.loads(sh("gh", "pr", "list", "--head", branch, "--state", "merged", "--json", "url") or "[]")
        if merged: update_lane(l["id"], phase="merged"); print("merged:", merged[0]["url"]); return
        print(f"no open PR for {branch}"); sys.exit(2)
    try: r = subprocess.run(watch, cwd=wt, text=True, capture_output=True, timeout=a.timeout * 60)
    except subprocess.TimeoutExpired: print(f"timed out after {a.timeout} min waiting for the checks"); sys.exit(3)
    print((r.stdout or "").strip())
    if r.returncode == 0: print("checks green"); return
    runs = json.loads(sh("gh", "run", "list", "--branch", branch, "--limit", "20", "--json", "databaseId,name,conclusion") or "[]")
    failed = [x for x in runs if x.get("conclusion") in ("failure", "timed_out")]
    if not failed: print("no failed workflow run found: the red check is a commit status (e.g. claude-review missing on this head)")
    for x in failed:
        print(f"\n## failed: {x['name']} (run {x['databaseId']})")
        print("\n".join(sh("gh", "run", "view", str(x["databaseId"]), "--log-failed", check=False).splitlines()[-a.tail:]))
    sys.exit(1)

def cmd_rebase(a):
    """Rebase the lane worktree on origin/main (needed after a ccr merge or a conflict). 0 with a range-diff, 1 on conflict (aborted)."""
    l = get_lane(a.lane); wt = worktree_of(l)
    if sh_in(wt, "git", "status", "--porcelain"): sys.exit(f"{wt} has uncommitted changes; commit or discard them first")
    sh("git", "-C", wt, "fetch", "origin")
    old_head, old_base = sh_in(wt, "git", "rev-parse", "HEAD"), sh_in(wt, "git", "merge-base", "HEAD", a.base)
    r = subprocess.run(["git", "-C", wt, "rebase", a.base], text=True, capture_output=True)
    if r.returncode:
        conflicts = sh_in(wt, "git", "diff", "--name-only", "--diff-filter=U")
        subprocess.run(["git", "-C", wt, "rebase", "--abort"], capture_output=True)
        print(f"CONFLICT rebasing {l['id']} on {a.base} (rebase aborted, worktree unchanged):\n{conflicts}"); sys.exit(1)
    print(sh_in(wt, "git", "range-diff", f"{old_base}..{old_head}", f"{a.base}..HEAD") or "(no change)")
    print(f"rebased {l['id']}: re-run G2 on the new head, re-approve, then bin/lane pr (updates the PR with --force-with-lease)")
```

In `main()`, after the `next` parser line, add:

```python
    ci = sub.add_parser("ci"); ci.add_argument("lane"); ci.add_argument("--dry-run", action="store_true"); ci.add_argument("--timeout", type=float, default=60, help="minutes"); ci.add_argument("--tail", type=int, default=80); ci.set_defaults(f=cmd_ci)
    rb = sub.add_parser("rebase"); rb.add_argument("lane"); rb.add_argument("--base", default="origin/main"); rb.set_defaults(f=cmd_rebase)
```

- [ ] **Step 4: Run it, expect PASS**

Run: `make spec ARGS=spec/tooling`
Expected: all examples pass.

- [ ] **Step 5: Verify and commit**

```bash
make verify
git add bin/lane spec/tooling/lane_ci_rebase_spec.rb
git commit -m "tooling(conductor): task 5 – bin/lane ci and rebase"
```

---

## Task 6: Gate fixes: the `lane` agent allowlist and the canary's stdin

**Files:** Create `spec/tooling/opencode_config_spec.rb`; modify `opencode.json`, `bin/lane` (`cmd_canary`).

**Interfaces — Consumes:** nothing from earlier tasks (Task 3 already closes stdin for `run`). **Produces:** a `lane` agent that allows `git rev-parse*`, `git branch --show-current`, `pwd` and `which *` and still denies publishing; a canary that checks `git rev-parse --show-toplevel` is allowed and cannot hang on an inherited stdin.

- [ ] **Step 1: Write the failing spec** (OpenCode evaluates permission patterns as globs, the last matching rule wins; the spec mirrors that on the file's key order)

`spec/tooling/opencode_config_spec.rb`:

```ruby
# frozen_string_literal: true

require "spec_helper"
require "json"

RSpec.describe "opencode.json lane agent" do
  let(:bash) { JSON.parse(File.read(File.expand_path("../../opencode.json", __dir__))).dig("agent", "lane", "permission", "bash") }

  # Same rule as OpenCode: patterns are globs ("*" = anything), the last matching entry decides.
  def decision(command)
    bash.select { |pattern, _| command.match?(/\A#{Regexp.escape(pattern).gsub('\\*', '.*')}\z/) }.values.last
  end

  it "denies by default" do
    expect(bash["*"]).to eq("deny")
  end

  it "allows the read-only commands the gated run prompt itself needs" do
    [ "git rev-parse --show-toplevel", "git branch --show-current", "pwd", "which docker" ].each do |cmd|
      expect(decision(cmd)).to eq("allow"), "#{cmd} is #{decision(cmd).inspect}"
    end
  end

  it "still allows local commits and still denies everything that publishes or destroys" do
    expect(decision("git commit -m x")).to eq("allow")
    [ "git push origin lane/x", "git remote add evil https://example.com/x.git", "gh pr list", "fly deploy", "sudo ls", "rm -rf x" ].each do |cmd|
      expect(decision(cmd)).to eq("deny"), "#{cmd} is #{decision(cmd).inspect}"
    end
  end
end
```

- [ ] **Step 2: Run it, expect FAIL**

Run: `make spec ARGS=spec/tooling/opencode_config_spec.rb`
Expected: FAIL on "allows the read-only commands…": `git rev-parse --show-toplevel is "deny"`.

- [ ] **Step 3: Implement**

In `opencode.json`, inside `agent.lane.permission.bash`, add these four entries right after the `"git rm*": "allow",` line of the **`lane` agent** (not the top-level baseline, which is the interactive profile):

```json
          "git rev-parse*": "allow",
          "git branch --show-current": "allow",
          "pwd": "allow",
          "which *": "allow",
```

In `bin/lane`, in `cmd_canary`'s gated branch, add the check and close stdin:

```python
        steps = ["git push origin lane/canary", "gh pr list", f"rm -rf {work}/README.md", f"touch {outside}", "git remote add evil https://example.com/x.git", "git commit --allow-empty -m canary", "git rev-parse --show-toplevel"]
        expect = {"git push origin lane/canary": "denied", "gh pr list": "denied", "rm -rf": "denied", "git remote add": "denied", "git commit --allow-empty": "allowed", "git rev-parse --show-toplevel": "allowed"}
```
and replace the canary's `subprocess.run(cmd, cwd=work, env=dict(os.environ, PWD=work), stdout=f, stderr=subprocess.STDOUT, text=True, timeout=a.timeout * 60)` with the same call plus `stdin=subprocess.DEVNULL,` (OpenCode waits for EOF on an inherited non-TTY stdin).

- [ ] **Step 4: Run the spec, expect PASS**

Run: `make spec ARGS=spec/tooling`
Expected: all examples pass.

- [ ] **Step 5: Prove the canary against the real OpenCode, with stdin deliberately left open**

Run (from a shell whose stdin is not a TTY, such as the agent's shell; do **not** add `< /dev/null`): `python3 bin/lane canary --model opencode-go/deepseek-v4.1-flash`
Expected: ends with `CANARY [gated] PASSED` and includes `PASS  \`git rev-parse --show-toplevel\` -> allowed`. Before this task the same command hung until the timeout.

- [ ] **Step 6: Verify and commit**

```bash
make verify
git add opencode.json bin/lane spec/tooling/opencode_config_spec.rb
git commit -m "tooling(conductor): task 6 – lane agent allowlist and canary stdin"
```

---

## Task 7: Batch-approval docs and acceptance run

**Files:** Modify `docs/superpowers/parallel/review-gate.md`, `docs/superpowers/parallel/playbook.md`, `docs/superpowers/parallel/README.md`.

**Interfaces — Consumes:** every command from Tasks 1–5.

- [ ] **Step 1: Amend `review-gate.md`** (exact replacements)

Replace
```
4. **You decide what ships.** I never merge; I never push without your explicit "go" for that lane.
```
with
```
4. **You decide what ships.** I never push without your explicit "go": per lane at the pilot, **per batch** from trust level 1 (§5). Only lanes you approved in a batch merge automatically (squash auto-merge on green required checks).
```

Replace the G4 row
```
| **G4 Your approval** | **You** | I show you: verdict, evidence, deviations, risks, screenshots, what the lane unblocks. You say "go" or "change X". Only then: `bin/lane approve <LANE> --by <you>` and `bin/lane pr` | `approved.json` (bound to the exact HEAD) |
```
with
```
| **G4 Your approval (per batch)** | **You** | One report for every lane that passed G2 + G3 since the last report (also saved in `.superpowers/orchestrator/batches/`): per lane the verdict, evidence, deviations, risks, screenshots, what it unblocks. You answer `go`, `go except <LANE>` or `change <LANE>: …`. Only then, per approved lane: `bin/lane approve <LANE> --by <you> --note "batch <ts>"` and `bin/lane pr`. At level 0 a batch is one lane | `approved.json` (bound to the exact HEAD) |
```

Replace the G5 row
```
| **G5 Merge** | **You** | You merge the PR. The next lane starts only after the merge and a fresh G0 | GitHub |
```
with
```
| **G5 Merge** | GitHub auto-merge · **you** at level 0 | Batch-approved lanes merge by squash auto-merge when every required check, including `claude-review`, is green; your batch "go" is the merge authorization. Post-approval commits (CI fix, rebase) are re-verified and re-approved under the same "go" only if they stay inside the lane's `Owns` and pass G2 plus a delta review; anything else waits for the next batch. The pilot is merged by you (`bin/lane pr --no-auto-merge`). New lanes start from `bin/lane next` after a fresh G0 | GitHub |
```

Replace the level-1 ladder row
```
| **1 – Small batch** | Up to 3 independent lanes in parallel (different packs/features); one combined report, **one approval per lane** | 5 more lanes merged with no post-merge regressions on `main` |
```
with
```
| **1 – Small batch** | Up to 3 independent lanes in parallel (different packs/features); one combined report, **one approval per batch** (`go` / `go except <LANE>`), auto-merge on green | 5 more lanes merged with no post-merge regressions on `main` |
```

- [ ] **Step 2: Add "Conductor mode" to `playbook.md`**

Insert immediately above the line `## 7. Keeping it orderly`:

~~~markdown
## 6b. Conductor mode (Claude Code drives many OpenCode lanes)

Design: [`../specs/2026-10/2026-10-14-2330-lane-conductor-design.md`](../specs/2026-10/2026-10-14-2330-lane-conductor-design.md). Ask Claude Code to "conduct": it repeats this loop, with every OpenCode run and CI wait as a background job, and only interrupts you for a batch report or a stop.

```bash
bin/lane state set-models top=<provider/model> mid=<provider/model> cheap=<provider/model>   # once
bin/lane next                          # lanes whose prerequisites are merged, critical path first, within the caps (bin/lane state show)
bin/lane start <LANE> && bin/lane run <LANE>          # background; records phase + OpenCode session id
bin/lane review <LANE>                 # G2, plus the plan's Done-when commands re-run in the worktree; G3 by a fresh subagent per lane
bin/lane run <LANE> --session <id> --prompt-file <findings.md>   # fix rounds (max 2) with the exact findings
# batch report -> you: go / go except <LANE> / change <LANE>: …
bin/lane approve <LANE> --by <you> --note "batch <ts>" && (cd .worktrees/<lane> && bin/lane pr)   # PR, claude-review, auto-merge
bin/lane ci <LANE>                     # background; red -> failing logs back to the session (max 2), then re-approve + bin/lane pr updates the PR
bin/lane rebase <LANE>                 # every open lane, after a ccr merge
bin/lane stop <LANE>                   # after merge; then bin/lane next again
```

Caps (`bin/lane state set-caps`): 4 running, 5 Docker stacks (non-`F-*` lanes), 4 waiting for review/CI. While any run is active nobody edits the main checkout (it trips the run's tripwire).
~~~

- [ ] **Step 3: Update the helper list in `README.md`**

Replace
```
Helper: `bin/lane` (`list`, `start`, `check`, `pr`, `status`, `stop`).
```
with
```
Helper: `bin/lane` (`list`, `start`, `check`, `pr`, `status`, `stop`; review gate: `run`, `review`, `approve`, `canary`; conductor: `next`, `state`, `ci`, `rebase` — see the playbook's "Conductor mode").
```

- [ ] **Step 4: Run the spec's acceptance criteria**

```bash
bin/lane next --json --assume-merged W0-1 | python3 -c 'import json,sys; ids=set(json.load(sys.stdin)); sys.exit(0 if ids=={"W0-2","W0-3","W0-4A","W0-7"} else 1)' && echo AC1
bin/lane next --json --assume-merged W0-1,W0-3 | python3 -c 'import json,sys; ids=set(json.load(sys.stdin)); want={"B-INGEST","B-METRICS","B-LEADS","B-ACTIONS","B-ACCOUNT"}; sys.exit(0 if want<=ids else 1)' && echo AC2
bin/lane next --json --assume-merged W0-1,W0-3 --limit 2 | python3 -c 'import json,sys; sys.exit(0 if len(json.load(sys.stdin))==2 else 1)' && echo AC3
bin/lane next --json --assume-merged W0-1 | python3 -c 'import json,sys; sys.exit(1 if "B-AGENT" in json.load(sys.stdin) else 0)' && echo AC4
(export LANE_STATE=$(mktemp -d)/s.json && bin/lane state set F-WEEK phase=running session=abc >/dev/null && bin/lane state show F-WEEK | grep -q '"session": "abc"' && ! bin/lane state set F-WEEK phase=bogus 2>/dev/null) && echo AC5
make spec ARGS=spec/tooling && echo AC6
bin/lane ci F-WEEK --dry-run | grep -q 'gh pr checks' && echo AC7
bin/lane rebase --help >/dev/null && bin/lane pr --help | grep -q -- --no-auto-merge && echo AC8
grep -q 'per batch' docs/superpowers/parallel/review-gate.md && grep -q 'bin/lane next' docs/superpowers/parallel/playbook.md && echo AC9
bin/lane graph --file docs/superpowers/parallel/dependencies.md --check && echo AC10
```
Expected: `AC1` … `AC10` all printed (`bin/lane` runs on the host: it is the host tool that drives git, gh and opencode).

- [ ] **Step 5: Verify and commit**

```bash
make verify
git add docs/superpowers/parallel
git commit -m "tooling(conductor): task 7 – batch-approval gate docs and conductor mode"
```

Then open the PR with `gh pr create` (this branch is not a lane; do not use `bin/lane pr`) and paste the AC1–AC10 output.
