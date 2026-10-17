# The lead detail JSON (contracts/openapi/schemas/leads.yaml #/LeadDetail, matching
# contracts/examples/leads/detail-{owner,coordinator}.json). Health-data rules
# (docs/conventions/sensitive-data.md): the phone is masked unless the signed-in user is the
# coordinator assigned to this lead (`can_contact` mirrors that), and raw screener `answer`
# values are emitted only for the assigned coordinator — `age` apart, which both roles see.
class LeadDetailSerializer
  AGE_QUESTION = "How old are you?"
  MAX_QUESTIONS = 10
  CLOSED_OUTCOMES = %w[not_eligible withdrew unresponsive].freeze
  VERDICTS = { "yes" => "met", "review" => "review", "no" => "not_met" }.freeze

  # Order newline items appear in at equal timestamps: the newest event of a kind wins.
  ACTIVITY_RANK = { application: 0, contact: 1, appointment: 2, visit: 3, stage: 4 }.freeze

  STEPS = [ [ "screener", "Screener" ], [ "application", "Application" ], [ "consult", "Consult" ],
            [ "records", "Medical records" ], [ "accepted", "Accepted" ] ].freeze

  # -> Hash. `queue` is the lead's next-action queue, `done` its Done-toggle state.
  def self.call(user:, lead:, queue: nil, done: false)
    assigned = assigned?(user, lead)
    screener = screener(lead, assigned)
    application = latest_application(lead)

    {
      id: lead.id,
      name: [ lead.first_name, lead.last_name ].compact_blank.join(" "),
      coordinator: lead.coordinator_name,
      stage: lead.current_stage,
      status: Leads::Status.call(outcome: lead.outcome, queue: queue),
      contact: contact(lead, assigned),
      consult: consult(lead),
      screener: screener,
      process: process(lead, screener, application),
      activity: activity(lead),
      source: source(lead),
      summary: Leads::Summarizer.call(lead: lead, queue: queue, application: application),
      queue: queue,
      done: done
    }
  end

  def self.assigned?(user, lead)
    user.coordinator? && lead.coordinator_name == user.coordinator_name
  end

  def self.closed?(lead)
    CLOSED_OUTCOMES.include?(lead.outcome)
  end

  def self.contact(lead, assigned)
    {
      state: lead.state,
      email: lead.email,
      phone: assigned ? lead.phone : Leads::Masking.phone(lead.phone),
      age: LeadCardSerializer.age(lead),
      channel: lead.channel,
      campaign: lead.campaign,
      can_contact: assigned
    }
  end

  def self.consult(lead)
    appointment = latest_appointment(lead)
    { status: appointment&.status, scheduled_for: appointment&.scheduled_for }
  end

  # The 10 most common questions in the agency's data define `total`; the age question is
  # surfaced first (spec 2008: it is the one demographic the cards show), then by frequency.
  def self.questions
    counts = ScreenerAnswer.where(agency_id: Current.agency.id).group(:question).count
    counts.sort_by { |question, count| [ -count, question == AGE_QUESTION ? 0 : 1, question ] }
          .first(MAX_QUESTIONS).map(&:first)
  end

  def self.screener(lead, assigned)
    answers = lead.screener_answers.index_by(&:question)
    counts = { met: 0, review: 0, not_met: 0, unanswered: 0, total: 0 }
    items = questions.map do |question|
      answer = answers[question]
      verdict = verdict(answer)
      counts[verdict.to_sym] += 1
      item = { question: question, verdict: verdict }
      item[:answer] = answer.answer if assigned && answer
      item
    end
    counts[:total] = items.size
    { counts: counts, items: items }
  end

  def self.verdict(answer)
    return "unanswered" if answer.nil?

    VERDICTS.fetch(answer.meets_requirement, "unanswered")
  end

  def self.process(lead, screener, application)
    states = {
      "screener" => screener_step(lead, screener),
      "application" => application_step(lead, application),
      "consult" => consult_step(lead),
      "records" => records_step(lead),
      "accepted" => accepted_step(lead)
    }
    STEPS.map { |key, label| { key: key, label: label, state: states[key][0], detail: states[key][1] } }
  end

  def self.screener_step(lead, screener)
    total = screener[:counts][:total]
    return [ "upcoming", nil ] if total.zero?

    state = if closed?(lead)
      "stopped"
    else
      screener[:counts][:not_met].zero? ? "complete" : "ongoing"
    end
    [ state, "#{total - screener[:counts][:unanswered]} of #{total} answered" ]
  end

  def self.application_step(lead, application)
    if application&.submitted_at
      [ "complete", "Submitted #{short_date(application.submitted_at)}" ]
    elsif application && lead.current_stage == "application"
      [ "ongoing", application_detail(application) ]
    elsif closed?(lead)
      [ "stopped", nil ]
    else
      [ "upcoming", nil ]
    end
  end

  def self.application_detail(application)
    percent = "#{application.percent_complete || 0}%"
    section = application.last_section_completed.presence
    section ? "#{percent} - stopped at #{section.tr('_', ' ')}" : "#{percent} complete"
  end

  def self.consult_step(lead)
    appointment = latest_appointment(lead)
    if appointment&.status == "attended"
      [ "complete", "Attended #{short_date(appointment.scheduled_for || appointment.booked_at)}" ]
    elsif closed?(lead)
      [ "stopped", nil ]
    elsif appointment&.status == "no_show"
      [ "ongoing", "No-show #{short_date(appointment.scheduled_for || appointment.booked_at)}" ]
    elsif appointment
      [ "ongoing", "Booked #{short_date(appointment.scheduled_for || appointment.booked_at)}" ]
    else
      [ "upcoming", nil ]
    end
  end

  def self.records_step(lead)
    fact = lead.lead_fact
    if fact&.records_at
      [ "complete", "Reached medical records #{short_date(fact.records_at)}" ]
    elsif closed?(lead)
      [ "stopped", nil ]
    elsif lead.current_stage == "records"
      [ "ongoing", nil ]
    else
      [ "upcoming", nil ]
    end
  end

  def self.accepted_step(lead)
    if lead.outcome == "accepted"
      at = lead.lead_fact&.accepted_at
      [ "complete", at && "Accepted #{short_date(at)}" ]
    elsif closed?(lead)
      [ "stopped", nil ]
    else
      [ "upcoming", nil ]
    end
  end

  # Newest first; stage/contact/application/appointment/visit events from the child tables.
  def self.activity(lead)
    entries = stage_entries(lead) + contact_entries(lead) + application_entries(lead) +
              appointment_entries(lead) + visit_entries(lead)
    entries.sort_by { |entry| [ -entry[:at].to_f, ACTIVITY_RANK.fetch(entry[:kind]) ] }
  end

  def self.stage_entries(lead)
    lead.stage_events.filter_map do |event|
      next if event.entered_at.nil?
      { at: event.entered_at, kind: :stage, title: "Entered #{event.stage}", detail: nil }
    end
  end

  def self.contact_entries(lead)
    lead.contacts.filter_map do |contact|
      next if contact.contacted_at.nil?
      { at: contact.contacted_at, kind: :contact, title: contact_title(contact),
        detail: contact.contacted_by.presence && "by #{contact.contacted_by}" }
    end
  end

  def self.contact_title(contact)
    verb = contact.direction == "inbound" ? "received" : "sent"
    "#{(contact.channel.presence || 'message').capitalize} #{verb}"
  end

  def self.application_entries(lead)
    lead.applications.flat_map do |application|
      entries = []
      if application.started_at
        entries << { at: application.started_at, kind: :application, title: "Application started",
                     detail: application.percent_complete && "#{application.percent_complete}% complete" }
      end
      if application.submitted_at
        entries << { at: application.submitted_at, kind: :application, title: "Application submitted", detail: nil }
      end
      entries
    end
  end

  def self.appointment_entries(lead)
    lead.appointments.flat_map do |appointment|
      entries = []
      if appointment.booked_at
        entries << { at: appointment.booked_at, kind: :appointment, title: "Consult booked", detail: nil }
      end
      outcome = appointment_outcome(appointment)
      entries << outcome if outcome
      entries
    end
  end

  def self.appointment_outcome(appointment)
    at = appointment.scheduled_for
    return nil if at.nil?

    title = { "attended" => "Consult attended", "no_show" => "Missed the consult" }[appointment.status]
    title && { at: at, kind: :appointment, title: title, detail: nil }
  end

  def self.visit_entries(lead)
    lead.web_sessions.filter_map do |session|
      next if session.started_at.nil?
      { at: session.started_at, kind: :visit, title: "Visited the site",
        detail: [ session.landing_url, session.device ].compact_blank.join(" - ").presence }
    end
  end

  def self.source(lead)
    first = lead.web_sessions.select(&:started_at).min_by(&:started_at)
    {
      channel: lead.channel,
      campaign: lead.campaign,
      ad: lead.ad,
      first_visit: first&.started_at,
      pages_viewed: lead.web_sessions.sum { |session| session.pages_viewed.to_i },
      self_reported: nil
    }
  end

  def self.latest_application(lead)
    lead.applications.select(&:started_at).max_by(&:started_at)
  end

  def self.latest_appointment(lead)
    lead.appointments.select(&:booked_at).max_by(&:booked_at)
  end

  def self.short_date(time)
    time.in_time_zone(Current.agency.timezone).strftime("%b %-d")
  end
end
