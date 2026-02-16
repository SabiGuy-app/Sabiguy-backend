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

