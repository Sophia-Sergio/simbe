# Shapes Leads::CoordinatorStats into the CoordinatorRow / CoordinatorDetail contracts
# (contracts/openapi/schemas/coordinators.yaml): explicit attribute lists, never `render json: row`.
# first_reply_minutes is nil when a coordinator has no timed first replies (Float, so it renders as
# a JSON number rather than a string).
class CoordinatorSerializer
  def self.list(rows)
    rows.map { |coordinator| row(coordinator) }
  end

  def self.row(coordinator)
    {
      name: coordinator[:name],
      leads: coordinator[:leads],
      share_pct: coordinator[:share_pct],
      first_reply_minutes: coordinator[:first_reply_minutes],
      qualified: coordinator[:qualified],
      qualified_rate: coordinator[:qualified_rate],
      overdue: coordinator[:overdue],
      status: coordinator[:status]
    }
  end

  def self.detail(coordinator)
    row(coordinator).merge(
      kpis: {
        leads: coordinator[:kpis][:leads],
        qualified: coordinator[:kpis][:qualified],
        qualified_rate: coordinator[:kpis][:qualified_rate],
        first_reply_minutes: coordinator[:kpis][:first_reply_minutes]
      },
      needs_action: coordinator[:needs_action].map { |item| needs_action(item) }
    )
  end

  def self.needs_action(item)
    {
      lead_id: item[:lead_id],
      name: item[:name],
      queue: item[:queue],
      age_minutes: item[:age_minutes],
      reason: item[:reason]
    }
  end
end
