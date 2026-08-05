const Business = require("./business.model");

const getBusinessesWithPagination = async (filters = {}, { skip, limit }) => {
  try {
    const query = { isDeleted: false, ...filters };

    const [businesses, total] = await Promise.all([
      Business.find(query)
        .select(
          "-password -refreshToken -refreshTokenExpiresAt -otp -resetOtp -resetOtpExpires -fcmToken",
        )
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Business.countDocuments(query),
    ]);

    return {
      businesses,
      total,
    };
  } catch (error) {
    console.error("Error fetching businesses with pagination:", error);
    // throw new Error(`Failed to fetch businesses: ${error.message}`);
  }
};

module.exports = {
  getBusinessesWithPagination,
};
