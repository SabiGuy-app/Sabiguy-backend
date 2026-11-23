const mongoose = require("mongoose");

const prizeSchema = new mongoose.Schema(
  {
    code: { type: String, required: true },
    label: { type: String, required: true },
    amount: { type: Number, required: true, min: 0 },
    remaining: { type: Number, required: true, min: 0 },
  },
  { _id: false },
);

const campaignSchema = new mongoose.Schema(
  {
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    name: { type: String, required: true, trim: true },
    status: {
      type: String,
      enum: ["draft", "active", "paused", "closed"],
      default: "draft",
    },
    startsAt: Date,
    endsAt: Date,
    maxRewardSpins: { type: Number, required: true, default: 350, min: 1 },
    maxPayout: { type: Number, required: true, default: 50000, min: 0 },
    spinsPerUser: { type: Number, required: true, default: 2, min: 1 },
    creditValidityDays: { type: Number, required: true, default: 30, min: 1 },
    prizes: { type: [prizeSchema], required: true },
    stats: {
      qrScans: { type: Number, default: 0 },
      registrations: { type: Number, default: 0 },
      rewardSpins: { type: Number, default: 0 },
      winners: { type: Number, default: 0 },
      totalPaid: { type: Number, default: 0 },
      providerRegistrations: { type: Number, default: 0 },
      bookingsGenerated: { type: Number, default: 0 },
    },
  },
  { timestamps: true },
);

campaignSchema.index({ status: 1, startsAt: 1, endsAt: 1 });

module.exports = mongoose.model("Campaign", campaignSchema);
