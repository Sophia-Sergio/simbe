# Shapes Leads::NextActions into the NextActions contract (contracts/openapi/schemas/next-actions.yaml):
# explicit attribute lists, never `render json: result`.
class NextActionsSerializer
  def self.call(result)
    {
      as_of: result[:as_of],
      progress: { done: result[:progress][:done], total: result[:progress][:total] },
      queues: result[:queues].map { |queue| render_queue(queue) }
    }
  end

  def self.render_queue(queue)
    {
      key: queue[:key],
      title: queue[:title],
      hint: queue[:hint],
      tone: queue[:tone],
      count: queue[:count],
      items: queue[:items].map { |item| render_item(item) }
    }
  end

  def self.render_item(item)
    {
      lead_id: item[:lead_id],
      name: item[:name],
      age_minutes: item[:age_minutes],
      age_label: item[:age_label],
      reason: item[:reason],
      done: item[:done]
    }
  end
end
