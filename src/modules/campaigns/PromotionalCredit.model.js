const mongoose = require("mongoose");

const reminderSchema = new mongoose.Schema(
  {
    day: { type: Number, required: true },
    sentAt: { type: Date, required: true },
  },
  { _id: false },
);

const promotionalCreditSchema = new mongoose.Schema(
  {
    campaignId: { type: mongoose.Schema.Types.ObjectId, ref: "Campaign", required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "Buyer", required: true },
    spinId: { type: mongoose.Schema.Types.ObjectId, ref: "CampaignParticipation", required: true },
    originalAmount: { type: Number, required: true, min: 0 },
    remainingAmount: { type: Number, required: true, min: 0 },
    usedAmount: { type: Number, required: true, default: 0, min: 0 },
    expiresAt: { type: Date, required: true },
    status: {
      type: String,
      enum: ["active", "used", "expired"],
      default: "active",
    },
    remindersSent: { type: [reminderSchema], default: [] },
  },
  { timestamps: true },
);

promotionalCreditSchema.index({ campaignId: 1, userId: 1 });
promotionalCreditSchema.index({ status: 1, expiresAt: 1 });
promotionalCreditSchema.index({ userId: 1, status: 1, expiresAt: 1 });
promotionalCreditSchema.index({ spinId: 1 }, { unique: true });

module.exports = mongoose.model("PromotionalCredit", promotionalCreditSchema);
