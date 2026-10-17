# The lead's status pill (spec 2008 decision 1): a queued lead is labelled by its queue, a
# closed/accepted/paused lead by its outcome, and an open lead that is not queued is on track.
# `Leads` is the pack namespace; `Lead` (singular) is the model.
module Leads
  module Status
    TEXT_BACK_NOW = { key: "text_back_now", label: "Text back now", tone: "danger" }.freeze
    NUDGE = { key: "nudge", label: "Nudge", tone: "warning" }.freeze
    REBOOK = { key: "rebook", label: "Rebook", tone: "warning" }.freeze
    DUE_BACK = { key: "due_back", label: "Due back", tone: "neutral" }.freeze

    ON_TRACK = { key: "on_track", label: "On track", tone: "success" }.freeze

    # Queue key -> status. The queue always wins: a queued lead shows why it needs action.
    BY_QUEUE = {
      "text_back_now" => TEXT_BACK_NOW,
      "nudge_applications" => NUDGE,
      "rebook_consults" => REBOOK,
      "paused_due_back" => DUE_BACK
    }.freeze

    # Outcome -> status, for leads that are not in a queue.
    BY_OUTCOME = {
      "accepted" => { key: "accepted", label: "Accepted", tone: "success" }.freeze,
      "paused" => { key: "paused", label: "Paused", tone: "neutral" }.freeze,
      "not_eligible" => { key: "not_eligible", label: "Not eligible", tone: "neutral" }.freeze,
      "withdrew" => { key: "withdrew", label: "Withdrew", tone: "neutral" }.freeze,
      "unresponsive" => { key: "unresponsive", label: "Unresponsive", tone: "danger" }.freeze
    }.freeze

    # -> { key:, label:, tone: }. `queue` is the lead's queue (nil when it is not queued).
    def self.call(outcome:, queue: nil)
      BY_QUEUE[queue] || BY_OUTCOME[outcome] || ON_TRACK
    end
  end
end
