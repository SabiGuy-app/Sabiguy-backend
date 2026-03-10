const { GoogleGenerativeAI } = require("@google/generative-ai");
const Booking = require("../../models/Bookings");

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);


class GeminiService {
    constructor() {
 this.model = genAI.getGenerativeModel({ 
      model: "gemini-1.5-flash",
      generationConfig: {
        temperature: 0.7,
        topP: 0.95,
        topK: 40,
        maxOutputTokens: 2048,
      },
    });    }
async supportChat(message, conversationHistory = [], userContext = {}) {
    try {
      const systemPrompt = this.buildSystemPrompt(userContext);

      // Build conversation history
      const history = conversationHistory.map((msg) => ({
        role: msg.role === "assistant" ? "model" : "user",
        parts: [{ text: msg.content }],
      }));

      // Create chat session
      const chat = this.model.startChat({
        history: [
          {
            role: "user",
            parts: [{ text: systemPrompt }],
          },
          {
            role: "model",
            parts: [{ text: "I understand. I'm ready to provide excellent customer support for SabiGuy users!" }],
          },
          ...history,
        ],
      });

      const result = await chat.sendMessage(message);
      const response = result.response.text();

      // Detect intent and extract actionable data
      const intent = await this.detectIntent(message, response);

      return {
        response,
        intent,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      console.error("Gemini support chat error:", error);
      throw error;
    }
  }

  buildSystemPrompt(userContext) {
    return `You are SabiBot, the friendly AI customer support assistant for SabiGuy - a service provider platform in Nigeria.

PLATFORM OVERVIEW:
SabiGuy connects users with verified service providers (plumbers, electricians, cleaners, carpenters, painters, AC technicians, etc.) across Nigeria, primarily in Lagos, Abuja, and Port Harcourt.

USER CONTEXT:
${userContext.userId ? `- User ID: ${userContext.userId}` : '- User: Not logged in'}
${userContext.userName ? `- Name: ${userContext.userName}` : ''}
${userContext.totalBookings ? `- Total Bookings: ${userContext.totalBookings}` : ''}
${userContext.activeBookings ? `- Active Bookings: ${userContext.activeBookings}` : ''}
${userContext.accountType ? `- Account Type: ${userContext.accountType}` : ''}

YOUR CAPABILITIES:
1. **Booking Support**: Help users understand booking status, track providers, reschedule, cancel
2. **Payment Help**: Explain escrow system, refunds, wallet balance, payment methods
3. **Provider Matching**: Explain how we match users with providers
4. **Account Issues**: Password reset, profile updates, verification
5. **Technical Support**: App issues, notification problems, location tracking
6. **General FAQs**: Pricing, service areas, how platform works
7. **Complaints & Escalation**: Handle complaints, know when to escalate to human support

TONE & STYLE:
- Friendly, professional, and empathetic
- Use Nigerian English naturally
- Be concise but thorough
- Show personality while maintaining professionalism
- Use emojis sparingly but appropriately 😊

IMPORTANT RULES:
1. **Never make up information** - If you don't know, say so and offer to connect them with human support
2. **Always verify before taking action** - Ask for booking IDs, confirmation before cancellations
3. **Protect privacy** - Never share other users' information
4. **Escalate when needed** - Payments disputes, serious complaints, technical bugs
5. **Stay in scope** - You're for SabiGuy support only, not general life advice

COMMON SCENARIOS:

**Booking Status Questions:**
- "Where is my provider?" → Ask for booking ID, explain tracking feature
- "Provider is late" → Acknowledge frustration, explain communication options
- "Want to cancel" → Explain cancellation policy, ask for confirmation

**Payment Questions:**
- "When do I pay?" → Explain escrow system (pay upfront, held until job done)
- "How to get refund?" → Explain refund process (24-48 hours)
- "Wallet balance?" → Guide them to wallet section in app

**Technical Issues:**
- "App not working" → Troubleshooting steps (clear cache, update app, reinstall)
- "Not getting notifications" → Check settings guide
- "Location not working" → Explain permissions needed

**Escalation Triggers:**
- Payment disputes
- Provider misconduct
- Safety concerns
- Repeated technical issues
- Angry/abusive language (stay calm, offer human support)

KNOWLEDGE BASE:

**Pricing:**
- Platform fee: 10% of service cost
- Minimum booking: ₦2,000
- Payment methods: Card, Bank Transfer, Wallet

**Service Areas:**
- Lagos (All LGAs)
- Abuja (FCT)
- Port Harcourt
- Expanding to more cities soon

**Booking Process:**
1. User describes problem
2. AI/User selects service type
3. Platform matches with available providers
4. User reviews providers and selects one
5. Payment held in escrow
6. Provider completes job
7. Payment released after confirmation

**Cancellation Policy:**
- Free cancellation before provider accepts
- 50% charge if cancelled after acceptance but before start
- No refund if cancelled after work starts

**Response Time:**
- Providers typically respond within 15 minutes
- Jobs can be scheduled same-day or in advance

When you need to:
- Check booking status → Ask for Booking ID
- Process refund → Escalate to human support
- Report provider → Escalate to human support
- Technical bug → Collect details and escalate

Remember: Your goal is to help users quickly and efficiently while maintaining excellent customer experience. Be helpful, be human, be SabiGuy! 🔧`;
  }

  async detectIntent(userMessage, botResponse) {
    try {
      const intentPrompt = `Analyze this customer support conversation and detect the user's intent.

User message: "${userMessage}"
Bot response: "${botResponse}"

Categorize the intent and extract any actionable data.

Return ONLY valid JSON:
{
  "intent": "booking_status|payment_help|cancel_booking|technical_issue|general_faq|complaint|escalation_needed|other",
  "subIntent": "more specific intent if applicable",
  "requiresAction": boolean,
  "actionType": "check_booking|cancel_booking|refund|escalate|none",
  "extractedData": {
    "bookingId": "string or null",
    "issueType": "string or null",
    "urgency": "low|medium|high|critical or null"
  },
  "sentiment": "positive|neutral|negative|angry",
  "escalationNeeded": boolean,
  "escalationReason": "string or null"
}`;

      const result = await this.model.generateContent(intentPrompt);
      const intentText = result.response.text();

      const jsonMatch = intentText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }

      return {
        intent: "other",
        requiresAction: false,
        actionType: "none",
        sentiment: "neutral",
        escalationNeeded: false,
      };
    } catch (error) {
      console.error("Intent detection error:", error);
      return {
        intent: "other",
        requiresAction: false,
        actionType: "none",
        sentiment: "neutral",
        escalationNeeded: false,
      };
    }
  }

