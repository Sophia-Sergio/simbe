require "json"

# The committed aggregates (spec/real_data/golden.json) computed independently from the
# exports by bin/golden-numbers. Golden.agency(slug) returns that agency's Hash:
# "row_counts", "as_of", "qualified_all_time", "warnings", …
module Golden
  PATH = File.expand_path("golden.json", __dir__)

  class << self
    def agency(slug)
      data.fetch("agencies").fetch(slug.to_s)
    end

    def data
      @data ||= JSON.parse(File.read(PATH))
    end
  end
end
