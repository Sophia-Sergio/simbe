# Fixed ad spend for the Alpha agency, so every hand-computed metrics expectation has a
# source (docs/conventions/real-data.md — Alpha is exact, not generated). These totals
# drive Facebook's $150.00 cost per qualified (30_000¢ for 2 qualified) and the overall
# 85_000¢ ÷ 3 = 28_333¢ in the summary specs.
module AlphaSpend
  def self.load!(agency)
    AdSpendDay.where(agency_id: agency.id).delete_all
    [
      [ "2026-09-25", "meta",   "Facebook",  "c-a", 30_000 ],
      [ "2026-09-25", "meta",   "Instagram", "c-b", 10_000 ],
      [ "2026-09-26", "google", "Google",    "c-c", 45_000 ]
    ].each { |d, p, ch, c, cents| AdSpendDay.create!(agency: agency, date: d, platform: p, channel: ch, campaign: c, spend_cents: cents, source: "import") }
  end
end
