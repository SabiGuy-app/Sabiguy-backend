const jwt = require('jsonwebtoken');
const { getPagination } = require('../../shared/utils/pagination');
const Business = require('./business.model');
const businessService = require('./business.service');

const ACCESS_TOKEN_EXPIRES_IN = process.env.ACCESS_TOKEN_EXPIRES_IN || '20h';

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
        { BusinessName: { $regex: req.query.search, $options: 'i' } },
        { email: { $regex: req.query.search, $options: 'i' } },
        { regNumber: { $regex: req.query.search, $options: 'i' } },
      ];
    }

    if (req.query.isActive !== undefined) {
      filters.isActive = req.query.isActive === 'true';
    }

    if (req.query.kycVerified !== undefined) {
      filters.kycVerified = req.query.kycVerified === 'true';
    }

    // Get businesses with pagination
    const result = await businessService.getBusinessesWithPagination(filters, {
      skip,
      limit,
    });

    const response = {
      status: 'success',
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
    console.error('Error in getAllBusinesses controller:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

// POST /invite-driver — business owner invites a registered driver to their fleet.
const inviteDriver = async (req, res) => {
  try {
    const invitation = await businessService.inviteDriver(req.user.id, req.body);

    return res.status(201).json({
      success: true,
      message: 'Driver invitation sent successfully',
      data: {
        invitationId: invitation._id,
        status: invitation.status,
        driverEmail: invitation.driverEmail,
        role: invitation.role,
        expiresAt: invitation.tokenExpiresAt,
      },
    });
  } catch (error) {
    return handleServiceError(res, error, 'Failed to send driver invitation');
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
      message: 'Drivers fetched successfully',
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
    return handleServiceError(res, error, 'Failed to fetch business drivers');
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
      message: 'Vehicles fetched successfully',
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
    return handleServiceError(res, error, 'Failed to fetch business vehicles');
  }
};

const getBusinessByEmail = async (req, res) => {
  try {
    const email = req.query.email || req.params.email;
    const business = await businessService.getBusinessByEmail(email);

    return res.status(200).json({
      success: true,
      message: 'Business fetched successfully',
      data: business,
    });
  } catch (error) {
    return handleServiceError(res, error, 'Failed to fetch business');
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
    return handleServiceError(res, error, 'Failed to respond to invitation');
  }
};

// POST /business-details — create the authenticated business owner's profile.
const addBusinessDetails = async (req, res) => {
  try {
    const business = await businessService.addBusinessDetails(req.user.id, req.body);

    return res.status(201).json({
      success: true,
      message: 'Business details saved successfully',
      data: business,
    });
  } catch (error) {
    return handleServiceError(res, error, 'Failed to save business details');
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
      message: 'Business verification details saved successfully',
      data: verification,
    });
  } catch (error) {
    return handleServiceError(res, error, 'Failed to save business verification details');
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
      message: 'Vehicle details saved successfully',
      data: vehicles,
    });
  } catch (error) {
    return handleServiceError(res, error, 'Failed to save vehicle details');
  }
};


const addServiceDetails = async (req, res) => {
    try {
      const {
        service,
        availableDays,
        businessHours,
        servicePlace,
        studioImages,
      } = req.body || {};

      if (service !== undefined && !Array.isArray(service)) {
        return res.status(400).json({ message: "Service must be an array" });
      }

      if (availableDays !== undefined && !Array.isArray(availableDays)) {
        return res
          .status(400)
          .json({ message: "Available days must be an array" });
      }

      if (
        businessHours !== undefined &&
        (typeof businessHours !== "object" ||
          businessHours === null ||
          Array.isArray(businessHours))
      ) {
        return res
          .status(400)
          .json({ message: "Business hours must be an object" });
      }

      if (servicePlace !== undefined && !Array.isArray(servicePlace)) {
        return res
          .status(400)
          .json({ message: "Service place must be an array" });
      }

      if (studioImages !== undefined && !Array.isArray(studioImages)) {
        return res
          .status(400)
          .json({ message: "Studio images must be an array" });
      }

      const business = await Business.findById(req.user.id);
      if (!business) {
        return res.status(404).json({ message: "Business not found" });
      }

      if (service !== undefined) {
        business.service = service.map((item) => ({
          serviceName: item.serviceName,
          pricingModel: item.pricingModel,
          price: item.price,
        }));
      }

      if (availableDays !== undefined) {
        business.availableDays = availableDays;
      }

      if (businessHours !== undefined) {
        business.businessHours = {
          start: businessHours.start,
          end: businessHours.end,
        };
      }

      if (servicePlace !== undefined) {
        business.servicePlace = servicePlace;
      }

      if (studioImages !== undefined) {
        business.studioImages = studioImages.map((item) => ({
          pictures: Array.isArray(item.pictures) ? item.pictures : [],
          videos: Array.isArray(item.videos) ? item.videos : [],
        }));
      }

      await business.save();

      return res.status(200).json({
        success: true,
        message: "Service details added successfully",
        data: {
          service: business.service,
          availableDays: business.availableDays,
          businessHours: business.businessHours,
          servicePlace: business.servicePlace,
          studioImages: business.studioImages,
        },
      });
    } catch (err) {
      console.error("Add service details error:", err);
      return res.status(500).json({ success: false, message: err.message });
    }
  }

  const  getKycLevel = async (req, res) => {
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
  }

module.exports = {
  getAllBusinesses,
  inviteDriver,
  getBusinessDrivers,
  getBusinessVehicles,
  getBusinessByEmail,
  respondToInvitation,
  addBusinessDetails,
  addBusinessVerification,
  addVehicleDetails,
  getKycLevel
};
