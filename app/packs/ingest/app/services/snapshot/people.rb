class Snapshot
  # How leads are grouped into people: by lower-cased, trimmed email; a blank email links to nobody.
  module People
    # -> String, or nil when the email is blank.
    def self.key_for(email)
      email.to_s.strip.downcase.presence
    end
  end
end
