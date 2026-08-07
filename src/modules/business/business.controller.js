const { getPagination } = require('../../shared/utils/pagination');
const Business = require('./business.model');
const businessService = require('./business.service');

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

module.exports = {
  getAllBusinesses,
  inviteDriver,
  getBusinessDrivers,
  getBusinessVehicles,
  respondToInvitation,
};
