const Provider = require ('../models/ServiceProvider');
const Booking = require('../models/Bookings');
const notificationService = require('../src/services/notification.service')
const paymentService = require ('../src/services/payment.service');

class ProviderController {
  
async ProfileInfo(req, res) {
  try {
    const { gender, city, address, accountType, ninSlip,radius, allowAnywhere
 } = req.body;

    const provider = await Provider.findById(req.user.id);
    if (!provider) {
      return res.status(404).json({ message: "Provider not found" });
    }

    provider.gender = gender
    provider.city = city 
    provider.address = address 
    provider.accountType = accountType 
    provider.ninSlip = ninSlip
    provider.radius = radius
    provider.allowAnywhere = allowAnywhere


    await provider.save();

    res.status(200).json({
      success: true,
      message: "Profile info updated successfully",
      data: provider,
    });
  } catch (err) {
    console.error("Profile update error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};


async BusinessInfo(req, res) {
  try {
    const { BusinessName, regNumber, BusinessAddress, cacFile } = req.body;

    const provider = await Provider.findById(req.user.id);
    if (!provider) {
      return res.status(404).json({ message: "Provider not found" });
    }

    provider.BusinessName = BusinessName
    provider.regNumber = regNumber 
    provider.BusinessAddress = BusinessAddress 
    provider.cacFile = cacFile

    await provider.save();

    res.status(200).json({
      success: true,
      message: "Business info updated successfully",
      data: provider,
    });
  } catch (err) {
    console.error("Business update error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};



async JobAndService(req, res) {
  try {
    const { job, service } = req.body;
    const providerId = req.user.id; 

    if (!job && !service) {
      return res.status(400).json({ message: "Please provide job or service data" });
    }

    const provider = await Provider.findById(providerId);
    if (!provider) {
      return res.status(404).json({ message: "Provider not found" });
    }

    if (job) {
      if (!Array.isArray(job)) {
        return res.status(400).json({ message: "Job must be an array" });
      }

      provider.job = job.map((item) => ({
        service: item.service,
        title: item.title,
        tagLine: item.tagLine,
        startingPrice: item.startingPrice
      }));
    }

    if (service) {
      if (!Array.isArray(service)) {
        return res.status(400).json({ message: "Service must be an array" });
      }

      provider.service = service.map((item) => ({
        serviceName: item.serviceName,
        pricingModel: item.pricingModel,
        price: item.price,
      }));
    }

    await provider.save();

    res.status(200).json({
      success: true,
      message: "Provider job/service info updated successfully",
      data: provider,
    });
  } catch (err) {
    console.error("Update error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};

async workVisuals(req, res) {
  try {
    const { workVisuals } = req.body;
    const providerId = req.user.id; 

    // if (!job && !service) {
    //   return res.status(400).json({ message: "Please provide job or service data" });
    // }

    const provider = await Provider.findById(providerId);
    if (!provider) {
      return res.status(404).json({ message: "Provider not found" });
    }

      if (!Array.isArray(workVisuals)) {
        return res.status(400).json({ message: "Work visuals must be an array" });
      }

       provider.workVisuals = workVisuals.map((item) => ({
      pictures: Array.isArray(item.pictures) ? item.pictures : [],
      videos: Array.isArray(item.videos) ? item.videos : [],
    }));
    
    await provider.save();

    res.status(200).json({
      success: true,
      message: "Work visuals updated successfully",
      data: provider.workVisuals,
    });
  } catch (err) {
    console.error("Update error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};

async BankInfo(req, res) {
  try {
    const { accountName, accountNumber, bankName, bankCode } = req.body;

    const provider = await Provider.findById(req.user.id);
    if (!provider) {
      return res.status(404).json({ message: "Provider not found" });
    }

    provider.accountName = accountName
    provider.accountNumber = accountNumber 
    provider.bankName = bankName 
    provider.bankCode = bankCode

    await provider.save();

    res.status(200).json({
      success: true,
      message: "Account info updated successfully",
      data: provider,
    });
  } catch (err) {
    console.error("Account update error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};
async WorkVisuals(req, res) {
  try {
    const { workVisuals } = req.body;

    const provider = await Provider.findById(req.user.id);
    if (!provider) {
      return res.status(404).json({ message: "Provider not found" });
    }

    provider.workVisuals = workVisuals
    

    await provider.save();

    res.status(200).json({
      success: true,
      message: "Account info updated successfully",
      data: provider,
    });
  } catch (err) {
    console.error("Account update error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};

async setProfilePicture(req, res) {
  try {
    const { imageUrl } = req.body;
    const providerId = req.user.id; // from your auth middleware

    if (!imageUrl) {
      return res.status(400).json({ message: "Image URL is required" });
    }

    const provider = await Provider.findById(providerId);
    if (!provider) {
      return res.status(404).json({ message: "Provider not found" });
    }

    // Update the provider's profile picture
    provider.profilePicture = imageUrl;
    await provider.save();

    res.status(200).json({
      success: true,
      message: "Profile picture updated successfully",
      profilePicture: provider.profilePicture,
    });
  } catch (err) {
    console.error("Profile picture error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};

  async getDashboardStats(req, res) {
  try {
    const providerId = req.user.id;

    // Get wallet balance (more accurate!)
    const walletService = require('../src/services/wallet.service');
    const walletBalance = await walletService.getBalance(providerId, 'Provider');

    // Get booking statistics
    const [
      totalBookings,
      activeBookings,
      completedBookings
    ] = await Promise.all([
      Booking.countDocuments({ providerId }),
      Booking.countDocuments({ 
        providerId, 
        status: { $in: ['in_progress', 'paid_escrow'] }
      }),
      Booking.countDocuments({ 
        providerId, 
        status: { $in: ['completed', 'funds_released'] }
      })
    ]);

    return res.status(200).json({
      success: true,
      data: {
        totalBookings,
        activeBookings,
        completedBookings,
        
        availableEarnings: walletBalance.available,  
        pendingEarnings: walletBalance.pending,      // In escrow
        totalEarnings: walletBalance.totalEarnings,  // All time
        totalWithdrawals: walletBalance.totalWithdrawals
      }
    });
  } catch (error) {
    console.error('Get dashboard stats error:', error);
    return res.status(500).json({
      success: false,
      message: 'Error fetching dashboard statistics',
      error: error.message
    });
  }
}

  // async updateLocation(req, res) {
  //   try {
  //     const providerId = req.user.id;
  //     const { latitude, longitude, address } = req.body;

  //     if (!latitude || !longitude) {
  //       return res.status(400).json({
  //         success: false,
  //         message: 'Latitude and longitude are required'
  //       });
  //     }

  //     const provider = await Provider.findByIdAndUpdate(
  //       providerId,
  //       {
  //         currentLocation: {
  //           address,
  //           type: 'Point',
  //           coordinates: [longitude, latitude]
  //         }
  //       },
  //       { new: true }
  //     );

  //     return res.status(200).json({
  //       success: true,
  //       message: 'Location updated successfully',
  //       data: provider.currentLocation
  //     });
  //   } catch (error) {
  //     console.error('Update location error:', error);
  //     return res.status(500).json({
  //       success: false,
  //       message: 'Error updating location',
  //       error: error.message
  //     });
  //   }
  // }

  async updateLocation(req, res) {
  try {
    const providerId = req.user.id;
    const { latitude, longitude, address } = req.body;

    if (!latitude || !longitude) {
      return res.status(400).json({
        success: false,
        message: 'Latitude and longitude are required'
      });
    }

    // Validate coordinates
    if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
      return res.status(400).json({
        success: false,
        message: 'Invalid coordinates'
      });
    }

    const provider = await Provider.findByIdAndUpdate(
      providerId,
      {
        $set: {
          'currentLocation.type': 'Point',
          'currentLocation.coordinates': [longitude, latitude], // [lng, lat]
          'currentLocation.address': address,
          lastLocationUpdate: new Date()
        }
      },
      { new: true }
    );

    if (!provider) {
      return res.status(404).json({
        success: false,
        message: 'Provider not found'
      });
    }

    console.log(`📍 Location updated for ${provider.fullName}:`, {
      coordinates: [longitude, latitude],
      address
    });

    return res.status(200).json({
      success: true,
      message: 'Location updated successfully',
      data: {
        currentLocation: provider.currentLocation,
        lastLocationUpdate: provider.lastLocationUpdate
      }
    });
  } catch (error) {
    console.error('Update location error:', error);
    return res.status(500).json({
      success: false,
      message: 'Error updating location',
      error: error.message
    });
  }
}
  /**
   * Toggle availability
   * PUT /api/provider/availability/toggle
   */
  async toggleAvailability(req, res) {
    try {
      const providerId = req.user.id;
      const { isAvailable } = req.body;

      const provider = await Provider.findByIdAndUpdate(
        providerId,
        {
          'availability.isAvailable': isAvailable,
          'availability.lastUpdated': new Date()
        },
        { new: true }
      );

      return res.status(200).json({
        success: true,
        message: `Availability set to ${isAvailable ? 'available' : 'unavailable'}`,
        data: {
          isAvailable: provider.availability.isAvailable
        }
      });
    } catch (error) {
      console.error('Toggle availability error:', error);
      return res.status(500).json({
        success: false,
        message: 'Error toggling availability',
        error: error.message
      });
    }
  }

  async getBookings(req, res) {
    try {
      const providerId = req.user.id;
      const { status, page = 1, limit = 10 } = req.query;

      const query = { providerId };
      if (status) {
        query.status = status;
      }

      const bookings = await Booking.find(query)
        .populate('userId', 'firstName lastName avatar phoneNumber email')
        .sort({ createdAt: -1 })
        .limit(limit * 1)
        .skip((page - 1) * limit);

      const count = await Booking.countDocuments(query);

      return res.status(200).json({
        success: true,
        data: bookings,
        totalPages: Math.ceil(count / limit),
        currentPage: parseInt(page),
        total: count
      });
    } catch (error) {
      console.error('Get bookings error:', error);
      return res.status(500).json({
        success: false,
        message: 'Error fetching bookings',
        error: error.message
      });
    }
  }

  // async getBookingDetails(req, res) {
  //   try {
  //     const providerId = req.user.providerId;
  //     const { bookingId } = req.params;

  //     const booking = await Booking.findOne({
  //       _id: bookingId,
  //       providerId
  //     }).populate('userId', 'firstName lastName avatar phoneNumber email');

  //     if (!booking) {
  //       return res.status(404).json({
  //         success: false,
  //         message: 'Booking not found'
  //       });
  //     }

  //     return res.status(200).json({
  //       success: true,
  //       data: booking
  //     });
  //   } catch (error) {
  //     console.error('Get booking details error:', error);
  //     return res.status(500).json({
  //       success: false,
  //       message: 'Error fetching booking details',
  //       error: error.message
  //     });
  //   }
  // }

   async acceptBooking(req, res) {
  try {
    const bookingId = req.params.id;
    const provider = req.user;
    const providerId = provider.id;

    // 1️⃣ Fetch booking first (read-only)
    const booking = await Booking.findById(bookingId);

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found'
      });
    }

    // 2️⃣ Status check
    if (!['awaiting_provider_acceptance', 'pending_providers'].includes(booking.status)) {
      return res.status(409).json({
        success: false,
        message: 'Booking is no longer available'
      });
    }

    // 3️⃣ Service match check (🔥 BEFORE update)
    // const isServiceMatch = provider.job?.some(j =>
    //   j.service === booking.serviceType &&
    //   j.title === booking.subCategory
    // );

    // if (!isServiceMatch) {
    //   return res.status(409).json({
    //     success: false,
    //     message: 'You cannot accept a service you do not offer'
    //   });
    // }

    // 4️⃣ Atomic update (fastest finger wins)
    const updatedBooking = await Booking.findOneAndUpdate(
      {
        _id: bookingId,
        providerId: { $exists: false }
      },
      {
        providerId,
        status: 'provider_selected',
        acceptedAt: new Date()
      },
      { new: true }
    ).populate('userId', 'firstName lastName fcmToken');

    if (!updatedBooking) {
      return res.status(409).json({
        success: false,
        message: 'Booking already taken by another provider'
      });
    }

    // 5️⃣ Notifications
    await notificationService.notifyUser(updatedBooking.userId, {
      type: 'provider_accepted',
      title: 'Provider Accepted Your Booking',
      message: `A provider has accepted your ${updatedBooking.serviceType} booking`,
      bookingId: updatedBooking._id,
      providerId
    });

    notificationService.notifyBookingTaken(bookingId, providerId);

    return res.status(200).json({
      success: true,
      message: 'Booking accepted successfully',
      data: updatedBooking
    });

  } catch (error) {
    console.error('Accept booking error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to accept booking',
      error: error.message
    });
  }
}


async cancelBooking(req, res) {
    try {
      const providerId = req.user.id;
      const { bookingId } = req.params;
      const { reason } = req.body;

      const booking = await Booking.findOne({
        _id: bookingId,
        providerId,
        status: 'pending'
      });

      if (!booking) {
        return res.status(404).json({
          success: false,
          message: 'Booking not found or already processed'
        });
      }

      booking.cancellationReason = reason;
      booking.status = 'cancelled',
      booking.cancelledBy = providerId,
      booking.cancelledByModel = 'Provider'
      await booking.save();

      // TODO: Send notification to user
      await notificationService.notifyUser(booking.providerId, {
                type: 'booking_cancelled',
                title: '❌ Booking Cancelled',
                message: `The provider has cancelled the booking. Reason: ${reason}`,
                bookingId: booking._id
      })
  

      return res.status(200).json({
        success: true,
        message: 'Booking cancelled successfully'
      });
    } catch (error) {
      console.error('Decline booking error:', error);
      return res.status(500).json({
        success: false,
        message: 'Error declining booking',
        error: error.message
      });
    }
  }

  async sendCounterOffer(req, res) {
    try {
      const providerId = req.user.id;
      const { bookingId } = req.params;
      const { offerAmount } = req.body;

      if (!offerAmount || offerAmount <= 0) {
        return res.status(400).json({
          success: false,
          message: 'Valid offer amount is required'
        });
      }

      const booking = await Booking.findOne({
        _id: bookingId,
        providerId,
        status: 'pending_providers'
      });

      if (!booking) {
        return res.status(404).json({
          success: false,
          message: 'Booking not found'
        });
      }

      booking.providerOffer = offerAmount;
      booking.providerResponse = 'counter_offer';
      await booking.save();

      // TODO: Send notification to user about counter offer
      await notificationService.notifyUser(booking.userId._id, {
              type: 'counter_offer',
              title: ' Provider Sends A Counter Offer',
              message: `A provider has sent a counter of ${booking.providerOffer}`,
              bookingId: booking._id,
              providerId
            });

      return res.status(200).json({
        success: true,
        message: 'Counter offer sent successfully',
        data: {
          originalBudget: booking.budget,
          counterOffer: offerAmount
        }
      });
    } catch (error) {
      console.error('Counter offer error:', error);
      return res.status(500).json({
        success: false,
        message: 'Error sending counter offer',
        error: error.message
      });
    }
  }

  async startJob(req, res) {
    try {
      const providerId = req.user.id;
      const { bookingId } = req.params;

      const booking = await Booking.findOne({
        _id: bookingId,
        providerId,
      });

      if (!booking) {
        return res.status(404).json({
          success: false,
          message: 'Booking not found'
        });
      }

      if (booking.status !== 'paid_escrow') {
        return res.status(400).json({
          success: false,
          message: 'Payment must be completed before starting job'
        });
      }

      booking.status = 'in_progress';
      await booking.save();

      // TODO: Send notification to user
      await notificationService.notifyUser(booking.userId._id, {
        type: 'job_started',
        title: ' Provider Starts Job',
        message: `Provider has started your ${booking.serviceType} job`,
        bookingId: booking._id,
        providerId
      });

      return res.status(200).json({
        success: true,
        message: 'Job started successfully',
        data: booking
      });
    } catch (error) {
      console.error('Start job error:', error);
      return res.status(500).json({
        success: false,
        message: 'Error starting job',
        error: error.message
      });
    }
  }

  async markJobComplete(req, res) {
    try {
      const providerId = req.user.id;
      const { bookingId } = req.params;

      const booking = await Booking.findOne({
        _id: bookingId,
        providerId,
        status: 'in_progress'
      });

      if (!booking) {
        return res.status(404).json({
          success: false,
          message: 'Booking not found or not in progress'
        });
      }

      booking.status = 'completed';
      await booking.save();

      // Update provider's completed jobs count
      await Provider.findByIdAndUpdate(providerId, {
        $inc: { completedJobs: 1 }
      });

      await notificationService.notifyUser(booking.userId, {
        type: 'booking_completed',
        title: '✅ Service Completed',
        message: 'Your service has been completed. Please rate your experience.',
        bookingId: booking._id
      });
      return res.status(200).json({
        success: true,
        message: 'Job marked as complete. Awaiting user confirmation.',
        data: booking
      });
    } catch (error) {
      console.error('Mark complete error:', error);
      return res.status(500).json({
        success: false,
        message: 'Error marking job as complete',
        error: error.message
      });
    }
  }

  async getEarnings(req, res) {
    try {
      const providerId = req.user.providerId;
      const { startDate, endDate } = req.query;

      const query = {
        providerId,
        status: 'completed'
      };

      if (startDate && endDate) {
        query.createdAt = {
          $gte: new Date(startDate),
          $lte: new Date(endDate)
        };
      }

      const earnings = await Booking.aggregate([
        { $match: query },
        {
          $group: {
            _id: null,
            totalEarnings: { $sum: '$agreedPrice' },
            platformFees: { $sum: '$serviceFee' },
            netEarnings: {
              $sum: {
                $subtract: ['$agreedPrice', { $multiply: ['$agreedPrice', 0.1] }]
              }
            },
            count: { $sum: 1 }
          }
        }
      ]);

      const result = earnings[0] || {
        totalEarnings: 0,
        platformFees: 0,
        netEarnings: 0,
        count: 0
      };

      return res.status(200).json({
        success: true,
        data: result
      });
    } catch (error) {
      console.error('Get earnings error:', error);
      return res.status(500).json({
        success: false,
        message: 'Error fetching earnings',
        error: error.message
      });
    }
  }


async addBankAccount(req, res) {
  try {
    const providerId = req.user.providerId;
    const { accountNumber, bankCode, verifyOnly } = req.body;
    
    if (!accountNumber || !bankCode) {
      return res.status(400).json({
        success: false,
        message: 'Account number and bank code are required'
      });
    }

    // Verify account with Paystack
    const accountDetails = await paymentService.verifyBankAccount({
      accountNumber,
      bankCode
    });
    
    console.log('Account verification response:', accountDetails);
    
    // If only verifying, return the details without saving
    if (verifyOnly) {
      return res.status(200).json({
        success: true,
        message: 'Account verified',
        data: {
          accountName: accountDetails.accountName,
          accountNumber: accountDetails.accountNumber
        },
        verificationDetails: accountDetails // Include full verification response
      });
    }

    // Get bank name from the banks list
    const banks = await paymentService.getBanks();
    const selectedBank = banks.find(bank => bank.code === bankCode);
    const bankName = selectedBank ? selectedBank.name : '';

    // Save the bank details
    const provider = await Provider.findByIdAndUpdate(
      providerId,
      {
        accountNumber,
        accountName: accountDetails.accountName,
        bankCode,
        bankName // Save bank name to DB
      },
      { new: true }
    );

    if (!provider) {
      return res.status(404).json({
        success: false,
        message: 'Provider not found'
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Bank account added successfully',
      data: {
        accountNumber: provider.accountNumber,
        accountName: provider.accountName,
        bankCode: provider.bankCode,
        bankName: provider.bankName
      },
      verificationDetails: accountDetails // Include full verification response
    });
    
  } catch (error) {
    console.error('Add bank account error:', error);
    console.error('Error details:', error.response?.data || error.message);
    return res.status(500).json({
      success: false,
      message: error.message || 'Error adding bank account',
      error: error.message
    });
  }
}

  async verifyBankAccount(req, res) {
    try {
      const { accountNumber, bankCode } = req.body;

      if (!accountNumber || !bankCode) {
        return res.status(400).json({
          success: false,
          message: 'Account number and bank code are required'
        });
      }

      const accountDetails = await paymentService.verifyBankAccount({
        accountNumber,
        bankCode
      });

      return res.status(200).json({
        success: true,
        data: accountDetails
      });
    } catch (error) {
      console.error('Verify account error:', error);
      return res.status(500).json({
        success: false,
        message: 'Error verifying bank account',
        error: error.message
      });
    }
  }


  async getReviews(req, res) {
    try {
      const providerId = req.user.providerId;
      const { page = 1, limit = 10 } = req.query;

      const reviews = await Booking.find({
        providerId,
        'rating.score': { $exists: true }
      })
        .populate('userId', 'firstName lastName avatar')
        .select('rating serviceType createdAt')
        .sort({ 'rating.ratedAt': -1 })
        .limit(limit * 1)
        .skip((page - 1) * limit);

      const count = await Booking.countDocuments({
        providerId,
        'rating.score': { $exists: true }
      });

      return res.status(200).json({
        success: true,
        data: reviews,
        totalPages: Math.ceil(count / limit),
        currentPage: parseInt(page),
        total: count
      });
    } catch (error) {
      console.error('Get reviews error:', error);
      return res.status(500).json({
        success: false,
        message: 'Error fetching reviews',
        error: error.message
      });
    }
  }

}
module.exports = new ProviderController();

