const jwt = require("jsonwebtoken");
const { getPagination } = require("../../shared/utils/pagination");
const Business = require("./business.model");
const businessService = require("./business.service");

const ACCESS_TOKEN_EXPIRES_IN = process.env.ACCESS_TOKEN_EXPIRES_IN || "20h";

// Maps the custom service-layer error classes to HTTP status codes so every
// new handler shares one error-response path instead of repeating if/else
// chains.
const SERVICE_ERROR_STATUS = {
  ValidationError: 400,
  ForbiddenError: 403,
  NotFoundError: 404,
  ConflictError: 409,
};

const handleServiceError = (res, error, fallbackMessage) => {
  const status = SERVICE_ERROR_STATUS[error.name];
  if (status) {
    return res.status(status).json({ success: false, message: error.message });
  }

  console.error(fallbackMessage, error);
  return res
    .status(500)
    .json({ success: false, message: fallbackMessage, error: error.message });
};

const getAllBusinesses = async (req, res, next) => {
  try {
    // Get pagination parameters from request
    const { page, limit, skip } = getPagination(req, {
      defaultPage: 1,
      defaultLimit: 20,
      maxLimit: 100,
    });

    // Add search/filter functionality
    let filters = {};
    if (req.query.search) {
      filters.$or = [
        { BusinessName: { $regex: req.query.search, $options: "i" } },
        { email: { $regex: req.query.search, $options: "i" } },
        { regNumber: { $regex: req.query.search, $options: "i" } },
      ];
    }

    if (req.query.isActive !== undefined) {
      filters.isActive = req.query.isActive === "true";
    }

    if (req.query.kycVerified !== undefined) {
      filters.kycVerified = req.query.kycVerified === "true";
    }

    // Get businesses with pagination
    const result = await businessService.getBusinessesWithPagination(filters, {
      skip,
      limit,
    });

    const response = {
      status: "success",
      data: {
        businesses: result.businesses,
        pagination: {
          currentPage: page,
          totalPages: Math.ceil(result.total / limit),
          totalItems: result.total,
          itemsPerPage: limit,
          hasNext: page < Math.ceil(result.total / limit),
          hasPrev: page > 1,
        },
      },
    };

    res.status(200).json(response);
  } catch (error) {
    console.error("Error in getAllBusinesses controller:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

const getBusinessById = async (req, res) => {
  try {
    const business = await businessService.getBusinessById(req.params.businessId);
    return res.status(200).json({ success: true, data: business });
  } catch (error) {
    return handleServiceError(res, error, "Failed to fetch business");
  }
};

// POST /invite-driver — business owner invites a registered driver to their fleet.
const inviteDriver = async (req, res) => {
  try {
    const invitation = await businessService.inviteDriver(
      req.user.id,
      req.body,
    );

    return res.status(201).json({
      success: true,
      message: "Driver invitation sent successfully",
      data: {
        invitationId: invitation._id,
        status: invitation.status,
        driverEmail: invitation.driverEmail,
        role: invitation.role,
        expiresAt: invitation.tokenExpiresAt,
      },
    });
  } catch (error) {
    return handleServiceError(res, error, "Failed to send driver invitation");
  }
};

// GET /business/drivers — all drivers (invitations) belonging to the business.
const getBusinessDrivers = async (req, res) => {
  try {
    const { page, limit, skip } = getPagination(req, {
      defaultPage: 1,
      defaultLimit: 20,
      maxLimit: 100,
    });

    const { invitations, total } = await businessService.getBusinessDrivers(
      req.user.id,
      { status: req.query.status, skip, limit },
    );

    const totalPages = Math.max(Math.ceil(total / limit), 1);

    return res.status(200).json({
      success: true,
      message: "Drivers fetched successfully",
      data: {
        drivers: invitations.map((invitation) => ({
          invitationId: invitation._id,
          status: invitation.status,
          role: invitation.role,
          invitedAt: invitation.createdAt,
          respondedAt: invitation.respondedAt,
          driver: invitation.driver,
        })),
        pagination: {
          currentPage: page,
          totalPages,
          totalItems: total,
          itemsPerPage: limit,
          hasNext: page < totalPages,
          hasPrev: page > 1,
        },
      },
    });
  } catch (error) {
    return handleServiceError(res, error, "Failed to fetch business drivers");
  }
};

// GET /business/vehicles — all vehicles registered under the business.
const getBusinessVehicles = async (req, res) => {
  try {
    const { page, limit, skip } = getPagination(req, {
      defaultPage: 1,
      defaultLimit: 20,
      maxLimit: 100,
    });

    const { vehicles, total } = await businessService.getBusinessVehicles(
      req.user.id,
      { skip, limit },
    );

    const totalPages = Math.max(Math.ceil(total / limit), 1);

    return res.status(200).json({
      success: true,
      message: "Vehicles fetched successfully",
      data: {
        vehicles,
        pagination: {
          currentPage: page,
          totalPages,
          totalItems: total,
          itemsPerPage: limit,
          hasNext: page < totalPages,
          hasPrev: page > 1,
        },
      },
    });
  } catch (error) {
    return handleServiceError(res, error, "Failed to fetch business vehicles");
  }
};

const getBusinessByEmail = async (req, res) => {
  try {
    const email = req.query.email || req.params.email;
    const business = await businessService.getBusinessByEmail(email);

    return res.status(200).json({
      success: true,
      message: "Business fetched successfully",
      data: business,
    });
  } catch (error) {
    return handleServiceError(res, error, "Failed to fetch business");
  }
};

// POST /driver/invitation/respond — driver accepts or rejects a pending invitation.
const respondToInvitation = async (req, res) => {
  try {
    const invitation = await businessService.respondToInvitation(
      req.user.id,
      req.body,
    );

    return res.status(200).json({
      success: true,
      message: `Invitation ${invitation.status.toLowerCase()} successfully`,
      data: {
        invitationId: invitation._id,
        status: invitation.status,
        businessId: invitation.business,
        respondedAt: invitation.respondedAt,
      },
    });
  } catch (error) {
    return handleServiceError(res, error, "Failed to respond to invitation");
  }
};

// POST /business-details — create the authenticated business owner's profile.
const addBusinessDetails = async (req, res) => {
  try {
    const business = await businessService.addBusinessDetails(
      req.user.id,
      req.body,
    );

    return res.status(201).json({
      success: true,
      message: "Business details saved successfully",
      data: business,
    });
  } catch (error) {
    return handleServiceError(res, error, "Failed to save business details");
  }
};

// POST /business-verification — submit business verification documents and photos.
const addBusinessVerification = async (req, res) => {
  try {
    const verification = await businessService.addBusinessVerification(
      req.user.id,
      req.body,
    );

    return res.status(201).json({
      success: true,
      message: "Business verification details saved successfully",
      data: verification,
    });
  } catch (error) {
    return handleServiceError(
      res,
      error,
      "Failed to save business verification details",
    );
  }
};

// POST /vehicle-details — add one or more vehicles for the authenticated business owner.
const addVehicleDetails = async (req, res) => {
  try {
    const vehicles = await businessService.addVehicleDetails(
      req.user.id,
      req.body.vehicles,
    );

    return res.status(201).json({
      success: true,
      message: "Vehicle details saved successfully",
      data: vehicles,
    });
  } catch (error) {
    return handleServiceError(res, error, "Failed to save vehicle details");
  }
};

// POST /service-details - add or update service details for the business owner.
const addServiceDetails = async (req, res) => {
  try {
    const serviceDetails = await businessService.addServiceDetails(
      req.user.id,
      req.body,
    );

    return res.status(200).json({
      success: true,
      message: "Service details added successfully",
      data: serviceDetails,
    });
  } catch (error) {
    return handleServiceError(res, error, "Failed to save service details");
  }
};

const getKycLevel = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ message: "Email is required" });
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const authEmail = req.user?.email
      ? String(req.user.email).trim().toLowerCase()
      : null;
    if (authEmail && authEmail !== normalizedEmail) {
      return res
        .status(403)
        .json({ message: "Email does not match authenticated user" });
    }

    const business = await Business.findOne({
      email: normalizedEmail,
    }).select("kycLevel kycCompleted kycVerified");
    if (!business) {
      return res.status(200).json({ message: "This is a new customer" });
    }

    const token = jwt.sign(
      { id: business._id, role: "businessOwner", email: normalizedEmail },
      process.env.JWT_SECRET,
      { expiresIn: ACCESS_TOKEN_EXPIRES_IN },
    );

    return res.status(200).json({
      success: true,
      data: {
        kycLevel: business.kycLevel || 0,
        kycCompleted: !!business.kycCompleted,
        kycVerified: !!business.kycVerified,
        token,
      },
    });
  } catch (error) {
    console.error("Get KYC level error:", error);
    return res.status(500).json({
      success: false,
      message: "Error fetching KYC level",
      error: error.message,
    });
  }
};

