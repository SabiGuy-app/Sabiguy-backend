const Provider = require ('../models/ServiceProvider');
const Buyer = require ('../models/ServiceUser');
const geolocationService = require("../src/services/geolocation.service");

const getPagination = (req) => {
  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  const limit = Math.max(parseInt(req.query.limit, 10) || 20, 1);
  const safeLimit = Math.min(limit, 100);
  const skip = (page - 1) * safeLimit;
  return { page, limit: safeLimit, skip };
};

exports.getAllBuyers = async (req, res) => {
  try {
    const { page, limit, skip } = getPagination(req);

    const [result] = await Buyer.aggregate([
      { $sort: { createdAt: -1, _id: -1 } },
      {
        $facet: {
          data: [
            { $skip: skip },
            { $limit: limit },
            {
              $lookup: {
                from: "bookings",
                localField: "_id",
                foreignField: "userId",
                as: "bookingStats",
                pipeline: [
                  { $count: "count" },
                ],
              },
            },
            {
              $addFields: {
                bookingsCount: {
                  $ifNull: [{ $arrayElemAt: ["$bookingStats.count", 0] }, 0],
                },
              },
            },
            {
              $project: {
                bookingStats: 0,
                password: 0,
                otp: 0,
                otpExpiresAt: 0,
                resetOtp: 0,
                resetOtpExpires: 0,
                refreshToken: 0,
                __v: 0,
              },
            },
          ],
          total: [{ $count: "count" }],
        },
      },
    ]);

    const buyers = result?.data || [];
    const total = result?.total?.[0]?.count || 0;

    res.status(200).json({
      success: true,
      count: buyers.length,
      total,
      page,
      totalPages: Math.ceil(total / limit) || 1,
      data: buyers,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.getAllProviders = async (req, res) => {
  try {
    const { page, limit, skip } = getPagination(req);
    const { kycLevel, kycVerified } = req.query;
    const query = {};

    if (kycLevel !== undefined) {
      const parsedLevel = parseInt(kycLevel, 10);
      if (Number.isNaN(parsedLevel)) {
        return res
          .status(400)
          .json({ success: false, message: "Invalid kycLevel" });
      }
      query.kycLevel = parsedLevel;
    }

    if (kycVerified !== undefined) {
      const normalized = String(kycVerified).toLowerCase();
      if (normalized === "true" || normalized === "false") {
        query.kycVerified = normalized === "true";
      } else {
        return res
          .status(400)
          .json({ success: false, message: "Invalid kycVerified" });
      }
    }

    const [result] = await Provider.aggregate([
      { $match: query },
      { $sort: { createdAt: -1, _id: -1 } },
      {
        $facet: {
          data: [
            { $skip: skip },
            { $limit: limit },
            {
              $lookup: {
                from: "bookings",
                localField: "_id",
                foreignField: "providerId",
                as: "bookingStats",
                pipeline: [{ $count: "count" }],
              },
            },
            {
              $addFields: {
                bookingsCount: {
                  $ifNull: [{ $arrayElemAt: ["$bookingStats.count", 0] }, 0],
                },
              },
            },
            {
              $project: {
                bookingStats: 0,
                password: 0,
                otp: 0,
                otpExpiresAt: 0,
                resetOtp: 0,
                resetOtpExpires: 0,
                refreshToken: 0,
                __v: 0,
              },
            },
          ],
          total: [{ $count: "count" }],
        },
      },
    ]);

    const providers = result?.data || [];
    const total = result?.total?.[0]?.count || 0;
    res.status(200).json({
      success: true,
      count: providers.length,
      total,
      page,
      totalPages: Math.ceil(total / limit) || 1,
      data: providers,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.getAllUsers = async (req, res) => {
  try {
    const { page, limit, skip } = getPagination(req);

    const [result] = await Buyer.aggregate([
      { $addFields: { userType: "buyer" } },
      { $project: { password: 0, __v: 0 } },
      {
        $unionWith: {
          coll: "providers",
          pipeline: [
            { $addFields: { userType: "provider" } },
            { $project: { password: 0, __v: 0 } },
          ],
        },
      },
      { $sort: { createdAt: -1, _id: -1 } },
      {
        $facet: {
          data: [{ $skip: skip }, { $limit: limit }],
          total: [{ $count: "count" }],
        },
      },
    ]);

    const users = result?.data || [];
    const total = result?.total?.[0]?.count || 0;

    res.status(200).json({
      success: true,
      count: users.length,
      total,
      page,
      totalPages: Math.ceil(total / limit) || 1,
      data: users,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.getUserByEmail = async (req, res) => {
  try {
    const { email } = req.params;
    const buyer = await Buyer.findOne({ email }).select("-password");
    const provider = await Provider.findOne({ email }).select("-password");

    if (!buyer && !provider) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    res.status(200).json({
      success: true,
      data: buyer || provider,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.getUserById = async (req, res) => {
  try {
    const { id } = req.params;
    const buyer = await Buyer.findById(id).select("-password");
    const provider = await Provider.findById(id).select("-password");

    if (!buyer && !provider) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    res.status(200).json({
      success: true,
      data: buyer || provider,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// exports.updateUserLocation = async (req, res) => {
//     try {
//       const buyerId = req.user.id;
//       const { latitude, longitude, address } = req.body;

//       if (!latitude || !longitude) {
//         return res.status(400).json({
//           success: false,
//           message: "Latitude and longitude are required",
//         });
//       }

//       // Validate coordinates
//       if (
//         latitude < -90 ||
//         latitude > 90 ||
//         longitude < -180 ||
//         longitude > 180
//       ) {
//         return res.status(400).json({
//           success: false,
//           message: "Invalid coordinates",
//         });
//       }

//       // Get existing buyer to check if geocoding is needed
//       const existingBuyer = await Buyer.findById(buyerId);
//       if (!existingBuyer) {
//         return res.status(404).json({
//           success: false,
//           message: "Buyer not found",
//         });
//       }

//       let finalAddress = address || existingBuyer.currentLocation?.address;
//       const shouldReverseGeocode = !finalAddress;

//       // Smart reverse geocoding: Only call if coordinates moved significantly
//       if (shouldReverseGeocode) {
//         try {
//           const oldCoords = existingBuyer.currentLocation?.coordinates || [
//             0, 0,
//           ];
//           const [oldLng, oldLat] = oldCoords;

//           // Calculate distance moved using Haversine formula
//           const R = 6371; // Earth's radius in km
//           const dLat = ((latitude - oldLat) * Math.PI) / 180;
//           const dLon = ((longitude - oldLng) * Math.PI) / 180;
//           const a =
//             Math.sin(dLat / 2) * Math.sin(dLat / 2) +
//             Math.cos((oldLat * Math.PI) / 180) *
//               Math.cos((latitude * Math.PI) / 180) *
//               Math.sin(dLon / 2) *
//               Math.sin(dLon / 2);
//           const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
//           const distanceMoved = R * c;

//           // Only reverse geocode if moved more than 500 meters or first time (no old coords)
//           if (distanceMoved > 0.5 || (oldLat === 0 && oldLng === 0)) {
//             console.log(
//               `🔄 Reverse geocoding (moved ${distanceMoved.toFixed(2)}km)`,
//             );
//             const geoData = await geolocationService.reverseGeocode(
//               longitude,
//               latitude,
//             );
//             finalAddress = geoData.formattedAddress;
//           } else {
//             // Reuse cached address
//             console.log(
//               `📌 Reusing cached address (moved ${distanceMoved.toFixed(2)}km)`,
//             );
//             finalAddress = existingBuyer.currentLocation?.address;
//           }
//         } catch (geoError) {
//           console.warn(
//             "Reverse geocoding failed, using fallback:",
//             geoError.message,
//           );
//           finalAddress =
//             existingBuyer.currentLocation?.address ||
//             `${latitude}, ${longitude}`;
//         }
//       }

//       const buyer = await Buyer.findByIdAndUpdate(
//         buyerId,
//         {
//           $set: {
//             "currentLocation.type": "Point",
//             "currentLocation.coordinates": [longitude, latitude], // [lng, lat]
//             "currentLocation.address": finalAddress,
//             lastLocationUpdate: new Date(),
//           },
//         },
//         { new: true },
//       );

//       console.log(`📍 Location updated for ${buyer.fullName}:`, {
//         coordinates: [longitude, latitude],
//         address: finalAddress,
//       });

//       return res.status(200).json({
//         success: true,
//         message: "Location updated successfully",
//         data: {
//           currentLocation: buyer.currentLocation,
//           lastLocationUpdate: buyer.lastLocationUpdate,
//         },
//       });
//     } catch (error) {
//       console.error("Update location error:", error);
//       return res.status(500).json({
//         success: false,
//         message: "Error updating location",
//         error: error.message,
//       });
//     }
// }

exports.updateUserLocation = async (req, res) => {
  try {
    const buyerId = req.user.id;
    const { latitude, longitude, address } = req.body;

    if (!latitude || !longitude) {
      return res.status(400).json({
        success: false,
        message: "Latitude and longitude are required",
      });
    }

    if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
      return res.status(400).json({
        success: false,
        message: "Invalid coordinates",
      });
    }

    const existingBuyer = await Buyer.findById(buyerId);
    if (!existingBuyer) {
      return res.status(404).json({
        success: false,
        message: "Buyer not found",
      });
    }

    // Helper to check if a string looks like raw coordinates (not a real address)
    const isRawCoords = (addr) => addr && /^-?\d+(\.\d+)?,\s*-?\d+(\.\d+)?$/.test(addr.trim());

    const existingAddress = existingBuyer.currentLocation?.address;

    // Use provided address only if it's a real address string, not raw coords
    const hasValidProvidedAddress = address && !isRawCoords(address);
    const hasValidCachedAddress = existingAddress && !isRawCoords(existingAddress);

    let finalAddress = null;
    let shouldReverseGeocode = true;

    if (hasValidProvidedAddress) {
      // Caller provided a real address — trust it
      finalAddress = address;
      shouldReverseGeocode = false;
    } else if (hasValidCachedAddress) {
      // Check if moved significantly before deciding to re-geocode
      const oldCoords = existingBuyer.currentLocation?.coordinates || [0, 0];
      const [oldLng, oldLat] = oldCoords;

      const isFirstLocation = oldLat === 0 && oldLng === 0;

      if (!isFirstLocation) {
        const R = 6371;
        const dLat = ((latitude - oldLat) * Math.PI) / 180;
        const dLon = ((longitude - oldLng) * Math.PI) / 180;
        const a =
          Math.sin(dLat / 2) * Math.sin(dLat / 2) +
          Math.cos((oldLat * Math.PI) / 180) *
            Math.cos((latitude * Math.PI) / 180) *
            Math.sin(dLon / 2) *
            Math.sin(dLon / 2);
        const distanceMoved = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

        if (distanceMoved <= 0.5) {
          // Hasn't moved much — reuse cached address
          console.log(`📌 Reusing cached address (moved ${distanceMoved.toFixed(2)}km)`);
          finalAddress = existingAddress;
          shouldReverseGeocode = false;
        }
      }
    }

    // Reverse geocode if needed
    if (shouldReverseGeocode) {
      try {
        console.log(`🔄 Reverse geocoding coordinates: ${latitude}, ${longitude}`);
        const geoData = await geolocationService.reverseGeocode(longitude, latitude);

        // Make sure Mapbox returned a real address
        if (geoData?.formattedAddress && !isRawCoords(geoData.formattedAddress)) {
          finalAddress = geoData.formattedAddress;
        } else {
          console.warn("Mapbox returned empty or invalid address:", geoData);
          finalAddress = hasValidCachedAddress ? existingAddress : `${latitude}, ${longitude}`;
        }
      } catch (geoError) {
        console.warn("Reverse geocoding failed:", geoError.message);
        finalAddress = hasValidCachedAddress ? existingAddress : `${latitude}, ${longitude}`;
      }
    }

    const buyer = await Buyer.findByIdAndUpdate(
      buyerId,
      {
        $set: {
          "currentLocation.type": "Point",
          "currentLocation.coordinates": [longitude, latitude],
          "currentLocation.address": finalAddress,
          lastLocationUpdate: new Date(),
        },
      },
      { new: true }
    );

    console.log(`📍 Location updated for buyer ${buyer.fullName}:`, {
      coordinates: [longitude, latitude],
      address: finalAddress,
    });

    return res.status(200).json({
      success: true,
      message: "Location updated successfully",
      data: {
        currentLocation: buyer.currentLocation,
        lastLocationUpdate: buyer.lastLocationUpdate,
      },
    });
  } catch (error) {
    console.error("Update location error:", error);
    return res.status(500).json({
      success: false,
      message: "Error updating location",
      error: error.message,
    });
  }
};