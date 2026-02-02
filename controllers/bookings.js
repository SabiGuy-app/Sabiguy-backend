const { registerVersion } = require('firebase/app');
const Booking = require('../models/Bookings');
const Provider = require('../models/ServiceProvider');
const geolocationService = require('../src/services/geolocation.service');
const notificationService = require('../src/services/notification.service');
const pricingService = require('../src/services/pricing.service');

class BookingController {
   constructor() {
    this.createBooking = this.createBooking.bind(this);
    this.findNearbyProviders = this.findNearbyProviders.bind(this);
    this.isTransportLogistics = this.isTransportLogistics.bind(this);
    this.notifyProvidersForFastestFinger = this.notifyProvidersForFastestFinger.bind(this);
    this.calculateDistance = this.calculateDistance.bind(this);
    this.mockGeocode = this.mockGeocode.bind(this);
  }
  async createBooking(req, res) {
    
    try {
      const userId = req.user.id;
      const {
        serviceType,
        subCategory,
        title,
        description,
        address,
        pickupAddress,    // For transport/logistics
        dropoffAddress,   // For transport/logistics
        scheduleType,
        startDate,
        endDate,
        budget,
        attachments
      } = req.body;

      /* -----------------------------
         1️⃣ Validation
      ------------------------------*/
      const isTransport = this.isTransportLogistics(serviceType);
      
      if (!serviceType || !scheduleType || !budget) {
        return res.status(400).json({
          success: false,
          message: 'serviceType, scheduleType and budget are required'
        });
      }

      // Validate locations based on service type
      if (isTransport && (!pickupAddress || !dropoffAddress)) {
        return res.status(400).json({
          success: false,
          message: 'pickupAddress and dropoffAddress are required for transport/logistics'
        });
      }

      if (!isTransport && !address) {
        return res.status(400).json({
          success: false,
          message: 'address is required'
        });
      }

      /* -----------------------------
         2️⃣ Geocode addresses
      ------------------------------*/
      let bookingData = {
        userId,
        serviceType,
        subCategory,
        title,
        description,
        scheduleType,
        startDate,
        endDate,
        budget,
        attachments: attachments || [],
      };

      // let searchCoordinates;

      // if (isTransport) {
      //   // Geocode both pickup and dropoff
      //   const [pickupGeo, dropoffGeo] = await Promise.all([
      //     geolocationService.geocodeAddress(pickupAddress),
      //     geolocationService.geocodeAddress(dropoffAddress)
      //   ]);

      //   bookingData.pickupLocation = {
      //     address: pickupGeo.formattedAddress,
      //     coordinates: {
      //       type: 'Point',
      //       coordinates: [pickupGeo.longitude, pickupGeo.latitude]
      //     }
      //   };

      //   bookingData.dropoffLocation = {
      //     address: dropoffGeo.formattedAddress,
      //     coordinates: {
      //       type: 'Point',
      //       coordinates: [dropoffGeo.longitude, dropoffGeo.latitude]
      //     }
      //   };

      //   // Calculate distance
      //   // const distance = this.calculateDistance(
      //   //   pickupGeo.latitude,
      //   //   pickupGeo.longitude,
      //   //   dropoffGeo.latitude,
      //   //   dropoffGeo.longitude
      //   // );
      //    const directions = await geolocationService.getDirections(
      //     [pickupGeo.longitude, pickupGeo.latitude],
      //     [dropoffGeo.longitude, dropoffGeo.latitude],
      //     'driving'
      //   );

      //   bookingData.distance = {
      //     value: parseFloat(directions.distance.value),
      //     unit: 'km'
      //   };

      //   // Calculate price based on distance
      //   const calculatedPrice = pricingService.calculateTransportPrice(
      //     parseFloat(directions.distance.value),
      //     serviceType
      //   );

      //   bookingData.calculatedPrice = calculatedPrice;
      //   bookingData.agreedPrice = calculatedPrice; // Can be negotiated later
        
      //   // Use pickup location to find nearby providers
      //   searchCoordinates = {
      //     latitude: pickupGeo.latitude,
      //     longitude: pickupGeo.longitude
      //   };

      // } else {
      //   // Regular service - single location
      //   const geo = await geolocationService.geocodeAddress(address);

      //   bookingData.location = {
      //     address: geo.formattedAddress,
      //     coordinates: {
      //       type: 'Point',
      //       coordinates: [geo.longitude, geo.latitude]
      //     }
      //   };

      //   bookingData.agreedPrice = budget;
        
      //   searchCoordinates = {
      //     latitude: geo.latitude,
      //     longitude: geo.longitude
      //   };
      // }
// In your booking controller

let searchCoordinates;

if (isTransport) {
  const pickupGeo = await this.mockGeocode(pickupAddress);
  const dropoffGeo = await this.mockGeocode(dropoffAddress);
  
  // Set pickup location - CORRECT FORMAT
 bookingData.pickupLocation = {
  address: pickupAddress,
  coordinates: {
    type: 'Point',
    coordinates: [pickupGeo.longitude, pickupGeo.latitude]
  }
};

bookingData.dropoffLocation = {
  address: dropoffAddress,
  coordinates: {
    type: 'Point',
    coordinates: [dropoffGeo.longitude, dropoffGeo.latitude]
  }
};
  
 
  // Calculate distance
  const distance = this.calculateDistance(
    pickupGeo.latitude,
    pickupGeo.longitude,
    dropoffGeo.latitude,
    dropoffGeo.longitude
  );
  
  bookingData.distance = { 
    value: distance, 
    unit: 'km' 
  };
  
  const calculatedPrice = pricingService.calculateTransportPrice(distance, serviceType);
  bookingData.calculatedPrice = calculatedPrice;
  bookingData.agreedPrice = calculatedPrice;
  
  // Use pickup location for provider search
  searchCoordinates = {
    latitude: pickupGeo.latitude,
    longitude: pickupGeo.longitude
  };
  
  // DON'T set location field for transport bookings
  bookingData.location = undefined;
  
} else {
  // Regular service
  const geo = await this.mockGeocode(address);
  
  // Set location - CORRECT FORMAT
  if (!isTransport) {
  bookingData.location = {
  address,
  coordinates: {
    type: 'Point',
    coordinates: [geo.longitude, geo.latitude]
  }
};
  }
  
  bookingData.agreedPrice = budget;
  
  searchCoordinates = {
    latitude: geo.latitude,
    longitude: geo.longitude
  };
  
  // DON'T set pickup/dropoff for regular services
  bookingData.pickupLocation = undefined;
  bookingData.dropoffLocation = undefined;
}


      /* -----------------------------
         3️⃣ Set initial status
      ------------------------------*/
      bookingData.status = isTransport
        ? 'awaiting_provider_acceptance'
        : 'pending_providers';

      /* -----------------------------
         4️⃣ Create booking
      ------------------------------*/
      const booking = await Booking.create(bookingData);

      /* -----------------------------
         5️⃣ Find nearby providers
      ------------------------------*/
     const nearbyProviders = await this.findNearbyProviders(
  searchCoordinates,  // Pass coordinates object
  serviceType,        // Pass serviceType as 2nd parameter
  subCategory,        // Pass subCategory as 3rd parameter
  10                  // radiusInKm (10km)
);

    // const nearbyProviders = await this.findNearbyProviders(
    //     searchCoordinates,
    //     serviceType,
    //     subCategory
    //   );

      if (!nearbyProviders.length) {
        return res.status(201).json({
          success: true,
          message: 'Booking created but no providers available nearby',
          data: { booking, 
            providers: [],
            note: 'No providers found matching this service type'

           }
        });
      }

      /* -----------------------------
         6️⃣ Transport/Logistics Flow
         (Fastest finger)
      ------------------------------*/
      if (isTransport) {
        booking.notifiedProviders = nearbyProviders.map(p => p._id);
        await booking.save();

        // Notify providers asynchronously
        this.notifyProvidersForFastestFinger(booking, nearbyProviders);

        return res.status(201).json({
          success: true,
          message: 'Booking created. Providers notified.',
          data: {
            booking,
            notifiedProvidersCount: nearbyProviders.length,
            calculatedPrice: booking.calculatedPrice,
            distance: booking.distance
          }
        });
      }

      /* -----------------------------
         7️⃣ Regular Services Flow
         (User selects provider)
      ------------------------------*/
      booking.suggestedProviders = nearbyProviders.map(p => p._id);
      await booking.save();

      return res.status(201).json({
        success: true,
        message: 'Booking created successfully',
        data: {
          booking,
          providers: nearbyProviders.map(p => ({
            id: p._id,
            fullName: p.fullName,
            email: p.email,
            rating: p.rating,
            completedJobs: p.completedJobs,
            distance: p.distance,
            profilePicture: p.profilePicture,
            startingPrice: p.startingPrice,
            services: p.job

          }))
        }
      });

    } catch (error) {
      console.error('Create booking error:', error);
      return res.status(500).json({
        success: false,
        message: 'Error creating booking',
        error: error.message
      });
    }
  }

