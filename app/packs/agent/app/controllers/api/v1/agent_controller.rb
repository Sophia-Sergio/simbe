module Api
  module V1
    # The Ask Simbe API (spec 2013, decisions 5-6): send a message (synchronous answer with a
    # single-flight turn lock), read a conversation the caller owns, starter chips and the
    # month's token usage. Thin — one service, one serializer; tenancy and the user scope are
    # enforced here, so another user's or agency's conversation is a 404, never a 403.
    class AgentController < Api::BaseController
      before_action :require_owner!, only: :usage

      # Raised when a turn is already running for the conversation (single-flight).
      InProgress = Class.new(StandardError)

      OWNER_SUGGESTIONS = [
        "Which channel costs the most per qualified lead?",
        "Where do most applicants drop off?",
        "How should I split next month's budget?",
        "Who needs support on my team?"
      ].freeze

      COORDINATOR_SUGGESTIONS = [
        "What should I do first today?",
        "Which leads have been waiting longest?",
        "How many next actions do I have left?"
      ].freeze

      rescue_from InProgress do
        render_error("already_in_progress", "Still working on your last question", :conflict)
      end

      rescue_from Agent::TurnRunner::Error do
        render_error("model_unavailable", "I couldn't reach the model. Try again.", :bad_gateway)
      end

      def create
        text = params[:text].to_s
        return render_error("empty_text", "Message text is required", :unprocessable_entity) if text.strip.empty?
        return render_error("text_too_long", "Message must be at most 500 characters", :unprocessable_entity) if text.length > 500

        conversation = find_or_create_conversation(text)
        message = run_turn(conversation, text)
        render json: { conversation_id: conversation.id, message: serialize_message(message) }, status: :created
      end

      def show
        conversation = conversations.find(params[:id])
        render json: { id: conversation.id, messages: messages_for(conversation).map { |message| serialize_message(message) } }
      end

      def suggestions
        list = Current.user.owner? ? OWNER_SUGGESTIONS : COORDINATOR_SUGGESTIONS
        render json: { suggestions: list }
      end

      def usage
        events = AiUsageEvent.where(created_at: month_range)
        priced = events.where.not(cost_cents: nil)
        render json: {
          month: month,
          input_tokens: events.sum(:input_tokens),
          output_tokens: events.sum(:output_tokens),
          cost_cents: priced.exists? ? priced.sum(:cost_cents) : nil
        }
      end

      private

      # Only the signed-in user's own conversations, within the signed-in agency (the model's
      # default scope); anything else is a 404.
      def conversations
        AgentConversation.where(user_id: Current.user.id)
      end

      def messages_for(conversation)
        AgentMessage.where(conversation_id: conversation.id).order(:created_at)
      end

      def find_or_create_conversation(text)
        return conversations.find(params[:conversation_id]) if params[:conversation_id].present?

        AgentConversation.create!(agency: Current.agency, user: Current.user, title: text[0, 60])
      end

      # Acquire the turn lock under a row lock (a second turn while one runs is a 409), then
      # run the turn outside the lock. Agent::TurnRunner releases `turn_started_at` in its
      # `ensure`, so a provider failure frees the lock too.
      def run_turn(conversation, text)
        conversation.with_lock do
          raise InProgress if conversation.turn_started_at.present?

          conversation.update!(turn_started_at: Time.current)
        end
        Agent::TurnRunner.call(conversation: conversation, text: text)
      end

      def serialize_message(message)
        { id: message.id, role: message.role, body: message.body, created_at: message.created_at.iso8601 }
      end

      def month = Time.current.strftime("%Y-%m")
      def month_range = Time.current.beginning_of_month..Time.current.end_of_month
    end
  end
end
