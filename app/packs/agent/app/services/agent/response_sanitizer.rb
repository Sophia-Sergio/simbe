# Cleans the model's `respond` payload before it is stored or returned (spec 2013, decision
# 2): only whitelisted in-app routes survive as actions/sources (coordinators get a shorter
# list), bars are capped at 8 and text at 1,200 characters, so a hallucinated route or an
# oversized payload never reaches the UI or the stored history.
module Agent
  module ResponseSanitizer
    TEXT_CAP = 1200
    BARS_CAP = 8
    SOURCES_CAP = 4
    SUGGESTIONS_CAP = 3

    # A route the UI can navigate to. The first alternative also matches "/" (the group is
    # optional), so the owner may link home as well as the named screens.
    ROUTE = %r{\A/(funnel|channels|pipeline|coordinators|data|settings|next-actions)?\z|\A/channels/[A-Za-z0-9 _-]+\z}

    COORDINATOR_ROUTES = %w[/ /next-actions /pipeline].freeze

    def self.call(hash, role: "owner")
      payload = (hash || {}).to_h.transform_keys(&:to_s)
      body = { "text" => truncate(payload["text"].to_s) }

      chart = chart(payload["chart"])
      body["chart"] = chart if chart

      action = link(payload["action"], role)
      body["action"] = action if action

      sources = Array(payload["sources"]).filter_map { |source| link(source, role) }.first(SOURCES_CAP)
      body["sources"] = sources if sources.any?

      suggestions = Array(payload["suggestions"]).select { |suggestion| suggestion.is_a?(String) }.first(SUGGESTIONS_CAP)
      body["suggestions"] = suggestions if suggestions.any?

      body
    end

    def self.truncate(text)
      text.to_s[0, TEXT_CAP]
    end

    def self.chart(chart)
      return nil unless chart.is_a?(Hash)

      bars = Array(chart["bars"]).filter_map do |bar|
        next unless bar.is_a?(Hash) && bar["value"].is_a?(Numeric)

        { "label" => bar["label"].to_s, "value" => bar["value"], "display" => bar["display"].to_s }
      end.first(BARS_CAP)
      return nil if bars.empty?

      { "title" => chart["title"].to_s, "bars" => bars }
    end

    # A { label:, route: } link with a whitelisted route, or nil (dropped).
    def self.link(link, role)
      return nil unless link.is_a?(Hash)
      return nil unless valid_route?(link["route"], role)

      { "label" => link["label"].to_s, "route" => link["route"] }
    end

    def self.valid_route?(route, role)
      return false unless route.is_a?(String) && ROUTE.match?(route)
      return true unless role.to_s == "coordinator"

      COORDINATOR_ROUTES.include?(route)
    end
  end
end
