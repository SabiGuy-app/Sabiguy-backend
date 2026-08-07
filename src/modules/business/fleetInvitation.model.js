const mongoose = require("mongoose");

const INVITATION_STATUSES = [
  "PENDING",
  "ACCEPTED",
  "REJECTED",
  "EXPIRED",
  "CANCELLED",
];

const fleetInvitationSchema = new mongoose.Schema(
  {
    business: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Business",
      required: true,
      index: true,
    },
    driver: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Provider",
      required: true,
      index: true,
    },
    // Snapshot of the email the invite was sent to, in case the driver
    // later changes their account email.
    driverEmail: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
    },
    role: {
      type: String,
      default: "driver",
      trim: true,
    },
    status: {
      type: String,
      enum: INVITATION_STATUSES,
      default: "PENDING",
      index: true,
    },
    // Opaque token embedded in the invitation email link. Not required by
    // the authenticated respond endpoint, but kept so the email link can
    // safely identify/deep-link a specific invitation without exposing it
    // to enumeration.
    token: {
      type: String,
      required: true,
      unique: true,
    },
    tokenExpiresAt: {
      type: Date,
      required: true,
    },
    invitedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Business",
      required: true,
    },
    respondedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true },
);

// A driver can only have one active (PENDING) invitation per business at a time.
fleetInvitationSchema.index(
  { business: 1, driver: 1 },
  { unique: true, partialFilterExpression: { status: "PENDING" } },
);

fleetInvitationSchema.statics.INVITATION_STATUSES = INVITATION_STATUSES;

module.exports = mongoose.model("FleetInvitation", fleetInvitationSchema);
