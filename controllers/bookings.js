const Booking = require("../models/Bookings");
const Provider = require("../models/ServiceProvider");
const Buyer = require("../models/ServiceUser");
const Chat = require("../models/Chat");
const Notification = require("../models/Notification");
const mongoose = require("mongoose");
const geolocationService = require("../src/services/geolocation.service");
const notificationService = require("../src/services/notification.service");
const pricingService = require("../src/services/pricing.service");
const paymentService = require("../src/services/payment.service");
const discountService = require("../src/services/discount.service");
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
  "cancelled",
  "payment_pending",
  "disputed",
]; // Bookings that count towards provider activity
const DELETABLE_BOOKING_STATUSES = [
  "pending_providers",
  "awaiting_provider_acceptance",
  "provider_selected",
  "payment_pending",
  "cancelled",
];

class BookingController {
  constructor() {
    this.createBooking = this.createBooking.bind(this);
    this.findNearbyProviders = this.findNearbyProviders.bind(this);
    this.isTransportLogistics = this.isTransportLogistics.bind(this);
    this.getAllBookings = this.getAllBookings.bind(this);
    this.getUserBookings = this.getUserBookings.bind(this);
    this.getBookingsByUserId = this.getBookingsByUserId.bind(this);
    this.getBookingsByProviderId = this.getBookingsByProviderId.bind(this);
    this.getBookingById = this.getBookingById.bind(this);
    this.notifyProvidersForFastestFinger =
      this.notifyProvidersForFastestFinger.bind(this);
    this.formatBookingPricing = this.formatBookingPricing.bind(this);
    this.formatBookingPricingSummary =
      this.formatBookingPricingSummary.bind(this);
    this.prepareBookingResponse = this.prepareBookingResponse.bind(this);
    this.selectProvider = this.selectProvider.bind(this);
    this.calculateDistance = this.calculateDistance.bind(this);
    this.mockGeocode = this.mockGeocode.bind(this);
    this.geocodeWithFallback = this.geocodeWithFallback.bind(this);
    this.getDirectionsWithFallback = this.getDirectionsWithFallback.bind(this);
    this.parseDate = this.parseDate.bind(this);
  }

