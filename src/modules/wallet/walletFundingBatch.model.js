const mongoose = require("mongoose");

const walletFundingBatchSchema = new mongoose.Schema(
  {
    reference: {
      type: String,
      required: true,
      unique: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      required: true,
    },
    initiatedByEmail: {
      type: String,
      required: true,
    },
    paymentPayerEmail: String,
    totalAmount: {
      type: Number,
      required: true,
      min: 1,
    },
    currency: {
      type: String,
      enum: ["NGN"],
      default: "NGN",
    },
    entries: [
      {
        buyerId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Buyer",
          required: true,
        },
        email: {
          type: String,
          required: true,
        },
        amount: {
          type: Number,
          required: true,
          min: 1,
        },
      },
    ],
    reason: {
      type: String,
      required: true,
      trim: true,
      maxlength: 500,
    },
    status: {
      type: String,
      enum: [
        "initializing",
        "pending_payment",
        "paid_pending_credit",
        "completed",
        "failed",
      ],
      default: "initializing",
      required: true,
    },
    authorizationUrl: String,
    paymentResponse: mongoose.Schema.Types.Mixed,
    paidAt: Date,
    completedAt: Date,
    error: String,
  },
  { timestamps: true },
);

module.exports = mongoose.model(
  "WalletFundingBatch",
  walletFundingBatchSchema,
);
