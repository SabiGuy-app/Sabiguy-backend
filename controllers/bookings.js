const Booking = require("../models/Bookings");
const Provider = require("../models/ServiceProvider");
const Buyer = require("../models/ServiceUser");
const mongoose = require("mongoose");
const geolocationService = require("../src/services/geolocation.service");
const notificationService = require("../src/services/notification.service");
const pricingService = require("../src/services/pricing.service");
const paymentService = require("../src/services/payment.service");
const WalletService = require("../src/services/wallet.service");

const PROVIDER_RADIUS = {
  Bike: 4, // km -- ~10-15 mins Lagos traffic
  Car: 9, // km -- ~15-20 mins Lagos traffic
  default: 7,
};
const MAX_PROVIDERS_RETURNED = 6;
const STALE_LOCATION_MINUTES = 10;
const ELIGIBLE_ACTIVE_STATUSES = [
  "completed",
  "enroute_to_dropoff",
  "funds_released",
  "cancelled"
]; // Bookings that count towards provider activity

class BookingController {
  constructor() {
    this.createBooking = this.createBooking.bind(this);
    this.findNearbyProviders = this.findNearbyProviders.bind(this);
    this.isTransportLogistics = this.isTransportLogistics.bind(this);
    this.notifyProvidersForFastestFinger =
      this.notifyProvidersForFastestFinger.bind(this);
    this.calculateDistance = this.calculateDistance.bind(this);
    this.mockGeocode = this.mockGeocode.bind(this);
    this.geocodeWithFallback = this.geocodeWithFallback.bind(this);
    this.getDirectionsWithFallback = this.getDirectionsWithFallback.bind(this);
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
        pickupAddress,
        dropoffAddress,
        scheduleType,
        scheduleDate,
        scheduledTime,
        startDate,
        endDate,
        budget,
        attachments,
        modeOfDelivery: modeOfDeliveryRaw,
        modeOfDelivey,
      } = req.body;

      const rawModeOfDelivery = modeOfDeliveryRaw ?? modeOfDelivey;
      const normalizeModeOfDelivery = (value) => {
        if (!value) return value;
        const normalized = String(value).trim().toLowerCase();
        if (normalized.includes("car")) return "Car";
        if (normalized.includes("bike")) return "Bike";
        return String(value).trim();
      };
      const formatPricing = (pricing) => ({
        riderPays: pricing.calculatedPrice,
        driverReceives: pricing.driverReceives,
        platformEarns: pricing.platformEarns,
        breakdown: pricing.breakdown,
        meta: pricing.meta,
      });
      const modeOfDelivery = normalizeModeOfDelivery(rawModeOfDelivery);

      /* -----------------------------
       1️⃣ Validation
    ------------------------------*/
      const isTransport = this.isTransportLogistics(serviceType, subCategory);

      if (!serviceType || !scheduleType) {
        return res.status(400).json({
          success: false,
          message: "serviceType and scheduleType are required",
        });
      }

      if (
        isTransport &&
        (!pickupAddress || !dropoffAddress || !modeOfDelivery)
      ) {
        return res.status(400).json({
          success: false,
          message:
            "pickupAddress, dropoffAddress and mode of delivery are required for transport/logistics",
        });
      }

      if (
        isTransport &&
        modeOfDelivery &&
        !["Car", "Bike"].includes(modeOfDelivery)
      ) {
        return res.status(400).json({
          success: false,
          message:
            "modeOfDelivery must be one of: Car or Bike for transport/logistics",
        });
      }

      if (isTransport && pickupAddress === dropoffAddress) {
        return res.status(400).json({
          success: false,
          message: "Pickup and dropoff addresses must be different",
        });
      }

      /* -----------------------------
       2️⃣ Geocode + build bookingData
    ------------------------------*/
      let bookingData = {
        userId,
        serviceType,
        subCategory,
        title,
        description,
        scheduleType,
        scheduleDate,
        scheduledTime,
        startDate,
        endDate,
        budget,
        modeOfDelivery,
        attachments: attachments || [],
      };

      let searchCoordinates;
      let transportEstimates = null;
      let rideDistanceKm = 0;
      let rideDurationMinutes = 0;

