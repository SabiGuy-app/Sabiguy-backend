const mongoose = require ('mongoose');

const serviceProviderSchema = new mongoose.Schema({
    email: { type: String, unique: true, sparse: true },
    phoneNumber: { type: String, unique: true, sparse: true },
    password: { type: String, required: false},
    createdAt: { type: Date, default: Date.now},
    emailVerified: { type: Boolean, default: false },
    otp: { type: String },
    resetOtp: { type: String },
    isGoogleUser: { type: Boolean, default: false },
    googleId: String,
    refreshToken: { type: String },
    refreshTokenExpiresAt: { type: Date },
    resetOtpExpires: { type: Date },
    emailVerificationExpires: { type: Date },
    fullName: { type: String},
    profilePicture: {
  type: String,
  default: null,
},

    role: {
  type: String,
  enum: ["provider"],
  default: "provider",
},
    // lastName: { type: String},
    dateOfBirth:{ type: String},
    gender: { type: String},
    city: { type: String },
    address: { type: String },
    accountType: { type: String },
    ninSlip: { type: String },
    jobTitle: { type: String },
    service: { type: String },
    accountNumber: { type: String },
    bankName: { type: String },
    bankCode: { type: String },
    accountName: { type: String },
    verifyOnly: { type: String },
    BusinessName: { type: String },
    regNumber: { type: String },
    BusinessAddress: { type: String },
    cacFile: { type: String},
    driverLicenseNumber: { type: String},
    vehicleProviderYear: { type: String },
    job:[
         {
         service: { type: String } ,
         title: { type: String } ,
         tagLine: { type: String },
         startingPrice: {type: String},

        }
      ],
    
    service:[
         {
         serviceName: { type: String } ,
         pricingModel: { type: String } ,
         price: { type: String } 
        },
    ],
    workVisuals: [
  {
    pictures: [{ type: String }],
    videos: [{ type: String }]
  }
],
vehicleColor: { type: String },
vehicleRegNo: { type: String },
vehicleName: { type: String },
fcmToken: {
    type: String,
    select: false 
  },
  device: {
    type: {
      type: String,
      enum: ['ios', 'android', 'web', 'unknown']
    },
    id: String,
    updatedAt: Date
  },
  radius: { type: Number },  
  allowAnywhere: { type: Boolean, default: false },

    files: [{ type: mongoose.Schema.Types.ObjectId, ref: 'File' }],

    currentLocation: {
  type: {
    type: String,
    enum: ['Point'],
    default: 'Point'
  },
  coordinates: {
    type: [Number],  // [longitude, latitude]
    index: '2dsphere'
  },
  address: String  // Optional
},
  
  availability: {
    isAvailable: {
      type: Boolean,
      default: false
    },
    lastUpdated: Date
  },

  notificationPreferences: {
    bookings: {
      push: { type: Boolean, default: true },
      email: { type: Boolean, default: true },
      types: {
        type: [String],
        default: [
          "new_booking_request",
          "provider_accepted",
          "booking_selected",
          "booking_cancelled",
          "booking_status_updated",
          "booking_taken",
          "counter_offer",
        ],
      },
    },
    jobCompleted: {
      push: { type: Boolean, default: true },
      email: { type: Boolean, default: true },
      types: {
        type: [String],
        default: ["job_started", "booking_completed", "job_completed_confirmed"],
      },
    },
    chatMessages: {
      push: { type: Boolean, default: true },
      email: { type: Boolean, default: false },
      types: { type: [String], default: ["new_message", "message_received"] },
    },
    walletPayments: {
      push: { type: Boolean, default: true },
      email: { type: Boolean, default: true },
      types: {
        type: [String],
        default: [
          "wallet_funded",
          "wallet_payment",
          "payment_received",
          "payment_sent",
        ],
      },
    },
    promotions: {
      push: { type: Boolean, default: false },
      email: { type: Boolean, default: false },
      types: { type: [String], default: ["test"] },
    },
  },
  
  // Pricing
  
  // Ratings
  rating: {
    average: {
      type: Number,
      default: 0
    },
    count: {
      type: Number,
      default: 0
    }
  },

    paystackRecipientCode: String, 

  
  completedJobs: {
    type: Number,
    default: 0
  }
}, {
  timestamps: true
});

module.exports =  mongoose.model ("Provider", serviceProviderSchema);

