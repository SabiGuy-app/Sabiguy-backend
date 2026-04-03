const Provider = require ('../models/ServiceProvider');
const Buyer = require ('../models/ServiceUser');

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
