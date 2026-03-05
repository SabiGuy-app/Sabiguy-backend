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
    required: false  
  },
  coordinates: {
    type: {
      type: String,
      enum: ["Point"],
    },
    coordinates: {
      type: [Number],   // [lng, lat]
    }
  }
},

    
   // Transport / Logistics
pickupLocation: {
  address: String,
  coordinates: {
    type: {
      type: String,
      enum: ['Point'],
    },
    coordinates: {
      type: [Number] // [lng, lat]
    }
  }
},

dropoffLocation: {
  address: String,
  coordinates: {
    type: {
      type: String,
      enum: ['Point'],
    },
    coordinates: {
      type: [Number] // [lng, lat]
    }
  }
},
    // Distance (for transport/logistics)
    distance: {
      value: Number, // in kilometers
      unit: {
        type: String,
        default: 'km'
      }
    },
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
      enum: ['immediate', 'scheduled'],
      required: true
    },
    scheduleDate: Date,
    startDate: Date,
    endDate: Date,
    
    // Pricing
    budget: {
      type: Number,
      required: false
    },
    agreedPrice: Number,
    calculatedPrice: Number, // Auto-calculated for transport/logistics
    serviceFee: Number, // Platform fee (10%)
    totalAmount: Number,
    
    // Provider management
    suggestedProviders: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Provider'
    }],
    notifiedProviders: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Provider'
    }],
    
    providerOffer: Number,
    providerResponse: {
      type: String,
      enum: ['pending', 'accepted', 'declined', 'counter_offer'],
      default: 'pending'
    },
    
    // Status
    status: {
      type: String,
      enum: [
        'pending_providers',           // User created, awaiting provider selection
        'awaiting_provider_acceptance', // Transport: waiting for fastest finger
        'provider_selected',            // Provider selected/accepted
        'payment_pending',              // Awaiting payment
        'paid_escrow',                 
        'in_progress',                  
        'arrived_at_pickup',              
        'enroute_to_dropoff',             
        'arrived_at_dropoff',              
        'completed',                    // Service completed
        'cancelled',                    // Cancelled
        'user_accepted_completion',
        'funds_released',               // Payment released to provider
      ],
      default: 'pending_providers',
    },
    
    payment: {
      paystackRef: String,
      escrowAmount: Number,
      escrowStatus: {
        type: String,
        enum: ['held', 'pending', 'released', 'refunded'],
      },
      paidAt: Date,
      releasedAt: Date,
    },
    modeOfDelivery: {
        type: String,
      enum: ['Car', 'Bike']
    },
    // Timestamps for tracking
    acceptedAt: Date,
    selectedAt: Date,
    startedAt: Date,
    completedAt: Date,
    
    // Attachments
    attachments: [String],
    
    // Cancellation
    cancellationReason: String,
    cancelledBy: {
      type: mongoose.Schema.Types.ObjectId,
      refPath: 'cancelledByModel'
    },
    cancelledByModel: {
      type: String,
      enum: ['User', 'Provider']
    },
    
    // Ratings
    rating: {
      score: Number,
      review: String,
      ratedAt: Date
    }
  },
  {
    timestamps: true
  }
);

// Indexes
bookingSchema.index({ userId: 1, status: 1 });
bookingSchema.index({ providerId: 1, status: 1 });
bookingSchema.index({ status: 1 });
bookingSchema.index({ 'location.coordinates': '2dsphere' });
bookingSchema.index({ 'pickupLocation.coordinates': '2dsphere' });
bookingSchema.index({ 'dropoffLocation.coordinates': '2dsphere' });


module.exports = mongoose.model('Booking', bookingSchema)
   
  