  async acceptJobCompleted(req, res) {
    try {
      const bookingId = req.params.id;
      const userId = req.user.id;  
      const { score, review } = req.body;


       if (score && (score < 1 || score > 5)) {
      return res.status(400).json({
        success: false,
        message: 'Rating score must be between 1 and 5'
      });
    }

      const booking = await Booking.findOne({
          _id: bookingId,
          status: 'completed',
          userId
        });

      if (!booking) {
        return res.status(409).json({
          success: false,
          message: 'Booking not marked completed by provider'
        });
      }

        booking.status = 'user_accepted_completion';

         if (score || review) {
      booking.rating = {
        score,
        review,
        ratedAt: new Date()
      };
    }

    await booking.save();

    await notificationService.notifyUser(booking.providerId._id, {
        type: 'job_completed_confirmed',
        title: '✅ Job Completion Confirmed',
        message: `Your customer confirmed completion of the ${booking.serviceType} service.`,
        bookingId: booking._id,
        userId
      });

      return res.status(200).json({
        success: true,
        message: 'Job completed accepted successfully',
        data: booking
      });

    } catch (error) {
      console.error('Accept job completion error:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to accept job completion',
        error: error.message
      });
    }
  }

  // User selects a provider (for non-transport services)
  async selectProvider(req, res) {
    try {
      const bookingId = req.params.id;
      const userId = req.user.id;
      const { providerId } = req.body;

      if (!providerId) {
        return res.status(400).json({
          success: false,
          message: 'providerId is required'
        });
      }

      const booking = await Booking.findOne({
        _id: bookingId,
        userId,
        status: 'pending_providers'
      });

      if (!booking) {
        return res.status(404).json({
          success: false,
          message: 'Booking not found or not selectable'
        });
      }

      // Ensure provider was suggested
      if (
        booking.suggestedProviders &&
        !booking.suggestedProviders.some(id => id.toString() === providerId)
      ) {
        return res.status(400).json({
          success: false,
          message: 'Provider was not suggested for this booking'
        });
      }

      booking.providerId = providerId;
      booking.status = 'provider_selected';
      booking.selectedAt = new Date();

      await booking.save();

      // Notify provider
      notificationService.notifyProvider(providerId, {
        type: 'booking_selected',
        title: '🎉 You\'ve Been Selected!',
        message: `A customer has selected you for a ${booking.serviceType} booking`,
        bookingId: booking._id,
        serviceType: booking.serviceType,
        location: booking.location?.address,
        budget: booking.budget
      });

      return res.status(200).json({
        success: true,
        message: 'Provider selected successfully',
        data: booking
      });

    } catch (error) {
      console.error('Select provider error:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to select provider',
        error: error.message
      });
    }
  }

  // Cancel booking
  async cancelBooking(req, res) {
    try {
      const bookingId = req.params.id;
      const userId = req.user.id;
      const { reason } = req.body;

      const booking = await Booking.findOneAndUpdate(
        {
          _id: bookingId,
          userId,
          status: { $in: ['pending_providers', 'awaiting_provider_acceptance', 'provider_selected'] }
        },
        {
          status: 'cancelled',
          cancellationReason: reason,
          cancelledBy: userId,
          cancelledByModel: 'User'
        },
        { new: true }
      );

      if (!booking) {
        return res.status(404).json({
          success: false,
          message: 'Booking not found or cannot be cancelled'
        });
      }

      // 🔔 Notify provider if one was assigned
      if (booking.providerId) {
        await notificationService.notifyProvider(booking.providerId, {
          type: 'booking_cancelled',
          title: '❌ Booking Cancelled',
          message: `The customer has cancelled the booking. Reason: ${reason}`,
          bookingId: booking._id
        });
      }

      return res.status(200).json({
        success: true,
        message: 'Booking cancelled successfully',
        data: booking
      });

    } catch (error) {
      console.error('Cancel booking error:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to cancel booking',
        error: error.message
      });
    }
  }

 

  async getBooking(req, res) {
    try {
      const bookingId = req.params.id;
      
      const booking = await Booking.findById(bookingId)
        .populate('userId', 'firstName lastName email phone avatar')
        .populate('providerId', 'userId job rating completedJobs');

      if (!booking) {
        return res.status(404).json({
          success: false,
          message: 'Booking not found'
        });
      }

      return res.status(200).json({
        success: true,
        data: { booking }
      });

    } catch (error) {
      console.error('Get booking error:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to retrieve booking',
        error: error.message
      });
    }
  }


  /* -----------------------------
     Helper Methods
  ------------------------------*/

  // async findNearbyProviders(coordinates, serviceType, subCategory, radiusInKm = 10) {
  //   return Provider.aggregate([
  //     {
  //       $geoNear: {
  //         near: {
  //           type: 'Point',
  //           coordinates: [coordinates.longitude, coordinates.latitude]
  //         },
  //         distanceField: 'distance',
  //         maxDistance: radiusInKm * 1000,
  //         spherical: true,
  //         query: {
  //           serviceTypes: serviceType,
  //           isAvailable: true,
  //           isOnline: true,
  //           rating: { $gte: 3.5 }
  //         }
  //       }
  //     },
  //     { $sort: { rating: -1, completedJobs: -1 } },
  //     { $limit: 20 }
  //   ]);
  // }

  // async findNearbyProviders(coordinates, serviceType, subCategory, radiusInKm = 50) {
  //   try {
  //     // Build query for your provider schema
  //     const query = {
  //       'availability.isAvailable': true,
  //       isOnline: true,
  //       'job': {
  //         $elemMatch: {
  //           service: serviceType
  //         }
  //       }
  //     };

  //     // Add subcategory filter if provided
  //     if (subCategory) {
  //       query['job'].$elemMatch.title = subCategory;
  //     }

  //     // If currentLocation exists and has coordinates, use $geoNear
  //     // Otherwise, just find all matching providers
  //     let providers;

  //     try {
  //       providers = await Provider.aggregate([
  //         {
  //           $geoNear: {
  //             near: {
  //               type: 'Point',
  //               coordinates: [coordinates.longitude, coordinates.latitude]
  //             },
  //             distanceField: 'distance',
  //             maxDistance: radiusInKm * 1000,
  //             spherical: true,
  //             query: query
  //           }
  //         },
  //         {
  //           $lookup: {
  //             from: 'users',
  //             localField: 'userId',
  //             foreignField: '_id',
  //             as: 'userInfo'
  //           }
  //         },
  //         { $unwind: '$userInfo' },
  //         {
  //           $project: {
  //             userId: 1,
  //             job: 1,
  //             rating: 1,
  //             completedJobs: 1,
  //             distance: 1,
  //             name: { 
  //               $concat: ['$userInfo.firstName', ' ', '$userInfo.lastName'] 
  //             },
  //             avatar: '$userInfo.avatar',
  //             phoneNumber: '$userInfo.phoneNumber'
  //           }
  //         },
  //         { $sort: { 'rating.average': -1, completedJobs: -1 } },
  //         { $limit: 20 }
  //       ]);
  //     } catch (geoError) {
  //       // If $geoNear fails (no geospatial index), fall back to regular find
  //       console.log('GeoNear failed, using regular query:', geoError.message);
        
  //       providers = await Provider.find(query)
  //         .populate('userId', 'firstName lastName avatar phoneNumber')
  //         .sort({ 'rating.average': -1, completedJobs: -1 })
  //         .limit(20)
  //         .lean();

  //       // Add mock distance and format
  //       providers = providers.map(p => ({
  //         _id: p._id,
  //         userId: p.userId,
  //         job: p.job,
  //         rating: p.rating,
  //         completedJobs: p.completedJobs,
  //         distance: Math.random() * 10, // Mock distance 0-10km
  //         name: `${p.userId?.firstName || ''} ${p.userId?.lastName || ''}`.trim(),
  //         avatar: p.userId?.avatar,
  //         phoneNumber: p.userId?.phoneNumber
  //       }));
  //     }

  //     return providers;

  //   } catch (error) {
  //     console.error('Find nearby providers error:', error);
  //     return [];
  //   }
  // }

  // async findNearbyProviders(coordinates, serviceType, subCategory, radiusInKm = 50) {
  //   try {
  //     console.log('🔍 Finding providers with:', {
  //       coordinates,
  //       serviceType,
  //       subCategory,
  //       radiusInKm
  //     });

  //     // Build query - FIXED field names
  //     const query = {
  //       'availability.isAvailable': true,
  //       isOnline: true,
  //       'job': {
  //         $elemMatch: {
  //           service: serviceType  // This matches your schema
  //         }
  //       }
  //     };

  //     // Add subcategory filter if provided
  //     if (subCategory) {
  //       query['job'].$elemMatch.title = subCategory;  // This matches your schema
  //     }

  //     console.log('📝 Query built:', JSON.stringify(query, null, 2));

  //     // Check if ANY providers exist
  //     const totalProviders = await Provider.countDocuments({});
  //     console.log('📊 Total providers in DB:', totalProviders);

  //     // Check providers matching just the service
  //     const matchingService = await Provider.countDocuments({
  //       'job.service': serviceType
  //     });
  //     console.log('📊 Providers with service "' + serviceType + '":', matchingService);

  //     // Check available providers
  //     const availableProviders = await Provider.countDocuments({
  //       'availability.isAvailable': true,
  //       isOnline: true
  //     });
  //     console.log('📊 Available & online providers:', availableProviders);

  //     let providers;

  //     try {
  //       providers = await Provider.aggregate([
  //         {
  //           $geoNear: {
  //             near: {
  //               type: 'Point',
  //               coordinates: [coordinates.longitude, coordinates.latitude]
  //             },
  //             distanceField: 'distance',
  //             maxDistance: radiusInKm * 1000,
  //             spherical: true,
  //             query: query
  //           }
  //         },
  //         {
  //           $lookup: {
  //             from: 'users',
  //             localField: 'userId',
  //             foreignField: '_id',
  //             as: 'userInfo'
  //           }
  //         },
  //         { $unwind: '$userInfo' },
  //         {
  //           $project: {
  //             userId: 1,
  //             job: 1,
  //             rating: 1,
  //             completedJobs: 1,
  //             distance: 1,
  //             name: { 
  //               $concat: ['$userInfo.firstName', ' ', '$userInfo.lastName'] 
  //             },
  //             avatar: '$userInfo.avatar',
  //             phoneNumber: '$userInfo.phoneNumber'
  //           }
  //         },
  //         { $sort: { 'rating.average': -1, completedJobs: -1 } },
  //         { $limit: 20 }
  //       ]);

  //       console.log('✅ GeoNear succeeded, found:', providers.length);

  //     } catch (geoError) {
  //       console.log('⚠️ GeoNear failed:', geoError.message);
        
  //       providers = await Provider.find(query)
  //         .populate('userId', 'firstName lastName avatar phoneNumber')
  //         .sort({ 'rating.average': -1, completedJobs: -1 })
  //         .limit(20)
  //         .lean();

  //       console.log('✅ Regular query found:', providers.length);

  //       providers = providers.map(p => ({
  //         _id: p._id,
  //         userId: p._id,
  //         job: p.job,
  //         rating: p.rating,
  //         completedJobs: p.completedJobs,
  //         distance: Math.random() * 10,
  //         name: `${p.userId?.firstName || ''} ${p.userId?.lastName || ''}`.trim(),
  //         avatar: p.userId?.avatar,
  //         phoneNumber: p._id?.phoneNumber
  //       }));
  //     }

  //     console.log('🎯 Final providers returned:', providers.length);
  //     return providers;

  //   } catch (error) {
  //     console.error('❌ Find nearby providers error:', error);
  //     return [];
  //   }
  // }

  async findNearbyProviders(coordinates, serviceType, subCategory, radiusInKm = 50) {
    try {
      console.log('🔍 Finding providers with:', {
        coordinates,
        serviceType,
        subCategory,
        radiusInKm
      });

      const query = {
        'availability.isAvailable': true,
        isOnline: true,
        'job': {
          $elemMatch: {
            service: serviceType
          }
        }
      };

      if (subCategory) {
        query['job'].$elemMatch.title = subCategory;
      }

      console.log('📝 Query built:', JSON.stringify(query, null, 2));

      let providers;

      // Check if providers have geospatial data
      const hasGeoData = await Provider.countDocuments({
        'currentLocation.coordinates.coordinates': { $exists: true, $ne: [] }
      });
      
      console.log('📍 Providers with geo data:', hasGeoData);

      if (hasGeoData > 0) {
        // Try $geoNear only if providers have location data
        try {
          providers = await Provider.aggregate([
            {
              $geoNear: {
                near: {
                  type: 'Point',
                  coordinates: [coordinates.longitude, coordinates.latitude]
                },
                distanceField: 'distance',
                maxDistance: radiusInKm * 1000,
                spherical: true,
                query: query
              }
            },
            {
              $lookup: {
                from: 'users',
                localField: 'userId',
                foreignField: '_id',
                as: 'userInfo'
              }
            },
            { $unwind: '$userInfo' },
            {
              $project: {
                userId: 1,
                job: 1,
                rating: 1,
                completedJobs: 1,
                distance: 1,
                name: { 
                  $concat: ['$userInfo.firstName', ' ', '$userInfo.lastName'] 
                },
                avatar: '$userInfo.avatar',
                phoneNumber: '$userInfo.phoneNumber'
              }
            },
            { $sort: { 'rating.average': -1, completedJobs: -1 } },
            { $limit: 20 }
          ]);

          console.log('✅ GeoNear succeeded, found:', providers.length);

        } catch (geoError) {
          console.log('⚠️ GeoNear failed:', geoError.message);
          providers = null; // Force fallback
        }
      }

      // Fallback to regular query if geoNear didn't work or no geo data
      if (!providers || providers.length === 0) {
        console.log('🔄 Using fallback query...');
        
        providers = await Provider.find(query)
          .populate('userId', 'firstName lastName avatar phoneNumber')
          .sort({ 'rating.average': -1, completedJobs: -1 })
          .limit(20)
          .lean();

        console.log('✅ Regular query found:', providers.length);

        // Transform and add mock distance
        providers = providers.map(p => ({
          _id: p._id,
          userId: p.userId?._id,  // ✅ Fixed: Get the actual userId
          job: p.job,
          rating: p.rating,
          completedJobs: p.completedJobs,
          distance: Math.random() * 10,
          fullName: `${p.fullName || ''}`.trim(),
          profilePicture: p.profilePicture,
          email: p.email,
          phoneNumber: p.userId?.phoneNumber  // ✅ Fixed: from populated userId
        }));
      }

      console.log('🎯 Final providers returned:', providers.length);
      return providers;

    } catch (error) {
      console.error('❌ Find nearby providers error:', error);
      return [];
    }
  }
  isTransportLogistics(serviceType) {
        if (!serviceType) return false;

    const transportKeywords = [
      'transport',
      'logistics',
      'delivery',
      'courier',
      'moving',
      'taxi',
      'ride'
    ];

    return transportKeywords.some(keyword =>
      serviceType.toLowerCase().includes(keyword)
    );
  }

  // Calculate distance using Haversine formula
  calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Radius of Earth in kilometers
    const dLat = this.toRad(lat2 - lat1);
    const dLon = this.toRad(lon2 - lon1);
    
    const a = 
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRad(lat1)) * Math.cos(this.toRad(lat2)) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distance = R * c;
    
    return Math.round(distance * 100) / 100; // Round to 2 decimal places
  }

  toRad(degrees) {
    return degrees * (Math.PI / 180);
  }

  /**
   * MOCK Geocoding (returns Lagos-area coordinates)
   * Replace with real Mapbox when you get API token
   */
  async mockGeocode(address) {
    // Mock Lagos coordinates with slight randomization
    const baseLat = 6.5244;
    const baseLng = 3.3792;
    
    // Add random offset (±0.1 degrees ≈ ±11km)
    const latOffset = (Math.random() - 0.5) * 0.2;
    const lngOffset = (Math.random() - 0.5) * 0.2;
    
    return {
      latitude: baseLat + latOffset,
      longitude: baseLng + lngOffset,
      formattedAddress: address
    };
  }

  async notifyProvidersForFastestFinger(booking, providers) {
    // Fire-and-forget (don't block request)
    providers.forEach(provider => {
      notificationService.notifyProvider(provider._id, {
        type: 'new_booking_request',
        title: '🔔 New Booking Request',
        message: `New ${booking.serviceType} booking nearby - ${booking.distance?.value || 'N/A'} km away`,
        bookingId: booking._id,
        serviceType: booking.serviceType,
        pickupAddress: booking.pickupLocation?.address,
        dropoffAddress: booking.dropoffLocation?.address,
        distance: booking.distance?.value,
        calculatedPrice: booking.calculatedPrice,
        urgency: 'high'
      });
    });
  }
}

module.exports = new BookingController();

