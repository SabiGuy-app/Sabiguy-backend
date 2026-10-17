const mongoose = require("mongoose");

const callSchema = new mongoose.Schema(
  {
    bookingId: { type: mongoose.Schema.Types.ObjectId, ref: "Booking", required: true, index: true },
    callerId: { type: mongoose.Schema.Types.ObjectId, required: true },
    callerType: { type: String, enum: ["buyer", "provider"], required: true },
    callerName: { type: String, default: "" },
    receiverId: { type: mongoose.Schema.Types.ObjectId, required: true },
    receiverType: { type: String, enum: ["buyer", "provider"], required: true },
    offer: { type: mongoose.Schema.Types.Mixed, required: true },
    iceServers: { type: [mongoose.Schema.Types.Mixed], default: [] },
    status: { type: String, enum: ["ringing", "accepted", "rejected", "cancelled", "expired"], default: "ringing", index: true },
    expiresAt: { type: Date, required: true, index: true },
  },
  { timestamps: true },
);

module.exports = mongoose.model("Call", callSchema);
