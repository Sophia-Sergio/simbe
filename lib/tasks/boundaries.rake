require "yaml"

# Static architecture guards (docs/conventions/security.md): `rails boundaries:check` exits non-zero and prints file:line per violation.
# Cross-pack edges come from config/boundaries_allowlist.yml, which only ever shrinks.
module Boundaries
  RULES = [
    { name: "unscoped outside the snapshot services", pattern: /\bunscoped?\b/, globs: %w[app/**/*.rb lib/**/*.rb],
      allowed: [ %r{\Aapp/packs/ingest/app/services/snapshot/} ] },
    { name: "Anthropic::Client outside Ai::Client", pattern: /Anthropic::Client/, globs: %w[app/**/*.rb lib/**/*.rb],
      allowed: [ %r{\Aapp/packs/agent/app/services/ai/client\.rb\z} ] },
    { name: "network call outside api/client.ts (fetch, XMLHttpRequest, EventSource)", pattern: /\bfetch\s*\(|\bXMLHttpRequest\b|\bEventSource\b/, globs: %w[app/javascript/**/*.{ts,tsx,js,jsx}],
      allowed: [ %r{\Aapp/javascript/api/client\.ts\z}, /\.test\.tsx?\z/, %r{\Aapp/javascript/mocks/} ] },
    { name: "native alert/confirm/prompt", pattern: /(?<![\w.$])(?:window\.)?(?:confirm|alert|prompt)\(/, globs: %w[app/javascript/**/*.{ts,tsx,js,jsx}],
      allowed: [] },
    { name: "raw hex color outside ChannelTile (use the brand tokens)", pattern: /#[0-9a-fA-F]{6}(?:[0-9a-fA-F]{2})?\b/, globs: %w[app/javascript/**/*.{ts,tsx,js,jsx}],
      allowed: [ %r{/ChannelTile\.tsx\z}, /\.test\.[jt]sx?\z/, %r{\Aapp/javascript/mocks/} ] }
  ].freeze

  def self.allowed_edges(root)
    path = File.join(root, "config/boundaries_allowlist.yml")
    File.exist?(path) ? Array(YAML.load_file(path)["edges"]) : []
  end

  def self.code_lines(file)
    File.readlines(file, chomp: true).each_with_index.reject { |line, _| line.strip.start_with?("#", "//", "*", "/*") }
  end

  # Returns [[ "path:line", "rule" ], ...]
  def self.check(root:, allowed_edges: allowed_edges(root))
    found = []
    RULES.each do |rule|
      rule[:globs].flat_map { |g| Dir.glob(File.join(root, g)) }.sort.each do |file|
        rel = file.delete_prefix("#{root}/")
        next if rule[:allowed].any? { |a| a.match?(rel) }

        code_lines(file).each { |line, i| found << [ "#{rel}:#{i + 1}", rule[:name] ] if rule[:pattern].match?(line) }
      end
    end
    found + cross_pack(root, allowed_edges)
  end

  # A pack may not name another pack's model constants unless "from->to" is allowlisted.
  def self.cross_pack(root, allowed)
    models = Dir.glob(File.join(root, "app/packs/*/app/models/**/*.rb")).each_with_object({}) do |file, by_pack|
      pack = file[%r{app/packs/([^/]+)/}, 1]
      const = file.sub(%r{.*/app/models/}, "").delete_suffix(".rb").split("/").map { |s| s.split("_").map(&:capitalize).join }.join("::")
      (by_pack[pack] ||= []) << const
    end
    found = []
    Dir.glob(File.join(root, "app/packs/*/**/*.rb")).sort.each do |file|
      rel = file.delete_prefix("#{root}/")
      from = rel[%r{\Aapp/packs/([^/]+)/}, 1]
      models.each do |to, consts|
        next if to == from || allowed.include?("#{from}->#{to}")

        code_lines(file).each do |line, i|
          found << [ "#{rel}:#{i + 1}", "pack #{from} references #{to} model (#{consts.find { |c| line.match?(/\b#{Regexp.escape(c)}\b/) }})" ] if consts.any? { |c| line.match?(/\b#{Regexp.escape(c)}\b/) }
        end
      end
    end
    found
  end
end

namespace :boundaries do
  desc "Fail on architecture violations (unscoped, Anthropic::Client, fetch, native dialogs, raw hex, cross-pack models)"
  task :check do
    violations = Boundaries.check(root: Rails.root.to_s)
    if violations.any?
      violations.each { |where, rule| warn "#{where}  #{rule}" }
      abort "boundaries:check failed (#{violations.size} violation#{'s' unless violations.size == 1})"
    end
    puts "boundaries:check ok"
  end
end
