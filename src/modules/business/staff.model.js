const mongoose = require("mongoose");

const STAFF_STATUSES = ["INVITED", "ACTIVE", "DECLINED", "EXPIRED", "REMOVED"];
const WORK_STATUSES = ["offline", "available", "booked", "in_service"];
const CLOCK_ACTIONS = ["clock_in", "clock_out"];
const CLOCK_REQUEST_STATUSES = ["pending", "approved", "rejected", "cancelled"];

const staffSchema = new mongoose.Schema(
  {
    business: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Business",
      required: true,
      index: true,
    },
    // The invite key. Invitations are always addressed by email; the staff's
    // Provider account is resolved on acceptance, never at invite time.
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
    },
    provider: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Provider",
      default: null,
    },
    // Human-readable code (SGD-######) generated when the invite is accepted.
    staffCode: {
      type: String,
      default: null,
    },
    role: {
      type: String,
      required: true,
      trim: true,
    },
    // Snapshot of business service names this staff member can perform.
    services: {
      type: [String],
      default: [],
    },
    canDoHomeService: {
      type: Boolean,
      default: false,
    },
    status: {
      type: String,
      enum: STAFF_STATUSES,
      default: "INVITED",
      index: true,
    },
    // Working state shown on the "Staff on duty" board. Distinct from `status`
    // (account lifecycle). `in_service` is derived live from the staff's active
    // booking; the stored value captures the clock-in/available baseline.
    workStatus: {
      type: String,
      enum: WORK_STATUSES,
      default: "offline",
    },
    invitedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Business",
      required: true,
    },
    inviteToken: {
      type: String,
      required: true,
      unique: true,
    },
    inviteExpiresAt: {
      type: Date,
      required: true,
    },
    onDuty: {
      active: { type: Boolean, default: false },
      since: { type: Date, default: null },
      lastClockInAt: { type: Date, default: null },
      lastClockOutAt: { type: Date, default: null },
    },
    // Latest clock-in/out request. Staff request, the business owner approves
    // or rejects; onDuty only changes on approval. One pending at a time.
    clockRequest: {
      action: { type: String, enum: CLOCK_ACTIONS, default: null },
      status: { type: String, enum: CLOCK_REQUEST_STATUSES, default: null },
      requestedAt: { type: Date, default: null },
      respondedAt: { type: Date, default: null },
      respondedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Business",
        default: null,
      },
      reason: { type: String, default: null },
    },
    acceptedAt: { type: Date, default: null },
    declinedAt: { type: Date, default: null },
    removedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

// One live (invited or active) record per email per business at a time.
staffSchema.index(
  { business: 1, email: 1 },
  {
    unique: true,
    partialFilterExpression: { status: { $in: ["INVITED", "ACTIVE"] } },
  },
);

staffSchema.statics.STAFF_STATUSES = STAFF_STATUSES;
staffSchema.statics.WORK_STATUSES = WORK_STATUSES;
staffSchema.statics.CLOCK_ACTIONS = CLOCK_ACTIONS;

module.exports = mongoose.model("Staff", staffSchema);
