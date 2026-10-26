const mongoose = require('mongoose');
const dashboardService = require('./dashboard.service');
const { ValidationError, ForbiddenError } = require('./business.service');

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

// Ensures the authenticated business owner is acting on their own account.
const assertSelfBusiness = (req) => {
  const { businessId } = req.params;
  if (!mongoose.isValidObjectId(businessId)) {
    throw new ValidationError('Invalid business ID');
  }
  if (
    req.user.role !== 'businessOwner' ||
    String(req.user.id) !== String(businessId)
  ) {
    throw new ForbiddenError('You can only view your own business dashboard');
  }
};

const getDashboardStats = async (req, res) => {
  try {
    assertSelfBusiness(req);

    const data = await dashboardService.getDashboardStats(
      req.params.businessId,
    );

    return res.status(200).json({
      success: true,
      message: 'Dashboard stats fetched successfully',
      data,
    });
  } catch (error) {
    return handleServiceError(res, error, 'Failed to fetch dashboard stats');
  }
};

const getDashboardActivity = async (req, res) => {
  try {
    assertSelfBusiness(req);

    const data = await dashboardService.getDashboardActivity(
      req.params.businessId,
      { limit: req.query.limit },
    );

    return res.status(200).json({
      success: true,
      message: 'Dashboard activity fetched successfully',
      data,
    });
  } catch (error) {
    return handleServiceError(res, error, 'Failed to fetch dashboard activity');
  }
};

module.exports = {
  getDashboardStats,
  getDashboardActivity,
};
