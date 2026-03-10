// services/groqService.js
const Groq = require("groq-sdk");
const Booking = require ('../../models/Bookings')

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

class GroqService {
  async supportChat(message, conversationHistory = [], userContext = {}) {
    try {
      const systemPrompt = this.buildSystemPrompt(userContext);

      const messages = [
        { role: "system", content: systemPrompt },
        ...conversationHistory.map((msg) => ({
          role: msg.role,
          content: msg.content,
        })),
        { role: "user", content: message },
      ];

      const completion = await groq.chat.completions.create({
        messages,
        model: "llama-3.3-70b-versatile", // Fast and free
        temperature: 0.7,
        max_tokens: 2048,
        top_p: 1,
        stream: false,
      });

      const response = completion.choices[0].message.content;

      // Detect intent
      const intent = await this.detectIntent(message, response);

      return {
        response,
        intent,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      console.error("Groq chat error:", error);
      throw error;
    }
  }

  async detectIntent(userMessage, botResponse) {
    try {
      const intentPrompt = `Analyze this customer support conversation and detect the user's intent.

User message: "${userMessage}"
Bot response: "${botResponse}"

Return ONLY valid JSON:
{
  "intent": "booking_status|payment_help|cancel_booking|technical_issue|general_faq|complaint|escalation_needed|other",
  "requiresAction": true/false,
  "sentiment": "positive|neutral|negative|angry",
  "escalationNeeded": true/false,
  "escalationReason": "string or null"
}`;

      const completion = await groq.chat.completions.create({
        messages: [{ role: "user", content: intentPrompt }],
        model: "llama-3.3-70b-versatile",
        temperature: 0.3,
        max_tokens: 512,
        response_format: { type: "json_object" }, // Force JSON response
      });

      const intentText = completion.choices[0].message.content;
      return JSON.parse(intentText);
    } catch (error) {
      console.error("Intent detection error:", error);
      return {
        intent: "other",
        requiresAction: false,
        sentiment: "neutral",
        escalationNeeded: false,
      };
    }
  }

  buildSystemPrompt(userContext) {
    return `You are SabiBot, the friendly AI customer support assistant for SabiGuy - a service provider platform in Nigeria.

PLATFORM OVERVIEW:
SabiGuy connects users with verified service providers (plumbers, electricians, cleaners, carpenters, painters, AC technicians, etc.) across Nigeria, primarily in Lagos, Abuja, and Port Harcourt.

USER CONTEXT:
${userContext.userId ? `- User ID: ${userContext.userId}` : "- User: Not logged in"}
${userContext.userName ? `- Name: ${userContext.userName}` : ""}
${userContext.totalBookings ? `- Total Bookings: ${userContext.totalBookings}` : ""}
${userContext.activeBookings ? `- Active Bookings: ${userContext.activeBookings}` : ""}

YOUR CAPABILITIES:
1. **Booking Support**: Help users understand booking status, track providers, reschedule, cancel
2. **Payment Help**: Explain escrow system, refunds, wallet balance, payment methods
3. **Provider Matching**: Explain how we match users with providers
4. **Account Issues**: Password reset, profile updates, verification
5. **Technical Support**: App issues, notification problems, location tracking
6. **General FAQs**: Pricing, service areas, how platform works
7. **Complaints & Escalation**: Handle complaints, know when to escalate

TONE & STYLE:
- Friendly, professional, and empathetic
- Use Nigerian English naturally
- Be concise but thorough
- Show personality while maintaining professionalism
- Use emojis sparingly 😊

IMPORTANT RULES:
1. Never make up information
2. Always verify before taking action
3. Protect user privacy
4. Escalate when needed
5. Stay in scope - SabiGuy support only

COMMON SCENARIOS:
- "Where is my provider?" → Ask for booking ID, explain tracking
- "Want to cancel" → Explain policy, ask confirmation
- "Payment issue" → Explain escrow, guide to wallet
- "App not working" → Troubleshooting steps

When you need to escalate, clearly state: "Let me connect you with a human agent."`;
  }

  async getBookingContext(bookingId, userId) {
    // Same as before
    try {
      const booking = await Booking.findOne({
        _id: bookingId,
        userId,
      })
        .populate("providerId", "fullName phoneNumber rating")
        .populate("userId", "firstName lastName");

      if (!booking) return null;

      return {
        id: booking._id,
        status: booking.status,
        serviceType: booking.serviceType,
        scheduledDate: booking.scheduledDate,
        provider: booking.providerId
          ? {
              name: booking.providerId.fullName,
              phone: booking.providerId.phoneNumber,
              rating: booking.providerId.rating,
            }
          : null,
        paymentStatus: booking.payment?.escrowStatus,
        totalAmount: booking.payment?.totalAmount,
        createdAt: booking.createdAt,
      };
    } catch (error) {
      console.error("Get booking context error:", error);
      return null;
    }
  }
}

module.exports = new GroqService();