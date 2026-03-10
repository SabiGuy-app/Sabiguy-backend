// services/groqService.js
const Groq = require("groq-sdk");
const Booking = require ('../../models/Bookings')

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

class GroqService {
 // services/groqService.js

async supportChat(message, conversationHistory = [], userContext = {}) {
  try {
    const systemPrompt = this.buildSystemPrompt(userContext);

    // If booking context exists, prepend a reminder to the user message
    let enhancedMessage = message;
    if (userContext.currentBooking) {
      enhancedMessage = `[BOOKING DATA AVAILABLE - USE IT]

User's booking details are already loaded in your system prompt. Use the EXACT status and information provided.

User's question: ${message}`;
    }

    const messages = [
      { role: "system", content: systemPrompt },
      ...conversationHistory.map((msg) => ({
        role: msg.role,
        content: msg.content,
      })),
      { role: "user", content: enhancedMessage },
    ];

    const completion = await groq.chat.completions.create({
      messages,
      model: "llama-3.3-70b-versatile",
      temperature: 0.5, // Lower temperature for more factual responses
      max_tokens: 2048,
      top_p: 0.9,
      stream: false,
    });

    const response = completion.choices[0].message.content;

    // Verify the response mentions the correct booking status if booking context exists
    if (userContext.currentBooking) {
      const actualStatus = userContext.currentBooking.status;
      console.log(`✅ Expected booking status: ${actualStatus}`);
      console.log(`📝 AI response mentions: ${response.includes(actualStatus) ? 'Correct status ✓' : 'WARNING: Wrong status ⚠️'}`);
    }

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
  // Build booking context section if available
  let bookingContextSection = "";
  if (userContext.currentBooking) {
    bookingContextSection = `
CURRENT BOOKING INFORMATION (USE THIS EXACT DATA):
- Booking ID: ${userContext.currentBooking.id}
- Status: ${userContext.currentBooking.status}
- Service Type: ${userContext.currentBooking.serviceType}
- Scheduled Date: ${userContext.currentBooking.scheduledDate || "Not scheduled"}
- Provider: ${userContext.currentBooking.provider?.name || "Not assigned yet"}
- Provider Phone: ${userContext.currentBooking.provider?.phone || "N/A"}
- Provider Rating: ${userContext.currentBooking.provider?.rating || "N/A"}/5
- Payment Status: ${userContext.currentBooking.paymentStatus || "N/A"}
- Total Amount: ₦${userContext.currentBooking.totalAmount?.toLocaleString() || "N/A"}
- Created: ${new Date(userContext.currentBooking.createdAt).toLocaleDateString()}

⚠️ CRITICAL: Use the EXACT status above. Do NOT make up or assume the status.
`;
  }

  return `You are SabiBot, the friendly AI customer support assistant for SabiGuy - a service provider platform in Nigeria.

PLATFORM OVERVIEW:
SabiGuy connects users with verified service providers (plumbers, electricians, cleaners, carpenters, painters, AC technicians, etc.) across Nigeria, primarily in Lagos, Abuja, and Port Harcourt.

USER CONTEXT:
${userContext.userId ? `- User ID: ${userContext.userId}` : "- User: Not logged in"}
${userContext.userName ? `- Name: ${userContext.userName}` : ""}
${userContext.totalBookings ? `- Total Bookings: ${userContext.totalBookings}` : ""}
${userContext.activeBookings ? `- Active Bookings: ${userContext.activeBookings}` : ""}
${userContext.accountType ? `- Account Type: ${userContext.accountType}` : ""}

${bookingContextSection}

YOUR CAPABILITIES:
1. **Booking Support**: Help users understand booking status, track providers, reschedule, cancel
2. **Payment Help**: Explain escrow system, refunds, wallet balance, payment methods
3. **Provider Matching**: Explain how we match users with providers
4. **Account Issues**: Password reset, profile updates, verification
5. **Technical Support**: App issues, notification problems, location tracking
6. **General FAQs**: Pricing, service areas, how platform works
7. **Complaints & Escalation**: Handle complaints, know when to escalate

BOOKING STATUS DEFINITIONS (USE THESE EXACTLY):
- "pending" or "pending_providers": Waiting for providers to respond
- "confirmed": Provider accepted, not started yet
- "in-progress": Service is currently being performed
- "completed": Service finished, awaiting confirmation
- "cancelled": Booking was cancelled
- "paid_escrow": Payment secured in escrow

TONE & STYLE:
- Friendly, professional, and empathetic
- Use Nigerian English naturally (e.g., "I go help you", "No wahala")
- Be concise but thorough
- Show personality while maintaining professionalism
- Use emojis sparingly 😊

IMPORTANT RULES:
1. ⚠️ NEVER make up booking information - Use ONLY the data provided above
2. If booking data is provided, use the EXACT status and details
3. If no booking data is provided, ask for booking ID
4. Never assume or guess - if you don't know, say so
5. Always verify before taking action
6. Protect user privacy
7. Escalate when needed

RESPONSE GUIDELINES WHEN BOOKING ID IS PROVIDED:
✅ DO: "Your booking status is: [EXACT STATUS FROM DATA]"
✅ DO: Reference the exact provider name, date, and payment status from the data
❌ DON'T: Say "let me check" if the data is already provided
❌ DON'T: Make up or assume any status
❌ DON'T: Use generic phrases like "on their way" unless the data confirms it

COMMON SCENARIOS:
- Status "pending_providers" → "Your booking is waiting for available providers to respond. We're matching you with the best providers in your area."
- Status "confirmed" → "Your booking is confirmed! [Provider name] will arrive on [date]."
- Status "in-progress" → "Your service is currently in progress with [provider name]."
- Status "completed" → "Your service is complete! Please confirm and rate your experience."

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
  // Generate FAQ suggestions based on user message
  async suggestFAQs(userMessage) {
    try {
      const faqPrompt = `Based on this user question: "${userMessage}"

Suggest 3 relevant FAQ topics from this list that might help the user:

1. How do I book a service?
2. How does payment work?
3. When will my provider arrive?
4. How do I cancel a booking?
5. How do I get a refund?
6. What if I'm not satisfied with the service?
7. How do I contact my provider?
8. What are your service areas?
9. How do I become a provider?
10. How do I update my profile?
11. Why can't I see available providers?
12. How do I add money to my wallet?
13. What if the provider doesn't show up?
14. How do I rate a provider?
15. Is my payment secure?

Return ONLY valid JSON:
{"faqIds":[1,5,15]}`;

      const completion = await groq.chat.completions.create({
        messages: [{ role: "user", content: faqPrompt }],
        model: "llama-3.3-70b-versatile",
        temperature: 0.2,
        max_tokens: 256,
        response_format: { type: "json_object" },
      });

      const text = completion.choices[0].message.content;
      const parsed = JSON.parse(text);
      const ids = Array.isArray(parsed?.faqIds) ? parsed.faqIds : [];
      const normalized = ids
        .map((id) => Number(id))
        .filter((id) => Number.isInteger(id) && id >= 1 && id <= 15)
        .slice(0, 3);

      if (normalized.length === 3) {
        return normalized;
      }

      return [1, 2, 3]; // Default suggestions
    } catch (error) {
      console.error("FAQ suggestion error:", error);
      return [1, 2, 3];
    }
  }
}

module.exports = new GroqService();
