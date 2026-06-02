const mongoose = require("mongoose");

const bookingSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Buyer",
      required: true,
    },
    providerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Provider",
    },

    // Service info
    serviceType: {
      type: String,
      required: true,
    },
    subCategory: {
      type: String,
    },
    title: {
      type: String,
    },
    description: {
      type: String,
    },

    // Location (for regular services)
    location: {
      address: {
        type: String,
        required: false,
      },
      coordinates: {
        type: {
          type: String,
          enum: ["Point"],
        },
        coordinates: {
          type: [Number], // [lng, lat]
        },
      },
    },

    // Transport / Logistics
    pickupLocation: {
      address: String,
      coordinates: {
        type: {
          type: String,
          enum: ["Point"],
        },
        coordinates: {
          type: [Number], // [lng, lat]
        },
      },
    },
    pickupNote: {
      type: String,
    },

    dropoffLocation: {
      address: String,
      coordinates: {
        type: {
          type: String,
          enum: ["Point"],
        },
        coordinates: {
          type: [Number], // [lng, lat]
        },
      },
    },
    // Distance (for transport/logistics)
    distance: {
      value: Number, // in kilometers
      unit: {
        type: String,
        default: "km",
      },
    },
    // Booking schema additions
    providerETA: {
      value: Number,
      unit: { type: String, default: "minutes" },
    },

    rideDuration: {
      value: Number,
      unit: { type: String, default: "minutes" },
      isEstimate: { type: Boolean, default: false },
    },

    bookingDuration: {
      value: Number,
      unit: { type: String, default: "minutes" },
      breakdown: {
        providerToPickup: Number,
        pickupToDropoff: Number,
      },
    },
    providerDistances: [
      {
        providerId: { type: mongoose.Schema.Types.ObjectId, ref: "Provider" },
        distanceFromPickup: Number,
        providerETAMinutes: Number,
        vehicleProductionYear: Number,
      },
    ],
    providerPricingOptions: {
      type: [
        {
          providerId: { type: mongoose.Schema.Types.ObjectId, ref: "Provider" },
          riderPays: Number,
          driverReceives: Number,
          platformEarns: Number,
          breakdown: {
            type: mongoose.Schema.Types.Mixed,
            default: null,
          },
          meta: {
            type: mongoose.Schema.Types.Mixed,
            default: null,
          },
        },
      ],
      default: [],
    },
    estimatedCompletionAt: Date,
    estimatedDuration: {
      value: Number,
      unit: {
        type: String,
        default: "minutes",
      },
      isEstimate: {
        type: Boolean,
        default: false,
      },
    },
    estimatedArrivalAt: Date,

    // Schedule
    scheduleType: {
      type: String,
      enum: ["immediate", "scheduled"],
      required: true,
    },
    scheduleDate: Date,
    scheduledTime: String,
    startDate: Date,
    endDate: Date,

    // Pricing
    budget: {
      type: Number,
      required: false,
    },
    agreedPrice: Number,
    calculatedPrice: Number, // Auto-calculated for transport/logistics
    driverReceives: Number,
    serviceFee: Number, // Platform fee (5%)
    providerCommission: Number, // Platform commission from provider (15%)
    providerReceives: Number, // Net amount provider receives from escrow
    platformEarns: Number, // Total platform earnings (user fee + provider commission)
    pricingBreakdown: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    pricingMeta: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    applyRideDiscount: {
      type: Boolean,
      default: false,
    },
    totalAmount: Number,

    // Provider management
    suggestedProviders: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Provider",
      },
    ],
    notifiedProviders: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Provider",
      },
    ],

    providerOffer: Number,
    providerResponse: {
      type: String,
      enum: ["pending", "accepted", "declined", "counter_offer"],
      default: "pending",
    },

    // Status
    status: {
      type: String,
      enum: [
        "pending_providers", // User created, awaiting provider selection
        "awaiting_provider_acceptance", // Transport: waiting for fastest finger
        "provider_selected", // Provider selected/accepted
        "payment_pending", // Awaiting payment
        "paid_escrow",
        "provider_accepted",
        "accept_selection",
        "in_progress",
        "arrived_at_pickup",
        "enroute_to_dropoff",
        "arrived_at_dropoff",
        "completed", // Service completed
        "cancelled", // Cancelled
        "user_accepted_completion",
        "funds_released", // Payment released to provider
        "disputed", // Dispute raised
      ],
      default: "pending_providers",
    },

    payment: {
      paystackRef: String,
      escrowAmount: Number,
      providerReceives: Number,
      discount: {
        code: String,
        percent: Number,
        amount: Number,
        applied: Boolean,
        reason: String,
        maxDiscount: Number,
      },
      escrowStatus: {
        type: String,
        enum: ["held", "pending", "released", "refunded"],
      },
      paidAt: Date,
      releasedAt: Date,
    },
    modeOfDelivery: {
      type: String,
      enum: ["Car", "Bike"],
    },
    // Timestamps for tracking
    acceptedAt: Date,
    selectedAt: Date,
    startedAt: Date,
    completedAt: Date,
    lastNotifiedAt: { type: Date },

    // Attachments
    attachments: [String],

    // Cancellation
    cancellationReason: String,
    cancelledBy: {
      type: mongoose.Schema.Types.ObjectId,
      refPath: "cancelledByModel",
    },
    cancelledByModel: {
      type: String,
      enum: ["User", "Provider"],
    },

    // Ratings
    rating: {
      score: Number,
      review: String,
      ratedAt: Date,
    },
    tipAmount: Number,

    // Dispute
    disputeRaisedAt: Date,
    disputeRaisedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ServiceUser",
    },
    disputeReason: String,
    disputeResolution: String,
    disputeResolvedAt: Date,
  },
  {
    timestamps: true,
  },
);

// Indexes
bookingSchema.index({ userId: 1, status: 1 });
bookingSchema.index({ providerId: 1, status: 1 });
bookingSchema.index({ status: 1 });
bookingSchema.index({ "location.coordinates": "2dsphere" });
bookingSchema.index({ "pickupLocation.coordinates": "2dsphere" });
bookingSchema.index({ "dropoffLocation.coordinates": "2dsphere" });

module.exports = mongoose.model("Booking", bookingSchema);
