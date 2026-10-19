class Snapshot
  # How leads are grouped into people: by lower-cased, trimmed email; a blank email links to nobody.
  module People
    COLUMNS = %w[id agency_id email_key created_at updated_at].freeze

    # -> String, or nil when the email is blank.
    def self.key_for(email)
      email.to_s.strip.downcase.presence
    end

    # The people of ONE load: the same email key always maps to the same new id, and every blank-email
    # lead gets an id of its own. Built from a first pass over leads.csv, before any lead is written.
    class Registry
      def initialize
        @by_key = {}
        @blank_ids = []
        @by_lead = {}
      end

      # Records the lead's person -> the person id (uuid String).
      def register(external_id, email)
        key = People.key_for(email)
        id = key ? (@by_key[key] ||= SecureRandom.uuid) : SecureRandom.uuid.tap { |new_id| @blank_ids << new_id }
        @by_lead[external_id] = id
      end

      # -> the person id registered for this lead (raises KeyError for an unknown lead).
      def person_id(external_id)
        @by_lead.fetch(external_id)
      end

      # [[id, email_key], ...]: one row per person.
      def rows
        @by_key.map { |key, id| [ id, key ] } + @blank_ids.map { |id| [ id, nil ] }
      end
    end

    # COPYs the registry's people into `people` on `raw` (a PG connection). `stamp` is the already
    # formatted timestamp for created_at/updated_at. Runs before the leads, whose foreign key points here.
    def self.copy!(raw, agency_id, registry, stamp)
      raw.copy_data("COPY people (#{COLUMNS.join(', ')}) FROM STDIN WITH (FORMAT csv)") do
        registry.rows.each_slice(5_000) do |slice|
          raw.put_copy_data(slice.map { |id, key| CSV.generate_line([ id, agency_id, key, stamp, stamp ]) }.join)
        end
      end
    end
  end
end