  formatBookingPricing(booking) {
    if (!booking) return null;

    const breakdown = booking.pricingBreakdown ?? null;
    const subtotal =
      breakdown?.subtotal ??
      booking.agreedPrice ??
      booking.totalAmount ??
      booking.budget ??
      null;
    const userPlatformFee =
      breakdown?.platformFee ?? booking.serviceFee ?? null;
    const providerPlatformFee =
      breakdown?.driverCommission ?? booking.providerCommission ?? null;
    const totalPlatformFee =
      breakdown?.platformEarns ?? booking.platformEarns ?? null;
    const providerNet =
      breakdown?.driverReceives ??
      booking.driverReceives ??
      booking.providerReceives ??
      null;
    const riderPays =
      breakdown?.riderPaysFinal ??
      booking.calculatedPrice ??
      booking.totalAmount ??
      booking.agreedPrice ??
      booking.budget ??
      null;

    const directPricing = {
      riderPays,
      subtotal,
      grossEarnings: subtotal,
      userPlatformFee,
      providerPlatformFee,
      totalPlatformFee,
      providerReceives: providerNet,
      driverReceives: providerNet,
      discountAmount:
        breakdown?.discountAmount ?? booking.payment?.discount?.amount ?? null,
      discountApplied:
        breakdown?.discountApplied ??
        booking.payment?.discount?.applied ??
        false,
      discountPercent:
        breakdown?.discountPercent ??
        booking.payment?.discount?.percent ??
        null,
      paymentBreakdown: {
        subtotal,
        grossEarnings: subtotal,
        riderPays,
        userPlatformFee,
        providerPlatformFee,
        totalPlatformFee,
        providerReceives: providerNet,
        discountAmount:
          breakdown?.discountAmount ??
          booking.payment?.discount?.amount ??
          null,
        discountApplied:
          breakdown?.discountApplied ??
          booking.payment?.discount?.applied ??
          false,
        discountPercent:
          breakdown?.discountPercent ??
          booking.payment?.discount?.percent ??
          null,
      },
      breakdown,
      meta: booking.pricingMeta ?? null,
    };

    const hasDirectPricing =
      directPricing.riderPays !== null ||
      directPricing.driverReceives !== null ||
      directPricing.platformEarns !== null ||
      directPricing.breakdown !== null ||
      directPricing.meta !== null;

    if (hasDirectPricing) {
      return directPricing;
    }

    const providerPricingOptions = Array.isArray(booking.providerPricingOptions)
      ? booking.providerPricingOptions
      : [];

    if (providerPricingOptions.length) {
      const firstEstimate = providerPricingOptions[0] || null;

      return {
        riderPays: firstEstimate?.riderPays ?? null,
        providerReceives: firstEstimate?.providerReceives ?? null,
        paymentBreakdown: {
          subtotal: firstEstimate?.subtotal ?? null,
          grossEarnings: firstEstimate?.grossEarnings ?? null,
          riderPays: firstEstimate?.riderPays ?? null,
          userPlatformFee: firstEstimate?.userPlatformFee ?? null,
          providerPlatformFee: firstEstimate?.providerPlatformFee ?? null,
          totalPlatformFee: firstEstimate?.totalPlatformFee ?? null,
          providerReceives: firstEstimate?.providerReceives ?? null,
        },
        breakdown: firstEstimate?.breakdown ?? null,
        meta: firstEstimate?.meta ?? null,
        suggestedProviderPricing: providerPricingOptions,
      };
    }

    const providerDistances = Array.isArray(booking.providerDistances)
      ? booking.providerDistances
      : [];
    const isTransportBooking =
      this.isTransportLogistics(booking.serviceType, booking.subCategory) &&
      booking.distance?.value !== undefined &&
      booking.estimatedDuration?.value !== undefined;

    if (providerDistances.length && isTransportBooking) {
      const isBike =
        String(booking.modeOfDelivery || "").toLowerCase() === "bike";
      const suggestedProviderPricing = providerDistances.map((provider) => {
        const totalDistanceKm =
          Number(booking.distance?.value || 0) +
          Number(provider.distanceFromPickup || 0);
        const totalDurationMinutes =
          Number(booking.estimatedDuration?.value || 0) +
          Number(provider.providerETAMinutes || 0);

        const pricing = pricingService.calculateTransportPrice(
          totalDistanceKm,
          booking.subCategory,
          booking.serviceType,
          totalDurationMinutes,
          provider.vehicleProductionYear,
          isBike,
        );

        return {
          providerId: provider.providerId,
          riderPays: pricing.calculatedPrice,
          providerReceives:
            pricing.breakdown?.driverReceives ?? pricing.driverReceives ?? null,
          paymentBreakdown: {
            subtotal: pricing.breakdown?.subtotal ?? null,
            grossEarnings: pricing.breakdown?.subtotal ?? null,
            riderPays: pricing.calculatedPrice,
            userPlatformFee: pricing.breakdown?.platformFee ?? null,
            providerPlatformFee: pricing.breakdown?.driverCommission ?? null,
            totalPlatformFee: pricing.breakdown?.platformEarns ?? null,
            providerReceives:
              pricing.breakdown?.driverReceives ??
              pricing.driverReceives ??
              null,
          },
          breakdown: pricing.breakdown,
          meta: pricing.meta,
        };
      });

      const firstEstimate = suggestedProviderPricing[0] || null;

      return {
        riderPays: firstEstimate?.riderPays ?? null,
        providerReceives: firstEstimate?.providerReceives ?? null,
        paymentBreakdown: firstEstimate?.paymentBreakdown ?? null,
        breakdown: firstEstimate?.breakdown ?? null,
        meta: firstEstimate?.meta ?? null,
        suggestedProviderPricing,
      };
    }

    return directPricing;
  }