      if (isTransport) {
        const [pickupGeo, dropoffGeo] = await Promise.all([
          this.geocodeWithFallback(pickupAddress),
          this.geocodeWithFallback(dropoffAddress),
        ]);

        bookingData.pickupLocation = {
          address: pickupGeo.formattedAddress,
          coordinates: {
            type: "Point",
            coordinates: [pickupGeo.longitude, pickupGeo.latitude],
          },
        };

        bookingData.dropoffLocation = {
          address: dropoffGeo.formattedAddress,
          coordinates: {
            type: "Point",
            coordinates: [dropoffGeo.longitude, dropoffGeo.latitude],
          },
        };

        const directions = await this.getDirectionsWithFallback(
          [pickupGeo.longitude, pickupGeo.latitude],
          [dropoffGeo.longitude, dropoffGeo.latitude],
        );

        // Assign to scoped variables — used throughout the rest of the function
        rideDistanceKm = parseFloat(directions.distance.value);
        rideDurationMinutes =
          Number(directions?.duration?.value) || Math.ceil(rideDistanceKm * 2);

        bookingData.distance = {
          value: rideDistanceKm,
          unit: "km",
        };

        const etaBaseTime = scheduleDate
          ? new Date(scheduleDate)
          : startDate
            ? new Date(startDate)
            : new Date();
        const hasValidEtaBaseTime = !Number.isNaN(etaBaseTime.getTime());

        transportEstimates = {
          estimatedDuration: {
            value: rideDurationMinutes,
            unit: directions?.duration?.unit || "minutes",
            isEstimate: Boolean(directions?.isEstimate),
          },
          estimatedArrivalAt: hasValidEtaBaseTime
            ? new Date(etaBaseTime.getTime() + rideDurationMinutes * 60 * 1000)
            : null,
        };

        bookingData.estimatedDuration = transportEstimates.estimatedDuration;
        bookingData.estimatedArrivalAt = transportEstimates.estimatedArrivalAt;

        console.log("📦 Transport Booking Distance:", bookingData.distance);

        searchCoordinates = {
          latitude: pickupGeo.latitude,
          longitude: pickupGeo.longitude,
        };
      } else {
        const geo = await this.geocodeWithFallback(address);

        bookingData.location = {
          address: geo.formattedAddress,
          coordinates: {
            type: "Point",
            coordinates: [geo.longitude, geo.latitude],
          },
        };

        bookingData.agreedPrice = budget;

        searchCoordinates = {
          latitude: geo.latitude,
          longitude: geo.longitude,
        };
      }

      /* -----------------------------
       3️⃣ Set initial status
    ------------------------------*/
      bookingData.status = isTransport
        ? "awaiting_provider_acceptance"
        : "pending_providers";

      /* -----------------------------
       4️⃣ Create booking
    ------------------------------*/
      const booking = await Booking.create(bookingData);

      /* -----------------------------
       4️⃣b Check user allowSystem flag
    ------------------------------*/
      let userAllowSystem = false;
      if (isTransport) {
        const user = await Buyer.findById(userId).select("allowSystem").lean();
        userAllowSystem = user?.allowSystem || false;
        console.log("🔔 User allowSystem:", userAllowSystem);
      }

      /* -----------------------------
       5️⃣ Find nearby providers
    ------------------------------*/
      const nearbyProviders = await this.findNearbyProviders(
        searchCoordinates,
        serviceType,
        subCategory,
        isTransport ? modeOfDelivery : null,
      );

      if (!nearbyProviders.length) {
        return res.status(201).json({
          success: true,
          message: "Booking created but no providers available nearby",
          data: {
            booking,
            providers: [],
            ...(isTransport && transportEstimates
              ? {
                  distance: booking.distance,
                  estimatedDuration: transportEstimates.estimatedDuration,
                  estimatedArrivalAt: transportEstimates.estimatedArrivalAt,
                }
              : {}),
            note: "No providers found matching this service type",
          },
        });
      }

      /* -----------------------------
       5️⃣b Enrich providers with per-provider pricing + ETA
    ------------------------------*/
      const enrichedProviders = nearbyProviders.map((p) => {
        const isBike = p.services?.some((j) => j.title === "motorbike_rider");

        const totalDistanceKm = rideDistanceKm + p.distanceFromPickup;
        const totalDurationMinutes = rideDurationMinutes + p.providerETA.value;

        const pricing = pricingService.calculateTransportPrice(
          totalDistanceKm,
          subCategory,
          serviceType,
          totalDurationMinutes,
          p.vehicleProductionYear,
          isBike,
        );

        return {
          id: p.id,
          fullName: p.fullName,
          email: p.email,
          profilePicture: p.profilePicture,
          rating: p.rating,
          completedJobs: p.completedJobs,
          startingPrice: p.startingPrice,
          services: p.services,
          distanceFromPickup: p.distanceFromPickup,
          locationFresh: p.locationFresh,
          providerETA: p.providerETA,
          vehicleProductionYear: p.vehicleProductionYear,
          rideDuration: {
            value: rideDurationMinutes,
            unit: "minutes",
          },
          bookingDuration: {
            value: totalDurationMinutes,
            unit: "minutes",
            breakdown: {
              providerToPickup: p.providerETA.value,
              pickupToDropoff: rideDurationMinutes,
            },
          },
          estimatedCompletionAt: new Date(
            Date.now() + totalDurationMinutes * 60 * 1000,
          ),
          pricing: {
            riderPays: pricing.calculatedPrice,
            driverReceives: pricing.driverReceives,
            platformEarns: pricing.platformEarns,
            breakdown: pricing.breakdown,
            meta: pricing.meta,
          },
        };
      });

