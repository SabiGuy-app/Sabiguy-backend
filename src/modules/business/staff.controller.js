const mongoose = require('mongoose');
const staffService = require('./staff.service');
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

// Ensures the authenticated business owner is acting on their own account;
const assertSelfBusiness = (req) => {
  const { businessId } = req.params;
  if (!mongoose.isValidObjectId(businessId)) {
    throw new ValidationError('Invalid business ID');
  }
  if (
    req.user.role !== 'businessOwner' ||
    String(req.user.id) !== String(businessId)
  ) {
    throw new ForbiddenError('You can only manage staff for your own business');
  }
};

const inviteStaff = async (req, res) => {
  try {
    assertSelfBusiness(req);

    const staff = await staffService.inviteStaff(req.params.businessId, {
      email: req.body.email,
      role: req.body.role,
      services: req.body.services,
      canDoHomeService: req.body.canDoHomeService,
    });

    return res.status(201).json({
      success: true,
      message: 'Staff invitation sent successfully',
      data: {
        staffId: staff._id,
        email: staff.email,
        role: staff.role,
        services: staff.services,
        canDoHomeService: staff.canDoHomeService,
        status: staff.status,
        expiresAt: staff.inviteExpiresAt,
      },
    });
  } catch (error) {
    return handleServiceError(res, error, 'Failed to send staff invitation');
  }
};

const getStaffCandidates = async (req, res) => {
  try {
    assertSelfBusiness(req);

    const data = await staffService.getStaffCandidates(
      req.params.businessId,
      req.params.bookingId,
    );

    return res.status(200).json({
      success: true,
      message: 'Staff candidates fetched successfully',
      data,
    });
  } catch (error) {
    return handleServiceError(res, error, 'Failed to fetch staff candidates');
  }
};

const assignStaffToBooking = async (req, res) => {
  try {
    assertSelfBusiness(req);

    const data = await staffService.assignStaffToBooking(
      req.params.businessId,
      req.params.bookingId,
      req.body.staffId,
    );

    return res.status(200).json({
      success: true,
      message: 'Staff assigned to booking successfully',
      data,
    });
  } catch (error) {
    return handleServiceError(res, error, 'Failed to assign staff to booking');
  }
};

const updateStaffRole = async (req, res) => {
  try {
    assertSelfBusiness(req);

    const data = await staffService.updateStaffRole(
      req.params.businessId,
      req.params.staffId,
      {
        role: req.body.role,
        services: req.body.services,
        canDoHomeService: req.body.canDoHomeService,
      },
    );

    return res.status(200).json({
      success: true,
      message: 'Staff role updated successfully',
      data,
    });
  } catch (error) {
    return handleServiceError(res, error, 'Failed to update staff role');
  }
};

const getStaffOnDuty = async (req, res) => {
  try {
    assertSelfBusiness(req);

    const data = await staffService.getStaffOnDuty(req.params.businessId);

    return res.status(200).json({
      success: true,
      message: 'Staff on duty fetched successfully',
      data,
    });
  } catch (error) {
    return handleServiceError(res, error, 'Failed to fetch staff on duty');
  }
};

const getAllStaff = async (req, res) => {
  try {
    assertSelfBusiness(req);

    const data = await staffService.getAllStaff(req.params.businessId, {
      status: req.query.status,
      page: req.query.page,
      limit: req.query.limit,
    });

    return res.status(200).json({
      success: true,
      message: 'Staff list fetched successfully',
      data,
    });
  } catch (error) {
    return handleServiceError(res, error, 'Failed to fetch staff list');
  }
};

const getStaffDetail = async (req, res) => {
  try {
    assertSelfBusiness(req);

    const data = await staffService.getStaffDetail(
      req.params.businessId,
      req.params.identifier,
    );

    return res.status(200).json({
      success: true,
      message: 'Staff detail fetched successfully',
      data,
    });
  } catch (error) {
    return handleServiceError(res, error, 'Failed to fetch staff detail');
  }
};

const respondToStaffInvite = async (req, res) => {
  try {
    const data = await staffService.respondToStaffInvite(
      {
        staffEmail: req.body.staffEmail,
        businessEmail: req.body.businessEmail,
        status: req.body.status,
      },
      { id: req.user.id, email: req.user.email },
    );

    return res.status(200).json({
      success: true,
      message:
        data.status === 'ACTIVE'
          ? 'Invitation accepted'
          : 'Invitation declined',
      data,
    });
  } catch (error) {
    return handleServiceError(res, error, 'Failed to respond to invitation');
  }
};

module.exports = {
  inviteStaff,
  getStaffCandidates,
  assignStaffToBooking,
  updateStaffRole,
  getStaffOnDuty,
  getAllStaff,
  getStaffDetail,
  respondToStaffInvite,
};