  // Get relevant booking information for context
  async getBookingContext(bookingId, userId) {
    try {
      const booking = await Booking.findOne({
        _id: bookingId,
        $or: [{ userId }, { providerId: userId }],
      })
        .populate("providerId", "fullName phoneNumber rating")
        .populate("userId", "fullName");

      if (!booking) {
        return null;
      }

      return {
        id: booking._id,
        status: booking.status,
        serviceType: booking.serviceType,
        scheduleDate: booking.scheduleDate,
        provider: booking.providerId
          ? {
              name: booking.providerId.fullName,
              phone: booking.providerId.phoneNumber,
              rating: booking.providerId.rating,
            }
          : null,
        paymentStatus: booking.payment?.escrowStatus,
        totalAmount: booking.totalAmount,
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

Return ONLY a JSON array of 3 most relevant FAQ numbers:
[1, 5, 15]`;

      const result = await this.model.generateContent(faqPrompt);
      const text = result.response.text();

      const arrayMatch = text.match(/\[[\d,\s]+\]/);
      if (arrayMatch) {
        return JSON.parse(arrayMatch[0]);
      }

      return [1, 2, 3]; // Default suggestions
    } catch (error) {
      console.error("FAQ suggestion error:", error);
      return [1, 2, 3];
    }
  }
}

module.exports = new GeminiService();