      // Store provider distances for later use in confirmProvider
      booking.providerDistances = enrichedProviders.map((p) => ({
        providerId: p.id,
        distanceFromPickup: p.distanceFromPickup,
        providerETAMinutes: p.providerETA.value,
        vehicleProductionYear: p.vehicleProductionYear,
      }));

      /* -----------------------------
       6️⃣ Transport flow
    ------------------------------*/
      if (isTransport) {
        if (userAllowSystem) {
          // ⚡ Fastest finger — single fixed price, notify all providers
          const pricing = pricingService.calculateTransportPrice(
            rideDistanceKm,
            subCategory,
            serviceType,
            rideDurationMinutes,
            null, // no specific provider — uses averaged car category
            modeOfDelivery === "Bike",
          );

          booking.calculatedPrice = pricing.calculatedPrice;
          booking.agreedPrice = pricing.calculatedPrice;
          booking.driverReceives = pricing.driverReceives;
          booking.platformEarns = pricing.platformEarns;
          booking.pricingBreakdown = pricing.breakdown;
          booking.notifiedProviders = enrichedProviders.map((p) => p.id);
          booking.status = "awaiting_provider_acceptance";
          await booking.save();

          this.notifyProvidersForFastestFinger(booking, enrichedProviders);

          return res.status(201).json({
            success: true,
            message: "Booking created. Looking for a provider near you.",
            data: {
              booking,
              notifiedProvidersCount: enrichedProviders.length,
              calculatedPrice: booking.calculatedPrice,
              pricing: formatPricing(pricing),
              distance: booking.distance,
              estimatedDuration: transportEstimates.estimatedDuration,
              estimatedArrivalAt: transportEstimates.estimatedArrivalAt,
              flowType: "fastest_finger",
            },
          });
        } else {
          // 👤 User selection — return enriched providers with individual pricing
          booking.suggestedProviders = enrichedProviders.map((p) => p.id);
          booking.status = "awaiting_provider_acceptance";
          await booking.save();

          return res.status(201).json({
            success: true,
            message: "Booking created successfully",
            data: {
              booking,
              providers: enrichedProviders,
              distance: booking.distance,
              estimatedDuration: transportEstimates.estimatedDuration,
              estimatedArrivalAt: transportEstimates.estimatedArrivalAt,
              flowType: "user_selection",
            },
          });
        }
      }

      /* -----------------------------
       7️⃣ Regular services flow
    ------------------------------*/
      booking.suggestedProviders = enrichedProviders.map((p) => p.id);
      await booking.save();