  formatBookingPricingSummary(booking) {
    if (!booking) return null;

    const pricingBreakdown = booking.pricingBreakdown ?? {};
    const baseBreakdown = pricingBreakdown.breakdown ?? pricingBreakdown;
    const pricingMeta = booking.pricingMeta ?? pricingBreakdown.meta ?? {};
    const ratesUsed =
      pricingMeta.ratesUsed ?? pricingBreakdown?.meta?.ratesUsed ?? {};
    const promo =
      pricingBreakdown.launchPromo ?? booking.payment?.discount ?? null;
    const promoApplied = Boolean(
      pricingBreakdown.discountApplied ?? promo?.applied ?? false,
    );
    const discountAmount = Number(
      pricingBreakdown.discountAmount ?? promo?.amount ?? 0,
    );
    const originalTotalAmount = Number(
      pricingBreakdown.originalTotalAmount ??
        pricingBreakdown.riderPaysFinal ??
        booking.calculatedPrice ??
        booking.totalAmount ??
        0,
    );
    const finalTotalAmount = Number(
      pricingBreakdown.discountApplied
        ? (pricingBreakdown.discountedTotalAmount ??
            booking.totalAmount ??
            booking.calculatedPrice ??
            originalTotalAmount)
        : (booking.totalAmount ??
            booking.calculatedPrice ??
            pricingBreakdown.riderPaysFinal ??
            originalTotalAmount),
    );

    return {
      promoApplied,
      fare: {
        baseFare: baseBreakdown.baseFare ?? null,
        distanceCost: baseBreakdown.distanceCost ?? null,
        timeCost: baseBreakdown.timeCost ?? null,
        marketAdjustment: baseBreakdown.marketAdjustment ?? null,
        subtotal: baseBreakdown.subtotal ?? null,
      },
      fees: {
        userPlatformFee:
          baseBreakdown.platformFee ??
          pricingBreakdown.originalServiceFee ??
          null,
        driverCommission:
          baseBreakdown.driverCommission ??
          pricingBreakdown.originalProviderCommission ??
          null,
        providerPlatformFee:
          baseBreakdown.driverCommission ??
          pricingBreakdown.originalProviderCommission ??
          null,
        totalPlatformFee:
          baseBreakdown.platformEarns ??
          pricingBreakdown.originalPlatformEarns ??
          null,
        platformEarns:
          baseBreakdown.platformEarns ??
          pricingBreakdown.originalPlatformEarns ??
          null,
        providerReceives:
          pricingBreakdown.providerReceives ?? booking.providerReceives ?? null,
        driverReceives:
          pricingBreakdown.driverReceives ?? booking.driverReceives ?? null,
      },
      promoFees: promoApplied
        ? {
            userDiscount: discountAmount,
            providerBonusAmount: Math.round(
              Number(baseBreakdown.subtotal ?? 0) * 0.05,
            ),
            totalPlatformFee: Math.max(
              (baseBreakdown.platformFee ??
                pricingBreakdown.originalServiceFee ??
                0) +
                (baseBreakdown.driverCommission ??
                  pricingBreakdown.originalProviderCommission ??
                  0) -
                discountAmount,
              0,
            ),
            platformEarns: Math.max(
              (baseBreakdown.platformEarns ??
                pricingBreakdown.originalPlatformEarns ??
                0) - discountAmount,
              0,
            ),
          }
        : null,
      tax: {
        amount:
          baseBreakdown.tax ??
          pricingBreakdown.tax ??
          pricingBreakdown.taxAmount ??
          null,
        rate: ratesUsed.taxRate ?? null,
      },
      totals: {
        beforeDiscount: originalTotalAmount,
        discountAmount,
        afterDiscount: finalTotalAmount,
        riderPays: finalTotalAmount,
        riderPaysBeforeTax: pricingBreakdown.riderPaysBeforeTax ?? null,
        riderPaysFinal: pricingBreakdown.riderPaysFinal ?? finalTotalAmount,
      },
      promo: promoApplied
        ? {
            applied: true,
            code: promo?.code ?? pricingBreakdown.discountCode ?? null,
            percent: promo?.percent ?? pricingBreakdown.discountPercent ?? null,
            reason: promo?.reason ?? pricingBreakdown.discountReason ?? null,
            amount: discountAmount,
            maxDiscount: promo?.maxDiscount ?? 500,
          }
        : null,
      meta: {
        vehicleCategory: pricingMeta.vehicleCategory ?? null,
        distanceKm: pricingMeta.distanceKm ?? null,
        durationMinutes: pricingMeta.durationMinutes ?? null,
        ratesUsed,
      },
    };
  }

  prepareBookingResponse(booking) {
    if (!booking) return null;

    const bookingObject =
      typeof booking.toObject === "function"
        ? booking.toObject({ versionKey: false })
        : { ...booking };

    if (bookingObject.location) {
      delete bookingObject.location.formattedAddress;
    }
    if (bookingObject.pickupLocation) {
      delete bookingObject.pickupLocation.formattedAddress;
    }
    if (bookingObject.dropoffLocation) {
      delete bookingObject.dropoffLocation.formattedAddress;
    }

    bookingObject.pricing = this.formatBookingPricingSummary(bookingObject);
    delete bookingObject.pricingBreakdown;
    delete bookingObject.pricingMeta;
    delete bookingObject.providerPricingOptions;
    delete bookingObject.providerDistances;

    return bookingObject;
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
        pickupLatitude,
        pickupLongitude,
        dropoffAddress,
        dropoffLatitude,
        dropoffLongitude,
        scheduleType,
        scheduleDate,
        scheduledTime,
        startDate,
        endDate,
        budget,
        attachments,
        modeOfDelivery: modeOfDeliveryRaw,
        modeOfDelivey,
        applyRideDiscount = false,
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
      const buyer = await Buyer.findById(userId).select("isNewUser").lean();

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
        applyRideDiscount,
        attachments: attachments || [],
      };

