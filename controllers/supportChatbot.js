const geminiService = require("../src/services/chatbotService");
const groqService = require("../src/services/grokService");
const SupportTicket = require("../models/supportChatbot");
const Buyer = require("../models/ServiceUser");
const Provider = require("../models/ServiceProvider");
const Booking = require("../models/Bookings");

const CATEGORY_MAP = {
  booking_status: "booking_status",
  payment_help: "payment_help",
  cancel_booking: "cancel_booking",
  technical_issue: "technical_issue",
  general_faq: "general_faq",
  complaint: "complaint",
  escalation_needed: "other",
  other: "other",
};

const ACTIVE_STATUSES = [
  "pending_providers",
  "awaiting_provider_acceptance",
  "provider_selected",
  "provider_accepted",
  "payment_pending",
  "paid_escrow",
  "in_progress",
];

class SupportChatbotController {
  constructor() {
    this.chat = this.chat.bind(this);
    this.getFAQ = this.getFAQ.bind(this);
    this.getBookingInfo = this.getBookingInfo.bind(this);
    this.createSupportTicket = this.createSupportTicket.bind(this);
  }

  resolveUserName(user) {
    return (
      user?.fullName ||
      `${user?.firstName || ""} ${user?.lastName || ""}`.trim() ||
      null
    );
  }

  resolveCategory(intent) {
    return CATEGORY_MAP[intent] || "other";
  }

  // controllers/supportChatbotController.js

async chat(req, res) {
  try {
    const userId = req.user?.id || null;
    const { message, conversationHistory = [], bookingId = null } = req.body;

    if (!message) {
      return res.status(400).json({
        success: false,
        message: "Message is required",
      });
    }

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    let user = await Buyer.findById(userId);
    let userRole = "buyer";
    if (!user) {
      user = await Provider.findById(userId);
      userRole = "provider";
    }

    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    const bookingQuery =
      userRole === "provider" ? { providerId: userId } : { userId };
    const bookings = await Booking.find(bookingQuery).select("status");

    const userContext = {
      userId,
      userName: this.resolveUserName(user),
      totalBookings: bookings.length,
      activeBookings: bookings.filter((b) =>
        ACTIVE_STATUSES.includes(b.status),
      ).length,
      accountType: user?.role || userRole,
    };

    // Extract booking ID from message if not provided separately
    let finalBookingId = bookingId;
    if (!finalBookingId) {
      const bookingIdMatch = message.match(/\b[0-9a-f]{24}\b/i);
      if (bookingIdMatch) {
        finalBookingId = bookingIdMatch[0];
        console.log(`📌 Extracted booking ID from message: ${finalBookingId}`);
      }
    }

    // Fetch booking context if booking ID is available
    if (finalBookingId) {
      console.log(`🔍 Fetching booking context for: ${finalBookingId} and ${userId}`);
      
      const bookingContext = await groqService.getBookingContext(
        finalBookingId,
        userId,
      );

      if (!bookingContext) {
        return res.status(404).json({
          success: false,
          message:
            "Booking not found or you do not have access to it. Please double-check the booking ID.",
        });
      }

      console.log(`✅ Booking context loaded:`, bookingContext);
      userContext.currentBooking = bookingContext;
    }

    // Call AI with enhanced context
    const result = await groqService.supportChat(
      message,
      conversationHistory,
      userContext,
    );

    // Log for debugging
    console.log(`🤖 AI Response:`, result.response);
    if (userContext.currentBooking) {
      console.log(`📊 Booking Status Used: ${userContext.currentBooking.status}`);
    }

    if (result.intent?.escalationNeeded) {
      await this.createSupportTicket(
        userId,
        userRole,
        message,
        result.intent,
      );
    }

    const faqSuggestions = await groqService.suggestFAQs(message);

    return res.status(200).json({
      success: true,
      data: {
        response: result.response,
        intent: result.intent,
        faqSuggestions,
        escalated: Boolean(result.intent?.escalationNeeded),
        // Include booking data in response for debugging
        bookingContext: userContext.currentBooking || null,
      },
    });
  } catch (error) {
    console.error("Support chatbot error:", error);
    return res.status(500).json({
      success: false,
      message:
        "Sorry, I encountered an error. Please try again or contact human support.",
      error: error.message,
    });
  }
}

  async createSupportTicket(userId, userRole, message, intent) {
    try {
      const payload = {
        subject: intent.subIntent || "Customer Support Request",
        message,
        priority: intent.extractedData?.urgency || "medium",
        category: this.resolveCategory(intent.intent),
        status: "open",
        source: "chatbot",
        metadata: {
          sentiment: intent.sentiment,
          escalationReason: intent.escalationReason,
          bookingId: intent.extractedData?.bookingId || undefined,
        },
      };

      if (userRole === "provider") {
        payload.providerId = userId;
      } else {
        payload.userId = userId;
      }

      const ticket = await SupportTicket.create(payload);
      console.log(`Support ticket created: ${ticket._id}`);
      return ticket;
    } catch (error) {
      console.error("Create support ticket error:", error);
      throw error;
    }
  }

  async getFAQ(req, res) {
    try {
      const faqs = {
        1: {
          question: "How do I book a service?",
          answer:
            "1. Browse available services or search for what you need\\n2. Describe your problem\\n3. Select a provider from our matches\\n4. Choose your preferred date and time\\n5. Make payment (held securely in escrow)\\n6. Wait for provider confirmation!",
        },
        2: {
          question: "How does payment work?",
          answer:
            "We use an escrow system:\\n1. You pay upfront when booking\\n2. Money is held securely by SabiGuy\\n3. Provider completes the work\\n4. You confirm satisfaction\\n5. We release payment to provider\\n\\nThis protects both you and the provider!",
        },
        3: {
          question: "When will my provider arrive?",
          answer:
            "You can track your provider in real-time once they accept your booking. Most providers arrive within the scheduled time window. If they are running late, they will notify you via the app.",
        },
        4: {
          question: "How do I cancel a booking?",
          answer:
            "Go to 'My Bookings' -> Select the booking -> Click 'Cancel Booking'\\n\\nCancellation policy:\\n- Free before provider accepts\\n- 50% fee after acceptance but before start\\n- No refund after work begins",
        },
        5: {
          question: "How do I get a refund?",
          answer:
            "Refunds are processed within 24-48 hours. Money returns to your original payment method or SabiGuy wallet. Contact support if you have not received your refund after 48 hours.",
        },
      };

      const { ids } = req.query;
      const requestedIds = ids
        ? ids
            .split(",")
            .map((id) => Number(id.trim()))
            .filter((id) => Number.isInteger(id) && faqs[id])
        : Object.keys(faqs).map(Number);

      const selectedFAQs = requestedIds.map((id) => ({
        id,
        ...faqs[id],
      }));

      return res.status(200).json({
        success: true,
        data: selectedFAQs,
      });
    } catch (error) {
      console.error("Get FAQ error:", error);
      return res.status(500).json({
        success: false,
        message: "Error fetching FAQs",
      });
    }
  }

  async getBookingInfo(req, res) {
    try {
      const userId = req.user.id;
      const { bookingId } = req.params;

      const bookingContext = await groqService.getBookingContext(
        bookingId,
        userId,
      );

      if (!bookingContext) {
        return res.status(404).json({
          success: false,
          message: "Booking not found",
        });
      }

      return res.status(200).json({
        success: true,
        data: bookingContext,
      });
    } catch (error) {
      console.error("Get booking info error:", error);
      return res.status(500).json({
        success: false,
        message: "Error fetching booking information",
      });
    }
  }
}

module.exports = new SupportChatbotController();