// PUT /profile — update the authenticated business owner's identity fields.
const updateBusinessProfile = async (req, res) => {
  try {
    const profile = await businessService.updateBusinessProfile(
      req.user.id,
      req.body,
    );

    return res.status(200).json({
      success: true,
      message: "Business profile updated successfully",
      data: profile,
    });
  } catch (error) {
    return handleServiceError(res, error, "Failed to update business profile");
  }
};

// PUT /operating-defaults — update currency, timezone and week start.
const updateBusinessOperatingDefaults = async (req, res) => {
  try {
    const defaults = await businessService.updateBusinessOperatingDefaults(
      req.user.id,
      req.body,
    );

    return res.status(200).json({
      success: true,
      message: "Operating defaults updated successfully",
      data: defaults,
    });
  } catch (error) {
    return handleServiceError(
      res,
      error,
      "Failed to update operating defaults",
    );
  }
};

// PUT /payout-account — update the business company payout bank account.
const updateBusinessPayoutAccount = async (req, res) => {
  try {
    const account = await businessService.updateBusinessPayoutAccount(
      req.user.id,
      req.body,
    );

    return res.status(200).json({
      success: true,
      message: "Payout account updated successfully",
      data: account,
    });
  } catch (error) {
    return handleServiceError(res, error, "Failed to update payout account");
  }
};

