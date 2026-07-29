// models/SupportTicket.js
const mongoose = require("mongoose");

const supportTicketSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Buyer",
    },
     providerId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Provider",
        },
    subject: {
      type: String,
      required: true,
    },
    message: {
      type: String,
      required: true,
    },
    priority: {
      type: String,
      enum: ["low", "medium", "high", "critical"],
      default: "medium",
    },
    category: {
      type: String,
      enum: [
        "booking_status",
        "payment_help",
        "cancel_booking",
        "technical_issue",
        "general_faq",
        "complaint",
        "other",
      ],
      default: "other",
    },
    status: {
      type: String,
      enum: ["open", "in-progress", "resolved", "closed"],
      default: "open",
    },
    source: {
      type: String,
      enum: ["chatbot", "email", "phone", "web"],
      default: "chatbot",
    },
    assignedTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
    },
    metadata: {
      sentiment: String,
      escalationReason: String,
      bookingId: mongoose.Schema.Types.ObjectId,
    },
    responses: [
      {
        from: {
          type: String,
          enum: ["user", "support", "chatbot"],
        },
        message: String,
        timestamp: {
          type: Date,
          default: Date.now,
        },
      },
    ],
    resolvedAt: Date,
  },
  {
    timestamps: true,
    validateBeforeSave: true,
  }
);

supportTicketSchema.pre("validate", function (next) {
  if (!this.userId && !this.providerId) {
    return next(new Error("Either userId or providerId is required"));
  }
  return next();
});

module.exports = mongoose.model("SupportTicket", supportTicketSchema);
