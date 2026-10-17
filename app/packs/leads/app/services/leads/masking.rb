# Phone masking (docs/conventions/sensitive-data.md): a lead's phone is only ever shown in
# full to the coordinator assigned to that lead. Everyone else sees the last four digits.
module Leads
  module Masking
    # -> "•••-••••-1768" (last four digits) or nil for a blank/absent phone.
    def self.phone(raw)
      digits = raw.to_s.gsub(/\D/, "")
      return nil if digits.empty?

      "•••-••••-#{digits[-4, 4]}"
    end
  end
end
