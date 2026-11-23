const mongoose = require("mongoose");

const spinSchema = new mongoose.Schema(
  {
    spinNumber: { type: Number, required: true, enum: [1, 2] },
    outcomeCode: { type: String },
    outcomeLabel: { type: String },
    amount: { type: Number, default: 0 },
    spinAt: { type: Date, required: true, default: Date.now },
    idempotencyKey: { type: String },
  },
  { _id: false },
);

const participationSchema = new mongoose.Schema(
  {
    campaignId: { type: mongoose.Schema.Types.ObjectId, ref: "Campaign", required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "Buyer", required: true },
    spinCount: { type: Number, default: 0, min: 0, max: 2 },
    rewardGranted: { type: Boolean, default: false },
    spins: { type: [spinSchema], default: [] },
  },
  { timestamps: true },
);

participationSchema.index({ campaignId: 1, userId: 1 }, { unique: true });
participationSchema.index({ campaignId: 1, spinCount: 1 });

module.exports = mongoose.model("CampaignParticipation", participationSchema);