// PUT /payout-schedule — update the business default payout schedule.
const updateBusinessPayoutSchedule = async (req, res) => {
  try {
    const schedule = await businessService.updateBusinessPayoutSchedule(
      req.user.id,
      req.body,
    );

    return res.status(200).json({
      success: true,
      message: "Payout schedule updated successfully",
      data: schedule,
    });
  } catch (error) {
    return handleServiceError(res, error, "Failed to update payout schedule");
  }
};

// PUT /details/services — replace the business service catalog.
const updateBusinessServices = async (req, res) => {
  try {
    const data = await businessService.updateBusinessServices(
      req.user.id,
      req.body,
    );

    return res.status(200).json({
      success: true,
      message: "Business services updated successfully",
      data,
    });
  } catch (error) {
    return handleServiceError(res, error, "Failed to update business services");
  }
};

// PUT /details/available-days — update operating days.
const updateBusinessAvailableDays = async (req, res) => {
  try {
    const data = await businessService.updateBusinessAvailableDays(
      req.user.id,
      req.body,
    );

    return res.status(200).json({
      success: true,
      message: "Available days updated successfully",
      data,
    });
  } catch (error) {
    return handleServiceError(res, error, "Failed to update available days");
  }
};

// PUT /details/service-place — update service places.
const updateBusinessServicePlace = async (req, res) => {
  try {
    const data = await businessService.updateBusinessServicePlace(
      req.user.id,
      req.body,
    );

    return res.status(200).json({
      success: true,
      message: "Service places updated successfully",
      data,
    });
  } catch (error) {
    return handleServiceError(res, error, "Failed to update service places");
  }
};

// PUT /details/hours — update opening hours (start/end).
const updateBusinessHours = async (req, res) => {
  try {
    const data = await businessService.updateBusinessHours(
      req.user.id,
      req.body,
    );

    return res.status(200).json({
      success: true,
      message: "Business hours updated successfully",
      data,
    });
  } catch (error) {
    return handleServiceError(res, error, "Failed to update business hours");
  }
};

// PUT /details/studio-images — update the studio gallery.
const updateBusinessStudioImages = async (req, res) => {
  try {
    const data = await businessService.updateBusinessStudioImages(
      req.user.id,
      req.body,
    );

    return res.status(200).json({
      success: true,
      message: "Studio images updated successfully",
      data,
    });
  } catch (error) {
    return handleServiceError(res, error, "Failed to update studio images");
  }
};

module.exports = {
  getAllBusinesses,
  getBusinessById,
  inviteDriver,
  getBusinessDrivers,
  getBusinessVehicles,
  getBusinessByEmail,
  respondToInvitation,
  addBusinessDetails,
  addBusinessVerification,
  addVehicleDetails,
  addServiceDetails,
  getKycLevel,
  updateBusinessProfile,
  updateBusinessOperatingDefaults,
  updateBusinessPayoutAccount,
  updateBusinessPayoutSchedule,
  updateBusinessServices,
  updateBusinessAvailableDays,
  updateBusinessServicePlace,
  updateBusinessHours,
  updateBusinessStudioImages,
};