      let searchCoordinates;
      let transportEstimates = null;
      let rideDistanceKm = 0;
      let rideDurationMinutes = 0;

//       if (isTransport) {
//         const [pickupGeo, dropoffGeo] = await Promise.all([
//           this.geocodeWithFallback(pickupAddress),
//           this.geocodeWithFallback(dropoffAddress),
//         ]);

//         console.log("📍 Pickup resolved to:", pickupGeo.latitude, pickupGeo.longitude, "-", pickupGeo.formattedAddress);
// console.log("📍 Dropoff resolved to:", dropoffGeo.latitude, dropoffGeo.longitude, "-", dropoffGeo.formattedAddress);

//         bookingData.pickupLocation = {
//           address: pickupAddress,
//           formattedAddress: pickupGeo.formattedAddress,
//           coordinates: {
//             type: "Point",
//             coordinates: [pickupGeo.longitude, pickupGeo.latitude],
//           },
//         };

//         bookingData.dropoffLocation = {
//           address: dropoffAddress,
//           formattedAddress: dropoffGeo.formattedAddress,
//           coordinates: {
//             type: "Point",
//             coordinates: [dropoffGeo.longitude, dropoffGeo.latitude],
//           },
//         };

//         const directions = await this.getDirectionsWithFallback(
//           [pickupGeo.longitude, pickupGeo.latitude],
//           [dropoffGeo.longitude, dropoffGeo.latitude],
//         );

//         // Assign to scoped variables — used throughout the rest of the function
//         rideDistanceKm = parseFloat(directions.distance.value);
//         rideDurationMinutes =
//           Number(directions?.duration?.value) || Math.ceil(rideDistanceKm * 2);

//         bookingData.distance = {
//           value: rideDistanceKm,
//           unit: "km",
//         };

//         const etaBaseTime = scheduleDate
//           ? new Date(scheduleDate)
//           : startDate
//             ? new Date(startDate)
//             : new Date();
//         const hasValidEtaBaseTime = !Number.isNaN(etaBaseTime.getTime());

//         transportEstimates = {
//           estimatedDuration: {
//             value: rideDurationMinutes,
//             unit: directions?.duration?.unit || "minutes",
//             isEstimate: Boolean(directions?.isEstimate),
//           },
//           estimatedArrivalAt: hasValidEtaBaseTime
//             ? new Date(etaBaseTime.getTime() + rideDurationMinutes * 60 * 1000)
//             : null,
//         };

//         bookingData.estimatedDuration = transportEstimates.estimatedDuration;
//         bookingData.estimatedArrivalAt = transportEstimates.estimatedArrivalAt;

//         console.log("📦 Transport Booking Distance:", bookingData.distance);

//         searchCoordinates = {
//           latitude: pickupGeo.latitude,
//           longitude: pickupGeo.longitude,
//         };
//       } else {
//         const geo = await this.geocodeWithFallback(address);

//         bookingData.location = {
//           address,
//           formattedAddress: geo.formattedAddress,
//           coordinates: {
//             type: "Point",
//             coordinates: [geo.longitude, geo.latitude],
//           },
//         };

//         bookingData.agreedPrice = budget;
//         bookingData.totalAmount = budget;

//         searchCoordinates = {
//           latitude: geo.latitude,
//           longitude: geo.longitude,
//         };
//       }

if (isTransport) {
  const {
    pickupLatitude,
    pickupLongitude,
    dropoffLatitude,
    dropoffLongitude,
  } = req.body; // destructure these alongside your existing fields at the top

  let pickupGeo, dropoffGeo;

  // ── Pickup: use frontend coordinates if provided (from Places Autocomplete) ──
  if (pickupLatitude && pickupLongitude) {
    pickupGeo = {
      latitude: pickupLatitude,
      longitude: pickupLongitude,
      formattedAddress: pickupAddress, // trust the autocomplete-selected text
    };
    console.log("📍 Pickup — using frontend address and coordinates:",pickupAddress, pickupLatitude, pickupLongitude);
  } else {
    // Fallback — only geocode if frontend didn't send coordinates
    pickupGeo = await this.geocodeWithFallback(pickupAddress);
    console.log("📍 Pickup — geocoded fallback:", pickupGeo.latitude, pickupGeo.longitude, "-", pickupGeo.formattedAddress);
  }

  // ── Dropoff: same logic ───────────────────────────────────────────────────
  if (dropoffLatitude && dropoffLongitude) {
    dropoffGeo = {
      latitude: dropoffLatitude,
      longitude: dropoffLongitude,
      formattedAddress: dropoffAddress,
    };
    console.log("📍 Dropoff — using frontend address and coordinates:",dropoffAddress, dropoffLatitude, dropoffLongitude);
  } else {
    dropoffGeo = await this.geocodeWithFallback(dropoffAddress);
    console.log("📍 Dropoff — geocoded fallback:", dropoffGeo.latitude, dropoffGeo.longitude, "-", dropoffGeo.formattedAddress);
  }

  bookingData.pickupLocation = {
    address: pickupAddress,
    formattedAddress: pickupGeo.formattedAddress,
    coordinates: {
      type: "Point",
      coordinates: [pickupGeo.longitude, pickupGeo.latitude],
    },
  };

  bookingData.dropoffLocation = {
    address: dropoffAddress,
    formattedAddress: dropoffGeo.formattedAddress,
    coordinates: {
      type: "Point",
      coordinates: [dropoffGeo.longitude, dropoffGeo.latitude],
    },
  };

  const directions = await this.getDirectionsWithFallback(
    [pickupGeo.longitude, pickupGeo.latitude],
    [dropoffGeo.longitude, dropoffGeo.latitude],
  );

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
  const { latitude, longitude } = req.body; // same pattern for regular services

  let geo;
  if (latitude && longitude) {
    geo = { latitude, longitude, formattedAddress: address };
  } else {
    geo = await this.geocodeWithFallback(address);
  }

  bookingData.location = {
    address,
    formattedAddress: geo.formattedAddress,
    coordinates: {
      type: "Point",
      coordinates: [geo.longitude, geo.latitude],
    },
  };

  bookingData.agreedPrice = budget;
  bookingData.totalAmount = budget;

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
        const bookingResponse = this.prepareBookingResponse(booking);
        return res.status(201).json({
          success: true,
          message: "Booking created but no providers available nearby",
          data: {
            booking: bookingResponse,
            pricing: bookingResponse.pricing,
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

      const providerPricingOptions = enrichedProviders.map((p) => ({
        providerId: p.id,
        riderPays: p.pricing.riderPays,
        driverReceives: p.pricing.driverReceives,
        platformEarns: p.pricing.platformEarns,
        breakdown: p.pricing.breakdown,
        meta: p.pricing.meta,
      }));

      // Store provider distances for later use in confirmProvider
      booking.providerDistances = enrichedProviders.map((p) => ({
        providerId: p.id,
        distanceFromPickup: p.distanceFromPickup,
        providerETAMinutes: p.providerETA.value,
        vehicleProductionYear: p.vehicleProductionYear,
      }));
      booking.providerPricingOptions = providerPricingOptions;

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

          const launchPromo = discountService.buildLaunchPromoBreakdown({
            user: buyer,
            booking,
            pricingBreakdown: pricing.breakdown,
            applyDiscount: applyRideDiscount,
          });

          booking.calculatedPrice = launchPromo.totalAmount;
          booking.agreedPrice = launchPromo.agreedPrice;
          booking.totalAmount = launchPromo.totalAmount;
          booking.serviceFee = launchPromo.serviceFee;
          booking.providerCommission = launchPromo.providerCommission;
          booking.driverReceives = launchPromo.providerReceives;
          booking.providerReceives = launchPromo.providerReceives;
          booking.platformEarns = launchPromo.platformEarns;
          booking.pricingBreakdown = {
            breakdown: pricing.breakdown,
            ...launchPromo,
            riderPaysFinal: launchPromo.totalAmount,
            meta: pricing.meta,
          };
          booking.pricingMeta = {
            ...pricing.meta,
          };
          booking.payment = {
            ...(booking.payment || {}),
            discount: {
              code: launchPromo.discountCode,
              percent: launchPromo.discountPercent,
              amount: launchPromo.discountAmount,
              applied: launchPromo.discountApplied,
              reason: launchPromo.discountReason,
            },
          };
          booking.applyRideDiscount = applyRideDiscount;
          booking.selectedAt = new Date();
          booking.notifiedProviders = enrichedProviders.map((p) => p.id);
          booking.status = "awaiting_provider_acceptance";
          await booking.save();

          this.notifyProvidersForFastestFinger(booking, enrichedProviders);
          const bookingResponse = this.prepareBookingResponse(booking);

          return res.status(201).json({
            success: true,
            message: "Booking created. Looking for a provider near you.",
            data: {
              booking: bookingResponse,
              pricing: bookingResponse.pricing,
              notifiedProvidersCount: enrichedProviders.length,
              calculatedPrice: booking.calculatedPrice,
              originalPricing: formatPricing(pricing),
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
          const bookingResponse = this.prepareBookingResponse(booking);

          return res.status(201).json({
            success: true,
            message: "Booking created successfully",
            data: {
              booking: bookingResponse,
              pricing: bookingResponse.pricing,
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
      booking.applyRideDiscount = applyRideDiscount;
      await booking.save();
      const bookingResponse = this.prepareBookingResponse(booking);

      return res.status(201).json({
        success: true,
        message: "Booking created successfully",
        data: {
          booking: bookingResponse,
          pricing: bookingResponse.pricing,
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
            rating: 1,
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
          return (b.rating?.average ?? 0) - (a.rating?.average ?? 0);
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
            message: `New ${booking.serviceType} booking nearby - ${booking.distance?.value || "N/A"} km away. Please respond within 2 minutes to accept.`,
            bookingId: booking._id,
            scheduleDate: booking.scheduleDate,
            serviceType: booking.serviceType,
            pickupAddress: booking.pickupLocation?.address,
            dropoffAddress: booking.dropoffLocation?.address,
            distance: booking.distance?.value,
            calculatedPrice: booking.driverReceives,
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
      const numericScore =
        score !== undefined && score !== null ? Number(score) : undefined;

      if (
        numericScore !== undefined &&
        (!Number.isFinite(numericScore) || numericScore < 1 || numericScore > 5)
      ) {
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
        status: {
          $in: ["completed", "user_accepted_completion", "funds_released"],
        },
        userId,
      })
        .populate("providerId", "fullName rating reviews")
        .populate("userId", "fullName profilePicture");

      if (!booking) {
        return res.status(400).json({
          success: false,
          message: "Booking not marked completed by provider",
        });
      }

      if (
        ["user_accepted_completion", "funds_released"].includes(booking.status)
      ) {
        return res.status(409).json({
          success: false,
          message: "Job completion already accepted",
        });
      }

      const providerId = booking.providerId?._id || booking.providerId;

      if (tipAmount !== undefined && booking.tipAmount) {
        return res.status(409).json({
          success: false,
          message: "Tip already added for this booking",
        });
      }

      booking.status = "user_accepted_completion";

      if (numericScore !== undefined || review) {
        booking.rating = {
          score: numericScore,
          review,
          ratedAt: new Date(),
        };
      }

      await booking.save();

      if (providerId && numericScore !== undefined) {
        const providerDoc =
          await Provider.findById(providerId).select("rating reviews");

        if (providerDoc) {
          const currentAverage = providerDoc.rating?.average || 0;
          const currentCount = providerDoc.rating?.count || 0;
          const nextCount = currentCount + 1;
          const nextAverage =
            (currentAverage * currentCount + numericScore) / nextCount;

          providerDoc.rating.average = Math.round(nextAverage * 100) / 100;
          providerDoc.rating.count = nextCount;

          providerDoc.reviews.push({
            bookingId: booking._id,
            userId: booking.userId?._id || booking.userId,
            userName: booking.userId?.fullName,
            userAvatar: booking.userId?.profilePicture,
            score: numericScore,
            review,
            serviceType: booking.serviceType,
            ratedAt: new Date(),
          });

          await providerDoc.save();
        }
      }

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
          providerId,
          tipAmount,
          booking._id,
          notificationService,
        );
        booking.tipAmount = Number(tipAmount);
      }

      await booking.save();

      await notificationService.notifyProvider(providerId, {
        type: "job_completed_confirmed",
        title: "Job Completion Confirmed And You got a bonus.🥳",
        message: `Your customer confirmed completion of the ${booking.serviceType} service. Your payment has been released. Note that you will be able to withdraw the payment after 24 hours. Check your transaction history for details.`,
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

  async disputeJobCompleted(req, res) {
    try {
      const bookingId = req.params.id;
      const userId = req.user.id;
      const { reason } = req.body;

      if (!reason || String(reason).trim().length === 0) {
        return res.status(400).json({
          success: false,
          message: "reason is required",
        });
      }

      const booking = await Booking.findOne({
        _id: bookingId,
        status: {
          $in: ["completed", "user_accepted_completion", "funds_released"],
        },
        userId,
      })
        .populate("providerId", "fullName email")
        .populate("userId", "fullName profilePicture");

      if (!booking) {
        return res.status(400).json({
          success: false,
          message: "Booking not found or not eligible for dispute",
        });
      }

      const providerId = booking.providerId?._id || booking.providerId;

      // Mark booking as disputed
      booking.status = "disputed";
      booking.disputeRaisedAt = new Date();
      booking.disputeRaisedBy = userId;
      booking.disputeReason = reason;

      await booking.save();

      try {
        await Promise.all([
          notificationService.notifyProvider(providerId, {
            type: "booking_disputed",
            title: "⚠️ Dispute Raised",
            message: `A customer has raised a dispute regarding the ${booking.serviceType} booking. Our team will review and contact you shortly.`,
            bookingId: booking._id,
            userId,
            reason,
            additionalInfo: {
              reason,
              service: booking.serviceType,
              note: "Our team will investigate this matter and send you feedback within 48 hours.",
            },
          }),
          notificationService.notifyUser(userId, {
            type: "booking_disputed",
            title: "⚠️ Dispute Submitted",
            message: `Your dispute for the ${booking.serviceType} booking has been submitted successfully. Our team will review it and contact you shortly.`,
            bookingId: booking._id,
            providerId,
            reason,
            additionalInfo: {
              reason,
              service: booking.serviceType,
              note: "Our team will investigate this matter and send you feedback within 48 hours.",
            },
          }),
        ]);
      } catch (notificationErr) {
        console.error(
          `❌ Failed to notify provider about dispute:`,
          notificationErr,
        );
        // Don't fail the entire request if notification fails
      }

      return res.status(200).json({
        success: true,
        message:
          "Dispute raised successfully. Our team will review and contact both parties.",
        data: {
          bookingId: booking._id,
          status: booking.status,
          disputeRaisedAt: booking.disputeRaisedAt,
          reason: booking.disputeReason,
          note: "Our support team will investigate this matter and send feedback within 48 hours.",
        },
      });
    } catch (error) {
      console.error("Dispute job completion error:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to raise dispute",
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

      if (!provider) {
        return res.status(404).json({
          success: false,
          message: "Provider not found",
        });
      }

      const selectedPricing =
        Array.isArray(booking.providerPricingOptions) &&
        booking.providerPricingOptions.find(
          (p) => String(p.providerId) === String(providerId),
        );

      let finalPricing = selectedPricing || null;

      if (!finalPricing) {
        const isBike = provider.job?.some((j) => j.title === "motorbike_rider");

        const providerMeta = booking.providerDistances.find(
          (p) => String(p.providerId) === String(providerId),
        );

        if (!providerMeta) {
          return res.status(400).json({
            success: false,
            message: "Pricing snapshot for this provider is unavailable",
          });
        }

        const totalDistanceKm =
          booking.distance.value + providerMeta.distanceFromPickup;
        const totalDurationMinutes =
          booking.estimatedDuration.value + providerMeta.providerETAMinutes;

        finalPricing = pricingService.calculateTransportPrice(
          totalDistanceKm,
          booking.subCategory,
          booking.serviceType,
          totalDurationMinutes,
          provider.vehicleProductionYear,
          isBike,
        );
      }

      booking.providerId = providerId;
      const launchPromo = discountService.buildLaunchPromoBreakdown({
        user: await Buyer.findById(userId).lean(),
        booking,
        pricingBreakdown: finalPricing.breakdown ?? {},
        applyDiscount: booking.applyRideDiscount,
      });

      booking.calculatedPrice = launchPromo.totalAmount;
      booking.agreedPrice = launchPromo.agreedPrice;
      booking.totalAmount = launchPromo.totalAmount;
      booking.serviceFee = launchPromo.serviceFee;
      booking.providerCommission = launchPromo.providerCommission;
      booking.driverReceives = launchPromo.providerReceives;
      booking.providerReceives = launchPromo.providerReceives;
      booking.platformEarns = launchPromo.platformEarns;
      booking.pricingBreakdown = {
        breakdown: finalPricing.breakdown ?? null,
        ...launchPromo,
        riderPaysFinal: launchPromo.totalAmount,
        meta: finalPricing.meta ?? null,
      };
      booking.pricingMeta = {
        ...(finalPricing.meta ?? {}),
      };
      booking.payment = {
        ...(booking.payment || {}),
        discount: {
          code: launchPromo.discountCode,
          percent: launchPromo.discountPercent,
          amount: launchPromo.discountAmount,
          applied: launchPromo.discountApplied,
          reason: launchPromo.discountReason,
          maxDiscount: 500,
        },
      };
      booking.selectedAt = new Date();
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
        message: `A customer has selected you for a ${booking.serviceType} booking. Please review the details in Hire Alert and accept or ignore the job within 2 minutes.`,
        bookingId: booking._id,
        serviceType: booking.serviceType,
        pickupAddress: booking.pickupLocation?.address,
        dropoffAddress: booking.dropoffLocation?.address,
        budget: booking.driverReceives,
      });

      const bookingResponse = this.prepareBookingResponse(booking);

      return res.status(200).json({
        success: true,
        message: "Provider selected successfully",
        data: {
          booking: bookingResponse,
          pricing: bookingResponse.pricing,
          flowType: "user_selection",
        },
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
            "payment_pending",
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

  async deleteBooking(req, res) {
    try {
      const bookingId = req.params.id;
      const userId = req.user.id;

      if (!mongoose.Types.ObjectId.isValid(bookingId)) {
        return res.status(400).json({
          success: false,
          message: "Invalid booking ID format",
        });
      }

      const booking = await Booking.findOne({
        _id: bookingId,
        userId,
      });

      if (!booking) {
        return res.status(404).json({
          success: false,
          message: "Booking not found",
        });
      }

      if (!DELETABLE_BOOKING_STATUSES.includes(booking.status)) {
        return res.status(409).json({
          success: false,
          message:
            "Booking cannot be deleted in its current state. Cancel it first or contact support.",
        });
      }

      const bookingObjectId = booking._id;

      const [deletedNotifications, deletedChat] = await Promise.all([
        Notification.deleteMany({
          "data.bookingId": {
            $in: [bookingObjectId, bookingObjectId.toString()],
          },
        }),
        Chat.deleteOne({ bookingId: bookingObjectId }),
      ]);

      const deletedBooking = await Booking.deleteOne({
        _id: bookingObjectId,
        userId,
      });

      if (!deletedBooking.deletedCount) {
        throw new Error("Booking delete failed");
      }

      return res.status(200).json({
        success: true,
        message: "Booking and related chats/notifications deleted successfully",
        data: {
          bookingId: bookingObjectId,
          deletedRelatedRecords: {
            notificationsDeleted: deletedNotifications.deletedCount || 0,
            chatDeleted: Boolean(deletedChat.deletedCount),
          },
        },
      });
    } catch (error) {
      console.error("Delete booking error:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to delete booking",
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
        maxDistanceKm,
        minDistanceKm,
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

      if (maxDistanceKm !== undefined || minDistanceKm !== undefined) {
        query["distance.value"] = {};

        if (maxDistanceKm !== undefined) {
          const parsedMaxDistanceKm = Number(maxDistanceKm);
          if (!Number.isFinite(parsedMaxDistanceKm)) {
            return res.status(400).json({
              success: false,
              message: "maxDistanceKm must be a valid number",
            });
          }

          query["distance.value"].$lte = parsedMaxDistanceKm;
        }

        if (minDistanceKm !== undefined) {
          const parsedMinDistanceKm = Number(minDistanceKm);
          if (!Number.isFinite(parsedMinDistanceKm)) {
            return res.status(400).json({
              success: false,
              message: "minDistanceKm must be a valid number",
            });
          }

          query["distance.value"].$gte = parsedMinDistanceKm;
        }
      }

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

      const bookingsWithPricing = bookings.map((booking) => ({
        ...this.prepareBookingResponse(booking),
      }));

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
        data: bookingsWithPricing,
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

      const bookingResponse = this.prepareBookingResponse(booking);

      return res.status(200).json({
        success: true,
        data: {
          booking: bookingResponse,
          pricing: bookingResponse.pricing,
        },
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
        .skip((page - 1) * limit)
        .lean();

      const bookingsWithPricing = bookings.map((booking) => ({
        ...this.prepareBookingResponse(booking),
      }));

      const count = await Booking.countDocuments(query);

      return res.status(200).json({
        success: true,
        data: bookingsWithPricing,
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

  async getBookingsByUserId(req, res) {
    try {
      const { userId } = req.params;
      const { status, page = 1, limit = 10 } = req.query;

      if (!mongoose.Types.ObjectId.isValid(userId)) {
        return res.status(400).json({
          success: false,
          message: "Invalid user ID format",
        });
      }

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
        .skip((page - 1) * limit)
        .lean();

      const bookingsWithPricing = bookings.map((booking) => ({
        ...this.prepareBookingResponse(booking),
      }));

      const count = await Booking.countDocuments(query);

      return res.status(200).json({
        success: true,
        data: bookingsWithPricing,
        totalPages: Math.ceil(count / limit),
        currentPage: parseInt(page),
        total: count,
      });
    } catch (error) {
      console.error("Get bookings by userId error:", error);
      return res.status(500).json({
        success: false,
        message: "Error fetching bookings by userId",
        error: error.message,
      });
    }
  }

  async getBookingsByProviderId(req, res) {
    try {
      const { providerId } = req.params;
      const { status, page = 1, limit = 10 } = req.query;

      if (!mongoose.Types.ObjectId.isValid(providerId)) {
        return res.status(400).json({
          success: false,
          message: "Invalid provider ID format",
        });
      }

      const query = { providerId };
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
        .skip((page - 1) * limit)
        .lean();

      const bookingsWithPricing = bookings.map((booking) => ({
        ...this.prepareBookingResponse(booking),
      }));

      const count = await Booking.countDocuments(query);

      return res.status(200).json({
        success: true,
        data: bookingsWithPricing,
        totalPages: Math.ceil(count / limit),
        currentPage: parseInt(page),
        total: count,
      });
    } catch (error) {
      console.error("Get bookings by providerId error:", error);
      return res.status(500).json({
        success: false,
        message: "Error fetching bookings by providerId",
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