      return res.status(201).json({
        success: true,
        message: "Booking created successfully",
        data: {
          booking,
          providers: enrichedProviders,
        },
      });
    } catch (error) {
      console.error("Create booking error:", error);
      return res.status(500).json({
        success: false,
        message: "Error creating booking",
        error: error.message,
      });
    }
  }

  /* -----------------------------
     Geocoding with Fallback
  ------------------------------*/
  async geocodeWithFallback(address) {
    try {
      console.log("🗺️ Attempting real geocoding for:", address);
      const result = await geolocationService.geocodeAddress(address);
      console.log("✅ Real geocoding successful");
      return result;
    } catch (error) {
      console.warn("⚠️ Real geocoding failed, using mock:", error.message);
      return await this.mockGeocode(address);
    }
  }

  async getDirectionsWithFallback(origin, destination) {
    try {
      console.log("🗺️ Attempting real directions API");
      const result = await geolocationService.getDirections(
        origin,
        destination,
        "driving",
      );
      console.log("✅ Real directions successful");
      return result;
    } catch (error) {
      console.warn(
        "⚠️ Directions API failed, using Haversine estimate:",
        error.message,
      );

      // Fallback: Calculate straight-line distance
      const distance = this.calculateDistance(
        origin[1],
        origin[0], // latitude, longitude
        destination[1],
        destination[0],
      );

      // Ensure minimum distance of 0.5km to avoid 0 pricing
      const finalDistance = distance < 0.5 ? 0.5 : distance;

      console.log(
        "📍 Calculated distance:",
        distance,
        "km -> Using:",
        finalDistance,
        "km",
      );

      return {
        distance: {
          value: finalDistance.toFixed(2),
          unit: "km",
        },
        duration: {
          value: Math.ceil(finalDistance * 2), // Estimate: 2 min per km
          unit: "minutes",
        },
        isEstimate: true,
      };
    }
  }

  /* -----------------------------
     Find Nearby Providers
  ------------------------------*/

  // async findNearbyProviders(
  //   coordinates,
  //   serviceType,
  //   subCategory,
  //   radiusInKm = 50,
  //   modeOfDelivery = null,
  // ) {
  //   try {
  //     console.log("🔍 Finding providers with:", {
  //       coordinates,
  //       serviceType,
  //       subCategory,
  //       radiusInKm,
  //       modeOfDelivery,
  //     });

  //     // Map modeOfDelivery to job title
  //     const modeOfDeliveryMap = {
  //       car: "car_driver",
  //       bike: "motorbike_rider",
  //       bicycle: "Bicycle courier",
  //       walking: "Running errands",
  //       truck: "Truck driver",
  //     };

  //     const query = {
  //       "availability.isAvailable": true,
  //     };

  //     // If modeOfDelivery is provided (transport), filter ONLY by job title
  //     if (modeOfDelivery) {
  //       const jobTitleToFilter =
  //         modeOfDeliveryMap[modeOfDelivery.toLowerCase()];
  //       if (jobTitleToFilter) {
  //         query.job = {
  //           $elemMatch: {
  //             title: jobTitleToFilter,
  //           },
  //         };
  //         console.log(
  //           `📦 Transport mode "${modeOfDelivery}" mapped to job title: "${jobTitleToFilter}"`,
  //         );
  //       }
  //     } else {
  //       // For regular services, filter by service type and optionally by subCategory
  //       query.job = {
  //         $elemMatch: {
  //           service: serviceType,
  //         },
  //       };

  //       if (subCategory) {
  //         query["job"].$elemMatch.title = subCategory;
  //       }
  //     }

  //     let providers;

  //     // Check if providers have geospatial data
  //     const hasGeoData = await Provider.countDocuments({
  //       "currentLocation.coordinates": { $exists: true, $ne: [] },
  //     });

  //     console.log("📍 Providers with geo data:", hasGeoData);

  //     if (hasGeoData > 0) {
  //       // Try $geoNear if providers have location data
  //       try {
  //         providers = await Provider.aggregate([
  //           {
  //             $geoNear: {
  //               near: {
  //                 type: "Point",
  //                 coordinates: [coordinates.longitude, coordinates.latitude],
  //               },
  //               distanceField: "distance",
  //               maxDistance: radiusInKm * 1000, // Convert km to meters
  //               spherical: true,
  //               query: query,
  //             },
  //           },
  //           {
  //             $project: {
  //               fullName: 1,
  //               email: 1,
  //               profilePicture: 1,
  //               job: 1,
  //               rating: 1,
  //               completedJobs: 1,
  //               distance: 1,
  //             },
  //           },
  //           { $sort: { "rating.average": -1, completedJobs: -1 } },
  //           { $limit: 20 },
  //         ]);

  //         console.log("✅ GeoNear succeeded, found:", providers.length);
  //       } catch (geoError) {
  //         console.log("⚠️ GeoNear failed:", geoError.message);
  //         providers = null; // Force fallback
  //       }
  //     }

  //     console.log("🎯 Final providers returned:", providers.length);
  //     return providers;
  //   } catch (error) {
  //     console.error("❌ Find nearby providers error:", error);
  //     return [];
  //   }
  // }

  async findNearbyProviders(
    coordinates,
    serviceType,
    subCategory,
    modeOfDelivery = null,
  ) {
    try {
      const modeOfDeliveryMap = {
        car: "car_driver",
        bike: "motorbike_rider",
        bicycle: "bicycle_courier",
        walking: "running_errands",
        truck: "truck_driver",
      };

      const radiusKm = modeOfDelivery
        ? (PROVIDER_RADIUS[modeOfDelivery] ?? PROVIDER_RADIUS.default)
        : PROVIDER_RADIUS.default;

      // Stale location cutoff
      const staleThreshold = new Date(
        Date.now() - STALE_LOCATION_MINUTES * 60 * 1000,
      );

      const jobQuery = modeOfDelivery
        ? {
            $elemMatch: {
              title: modeOfDeliveryMap[modeOfDelivery.toLowerCase()],
            },
          }
        : subCategory
          ? { $elemMatch: { service: serviceType, title: subCategory } }
          : { $elemMatch: { service: serviceType } };

      const baseQuery = {
        "availability.isAvailable": true,
        "currentLocation.coordinates": { $exists: true, $ne: [] },
        lastLocationUpdate: { $gte: staleThreshold }, // Fresh location only
        job: jobQuery,
      };

      // ── Geo query ──────────────────────────────────────────────────────────────
      let rawProviders = await Provider.aggregate([
        {
          $geoNear: {
            near: {
              type: "Point",
              coordinates: [coordinates.longitude, coordinates.latitude],
            },
            distanceField: "distanceFromPickup", // meters
            maxDistance: radiusKm * 1000,
            spherical: true,
            query: baseQuery,
          },
        },
        {
          $project: {
            fullName: 1,
            email: 1,
            profilePicture: 1,
            job: 1,
            // rating: 1,
            completedJobs: 1,
            startingPrice: 1,
            currentLocation: 1,
            lastLocationUpdate: 1,
            distanceFromPickup: 1,
            vehicleProductionYear: 1,
          },
        },
        { $limit: 30 }, // fetch more, filter down after booking check
      ]);

      if (!rawProviders.length) return [];

      // ── Filter out providers with disqualifying active bookings ────────────────
      const providerIds = rawProviders.map((p) => p._id);

      // Find any provider who has an active booking NOT in the eligible set
      const disqualified = await Booking.distinct("providerId", {
        providerId: { $in: providerIds },
        status: { $nin: ELIGIBLE_ACTIVE_STATUSES },
      });

      const disqualifiedSet = new Set(disqualified.map(String));

      rawProviders = rawProviders.filter(
        (p) => !disqualifiedSet.has(String(p._id)),
      );

      // ── Build per-provider ETA + distances ─────────────────────────────────────
      const providers = rawProviders
        .map((p) => {
          const distanceFromPickupKm = parseFloat(
            (p.distanceFromPickup / 1000).toFixed(2),
          );

          // ETA: estimate provider travel time to pickup
          // Bike avg ~15 km/h in Lagos traffic, Car avg ~20 km/h
          const avgSpeedKmh =
            modeOfDelivery?.toLowerCase() === "bike" ? 15 : 20;
          const providerETAMinutes = Math.ceil(
            (distanceFromPickupKm / avgSpeedKmh) * 60,
          );

          const isStale =
            !p.lastLocationUpdate ||
            new Date(p.lastLocationUpdate) < staleThreshold;

          return {
            id: p._id,
            fullName: p.fullName,
            email: p.email,
            profilePicture: p.profilePicture,
            rating: p.rating,
            completedJobs: p.completedJobs,
            startingPrice: p.startingPrice,
            services: p.job,
            distanceFromPickup: distanceFromPickupKm, // km
            providerETA: {
              value: providerETAMinutes,
              unit: "minutes",
            },
            locationFresh: !isStale,
            _raw: p, // used internally, stripped before response
          };
        })
        // Sort: fresh location first, then by proximity, then rating as tiebreak
        .sort((a, b) => {
          if (a.locationFresh !== b.locationFresh)
            return a.locationFresh ? -1 : 1;
          if (a.distanceFromPickup !== b.distanceFromPickup)
            return a.distanceFromPickup - b.distanceFromPickup;
          // return (b.rating?.average ?? 0) - (a.rating?.average ?? 0);
        })
        .slice(0, MAX_PROVIDERS_RETURNED);

      console.log(
        `✅ ${providers.length} eligible providers within ${radiusKm}km (${modeOfDelivery ?? serviceType})`,
      );
      return providers;
    } catch (error) {
      console.error("❌ findNearbyProviders error:", error);
      return [];
    }
  }
  /* -----------------------------
     Helper Methods
  ------------------------------*/
  isTransportLogistics(serviceType, subCategory = null) {
    const transportKeywords = [
      "transport",
      "logistics",
      "delivery",
      "courier",
      "moving",
      "taxi",
      "ride",
    ];

    const normalizedServiceType = serviceType
      ? String(serviceType).toLowerCase()
      : "";
    const normalizedSubCategory = subCategory
      ? String(subCategory).toLowerCase()
      : "";

    if (!normalizedServiceType && !normalizedSubCategory) return false;

    return transportKeywords.some(
      (keyword) =>
        normalizedServiceType.includes(keyword) ||
        normalizedSubCategory.includes(keyword),
    );
  }

  calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Earth radius in km
    const dLat = this.toRad(lat2 - lat1);
    const dLon = this.toRad(lon2 - lon1);

    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRad(lat1)) *
        Math.cos(this.toRad(lat2)) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distance = R * c;

    return Math.round(distance * 100) / 100;
  }

  toRad(degrees) {
    return degrees * (Math.PI / 180);
  }

  async mockGeocode(address) {
    // Mock Lagos coordinates with address-based variation
    const baseLat = 6.5244;
    const baseLng = 3.3792;

    // Simple hash function for address-based seeding
    let hash = 0;
    for (let i = 0; i < address.length; i++) {
      const char = address.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32-bit integer
    }

    // Use hash to generate consistent but varied offsets
    const seed = Math.abs(hash % 1000) / 1000;
    const latOffset = (seed - 0.5) * 0.3; // ±17km variation based on address
    const lngOffset = (((seed * 7) % 1) - 0.5) * 0.3; // Different seed for longitude

    return {
      latitude: baseLat + latOffset,
      longitude: baseLng + lngOffset,
      formattedAddress: address,
    };
  }

  async notifyProvidersForFastestFinger(booking, providers) {
    // Notify all providers in parallel, don't block response
    Promise.all(
      providers.map((provider) =>
        notificationService
          .notifyProvider(provider.id, {
            type: "new_booking_request",
            title: "🔔 New Booking Request",
            message: `New ${booking.serviceType} booking nearby - ${booking.distance?.value || "N/A"} km away`,
            bookingId: booking._id,
            scheduleDate: booking.scheduleDate,
            serviceType: booking.serviceType,
            pickupAddress: booking.pickupLocation?.address,
            dropoffAddress: booking.dropoffLocation?.address,
            distance: booking.distance?.value,
            calculatedPrice: booking.calculatedPrice,
            urgency: "high",
          })
          .catch((err) => {
            console.error(
              `❌ Failed to notify provider ${provider.id}:`,
              err.message,
            );
          }),
      ),
    ).catch((err) => {
      console.error("❌ Error notifying providers:", err.message);
    });
  }
  async acceptJobCompleted(req, res) {
    try {
      const bookingId = req.params.id;
      const userId = req.user.id;
      const { score, review, tipAmount } = req.body;

      if (score && (score < 1 || score > 5)) {
        return res.status(400).json({
          success: false,
          message: "Rating score must be between 1 and 5",
        });
      }

      if (tipAmount !== undefined) {
        const normalizedTip = Number(tipAmount);
        if (!Number.isFinite(normalizedTip) || normalizedTip <= 0) {
          return res.status(400).json({
            success: false,
            message: "tipAmount must be a positive number",
          });
        }
      }

      const booking = await Booking.findOne({
        _id: bookingId,
        status: "completed",
        userId,
      });

      if (!booking) {
        return res.status(409).json({
          success: false,
          message: "Booking not marked completed by provider",
        });
      }

      if (tipAmount !== undefined && booking.tipAmount) {
        return res.status(409).json({
          success: false,
          message: "Tip already added for this booking",
        });
      }

      booking.status = "user_accepted_completion";

      if (score || review) {
        booking.rating = {
          score,
          review,
          ratedAt: new Date(),
        };
      }

      await booking.save();

      // 💰 Release escrow to provider
      let escrowReleased = false;
      try {
        await paymentService.releaseEscrow(bookingId, userId);
        escrowReleased = true;
        console.log(`✅ Escrow released for booking ${bookingId}`);
      } catch (escrowErr) {
        console.error(
          `❌ Failed to release escrow for booking ${bookingId}:`,
          escrowErr.message,
        );
        // Don't fail the entire request if escrow release fails
      }

      let tipResult = null;
      if (tipAmount !== undefined) {
        tipResult = await WalletService.tipProviderFromWallet(
          userId,
          booking.providerId._id,
          tipAmount,
          booking._id,
          notificationService,
        );
        booking.tipAmount = Number(tipAmount);
      }

      await booking.save();

      await notificationService.notifyUser(booking.providerId._id, {
        type: "job_completed_confirmed",
        title: "✅ Job Completion Confirmed",
        message: `Your customer confirmed completion of the ${booking.serviceType} service.`,
        bookingId: booking._id,
        userId,
      });

      return res.status(200).json({
        success: true,
        message: "Job completed accepted successfully",
        data: {
          booking,
          escrowReleased,
          tip: tipResult ? tipResult.transaction : null,
        },
      });
    } catch (error) {
      console.error("Accept job completion error:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to accept job completion",
        error: error.message,
      });
    }
  }

  async selectProvider(req, res) {
    try {
      const bookingId = req.params.id;
      const userId = req.user.id;
      const { providerId } = req.body;

      if (!providerId) {
        return res.status(400).json({
          success: false,
          message: "providerId is required",
        });
      }

      const booking = await Booking.findOne({
        _id: bookingId,
        userId,
        status: { $in: ["pending_providers", "awaiting_provider_acceptance"] },
      });

      if (!booking) {
        return res.status(404).json({
          success: false,
          message: "Booking not found or not selectable",
        });
      }

      // Ensure provider was suggested
      if (
        booking.suggestedProviders &&
        !booking.suggestedProviders.some((id) => id.toString() === providerId)
      ) {
        return res.status(400).json({
          success: false,
          message: "Provider was not suggested for this booking",
        });
      }

      const provider = await Provider.findById(providerId).select(
        "vehicleProductionYear job",
      );

      const isBike = provider.job?.some((j) => j.title === "motorbike_rider");

      const providerMeta = booking.providerDistances.find(
        (p) => String(p.providerId) === String(providerId),
      );

      const totalDistanceKm =
        booking.distance.value + providerMeta.distanceFromPickup;
      const totalDurationMinutes =
        booking.estimatedDuration.value + providerMeta.providerETAMinutes;

      const finalPricing = pricingService.calculateTransportPrice(
        totalDistanceKm,
        booking.subCategory,
        booking.serviceType,
        totalDurationMinutes,
        provider.vehicleProductionYear,
        isBike,
      );

      booking.providerId = providerId;
      booking.calculatedPrice = finalPricing.calculatedPrice;
      booking.agreedPrice = finalPricing.calculatedPrice;
      booking.driverReceives = finalPricing.driverReceives;
      booking.platformEarns = finalPricing.platformEarns;
      booking.pricingBreakdown = finalPricing.breakdown;
      booking.status = "awaiting_provider_acceptance";
      await booking.save();

      // booking.providerId = providerId;
      // booking.status = "provider_selected";
      // booking.selectedAt = new Date();

      // await booking.save();

      // Notify provider
      notificationService.notifyProvider(providerId, {
        type: "booking_selected",
        title: "🎉 You've Been Selected!",
        message: `A customer has selected you for a ${booking.serviceType} booking`,
        bookingId: booking._id,
        serviceType: booking.serviceType,
        location: booking.location?.address,
        budget: booking.budget,
      });

      return res.status(200).json({
        success: true,
        message: "Provider selected successfully",
        data: booking,
      });
    } catch (error) {
      console.error("Select provider error:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to select provider",
        error: error.message,
      });
    }
  }

  // Cancel booking
  async cancelBooking(req, res) {
    try {
      const bookingId = req.params.id;
      const userId = req.user.id;
      const { reason } = req.body;

      const booking = await Booking.findOne({
        _id: bookingId,
        userId,
        status: {
          $in: [
            "pending_providers",
            "awaiting_provider_acceptance",
            "provider_selected",
            "paid_escrow",
          ],
        },
      });

      if (!booking) {
        return res.status(404).json({
          success: false,
          message: "Booking not found or cannot be cancelled",
        });
      }

      if (booking.status === "paid_escrow") {
        await paymentService.refundPayment(bookingId, reason);
      }

      booking.status = "cancelled";
      booking.cancellationReason = reason;
      booking.cancelledBy = userId;
      booking.cancelledByModel = "User";
      await booking.save();

      // 🔔 Notify provider if one was assigned
      if (booking.providerId) {
        await notificationService.notifyProvider(booking.providerId, {
          type: "booking_cancelled",
          title: "❌ Booking Cancelled",
          message: `The customer has cancelled the booking. Reason: ${reason}`,
          bookingId: booking._id,
        });
      }

      return res.status(200).json({
        success: true,
        message: "Booking cancelled successfully",
        data: booking,
      });
    } catch (error) {
      console.error("Cancel booking error:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to cancel booking",
        error: error.message,
      });
    }
  }

  /* Helper: Parse human-readable dates */
  parseDate(dateString) {
    if (!dateString) return null;

    const lower = String(dateString).toLowerCase().trim();
    const now = new Date();

    switch (lower) {
      case "today":
        return new Date(now.getFullYear(), now.getMonth(), now.getDate());
      case "yesterday":
        const yesterday = new Date(now);
        yesterday.setDate(yesterday.getDate() - 1);
        return new Date(
          yesterday.getFullYear(),
          yesterday.getMonth(),
          yesterday.getDate(),
        );
      case "last-week":
      case "lastweek":
      case "last_week":
        const lastWeek = new Date(now);
        lastWeek.setDate(lastWeek.getDate() - 7);
        return new Date(
          lastWeek.getFullYear(),
          lastWeek.getMonth(),
          lastWeek.getDate(),
        );
      case "last-month":
      case "lastmonth":
      case "last_month":
        const lastMonth = new Date(now);
        lastMonth.setMonth(lastMonth.getMonth() - 1);
        return new Date(
          lastMonth.getFullYear(),
          lastMonth.getMonth(),
          lastMonth.getDate(),
        );
      case "last-3-months":
      case "last3months":
        const last3Months = new Date(now);
        last3Months.setMonth(last3Months.getMonth() - 3);
        return new Date(
          last3Months.getFullYear(),
          last3Months.getMonth(),
          last3Months.getDate(),
        );
      default:
        // Try parsing as ISO date or standard date string
        const parsed = new Date(dateString);
        return !isNaN(parsed.getTime()) ? parsed : null;
    }
  }

  async getAllBookings(req, res) {
    try {
      const {
        status,
        providerId,
        userId,
        serviceType,
        subCategory,
        search,
        modeOfDelivery,
        startDate,
        endDate,
        timeWindow, // e.g., "30m", "1h", "2h", "24h"
        page = 1,
        limit = 10,
        sortBy = "createdAt",
        sortOrder = "desc",
      } = req.query;

      // Build query object
      const query = {};

      // Filter by status
      if (status) {
        query.status = status;
      }

      if (serviceType) query.serviceType = serviceType;
      if (subCategory) query.subCategory = subCategory;
      if (modeOfDelivery) query.modeOfDelivery = modeOfDelivery;

      // Filter by provider
      if (providerId) {
        if (!mongoose.Types.ObjectId.isValid(providerId)) {
          return res.status(400).json({
            success: false,
            message: "Invalid provider ID format",
          });
        }
        query.providerId = providerId;
      }

      // Filter by user
      if (userId) {
        if (!mongoose.Types.ObjectId.isValid(userId)) {
          return res.status(400).json({
            success: false,
            message: "Invalid user ID format",
          });
        }
        query.userId = userId;
      }

      // Search by reference or booking ID
      if (search) {
        query.$or = [
          { reference: { $regex: search, $options: "i" } },
          { bookingId: { $regex: search, $options: "i" } },
        ];
      }

      // Filter by time window (relative from now)
      // Examples: "30m", "1h", "2h", "24h"
      if (timeWindow) {
        const timeWindowMatch = timeWindow.match(/^(\d+)\s*(m|h|d)$/i);
        if (timeWindowMatch) {
          const amount = parseInt(timeWindowMatch[1]);
          const unit = timeWindowMatch[2].toLowerCase();
          let minutesBack = 0;

          switch (unit) {
            case "m":
              minutesBack = amount;
              break;
            case "h":
              minutesBack = amount * 60;
              break;
            case "d":
              minutesBack = amount * 24 * 60;
              break;
            default:
              minutesBack = amount;
          }

          const timeAgo = new Date(Date.now() - minutesBack * 60 * 1000);
          query.createdAt = { $gte: timeAgo };
        }
      }
      // Filter by explicit date range (takes precedence over timeWindow)
      else if (startDate || endDate) {
        query.createdAt = {};
        if (startDate) {
          const parsedStart = this.parseDate(startDate);
          if (parsedStart) {
            query.createdAt.$gte = parsedStart;
          }
        }
        if (endDate) {
          const parsedEnd = this.parseDate(endDate);
          if (parsedEnd) {
            // If endDate is "today", include the entire day
            const isToday = String(endDate).toLowerCase().trim() === "today";
            if (isToday) {
              const nextDay = new Date(parsedEnd);
              nextDay.setDate(nextDay.getDate() + 1);
              query.createdAt.$lt = nextDay;
            } else {
              query.createdAt.$lte = new Date(
                parsedEnd.getTime() +
                  23 * 60 * 60 * 1000 +
                  59 * 60 * 1000 +
                  59 * 1000,
              );
            }
          }
        }
      }

      // Sort configuration
      const sortConfig = {};
      sortConfig[sortBy] = sortOrder === "asc" ? 1 : -1;

      // Execute query with pagination
      const bookings = await Booking.find(query)
        .populate("userId", "fullName email phoneNumber profilePicture")
        .populate(
          "providerId",
          "fullName profilePicture phoneNumber email workVisuals.pictures",
        )
        .sort(sortConfig)
        .limit(limit * 1)
        .skip((page - 1) * limit)
        .lean();

      // Get total count for pagination
      const count = await Booking.countDocuments(query);

      // Calculate stats (optional)
      const stats = await Booking.aggregate([
        { $match: query },
        {
          $group: {
            _id: "$status",
            count: { $sum: 1 },
          },
        },
      ]);

      return res.status(200).json({
        success: true,
        data: bookings,
        pagination: {
          total: count,
          totalPages: Math.ceil(count / limit),
          currentPage: parseInt(page),
          perPage: parseInt(limit),
        },
        stats: stats.reduce((acc, item) => {
          acc[item._id] = item.count;
          return acc;
        }, {}),
      });
    } catch (error) {
      console.error("Get all bookings error:", error);
      return res.status(500).json({
        success: false,
        message: "Error fetching bookings",
        error: error.message,
      });
    }
  }

  async getBookingById(req, res) {
    try {
      const bookingId = req.params.id;

      const booking = await Booking.findById(bookingId)
        .populate("userId", "fullName email phone avatar")
        .populate(
          "providerId",
          "userId fullName job rating completedJobs workVisuals.pictures profilePicture currentLocation lastLocationUpdate",
        );

      if (!booking) {
        return res.status(404).json({
          success: false,
          message: "Booking not found",
        });
      }

      return res.status(200).json({
        success: true,
        data: { booking },
      });
    } catch (error) {
      console.error("Get booking error:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to retrieve booking",
        error: error.message,
      });
    }
  }

  async getUserBookings(req, res) {
    try {
      const userId = req.user.id;
      const { status, page = 1, limit = 10 } = req.query;

      const query = { userId };
      if (status) {
        query.status = status;
      }

      const bookings = await Booking.find(query)
        .populate("userId", "fullName email phoneNumber profilePicture")
        .populate(
          "providerId",
          "fullName profilePicture phoneNumber email workVisuals.pictures currentLocation lastLocationUpdate",
        )
        .sort({ createdAt: -1 })
        .limit(limit * 1)
        .skip((page - 1) * limit);

      const count = await Booking.countDocuments(query);

      return res.status(200).json({
        success: true,
        data: bookings,
        totalPages: Math.ceil(count / limit),
        currentPage: parseInt(page),
        total: count,
      });
    } catch (error) {
      console.error("Get bookings error:", error);
      return res.status(500).json({
        success: false,
        message: "Error fetching bookings",
        error: error.message,
      });
    }
  }

  async allowSystem(req, res) {
    try {
      const userId = req.user.id;
      const { allowSystem } = req.body;

      if (typeof allowSystem !== "boolean") {
        return res.status(400).json({
          success: false,
          message: "allowSystem must be a boolean",
        });
      }

      const user = await Buyer.findById(userId);
      if (!user) {
        return res.status(404).json({
          success: false,
          message: "User not found",
        });
      }

      user.allowSystem = allowSystem;
      await user.save();

      return res.status(200).json({
        success: true,
        message: `Allow system set to ${user.allowSystem}`,
        data: {
          allowSystem: user.allowSystem,
        },
      });
    } catch (error) {
      console.error("Allow system error:", error);
      return res.status(500).json({
        success: false,
        message: "Error switching allow system",
        error: error.message,
      });
    }
  }
}

module.exports = new BookingController();
