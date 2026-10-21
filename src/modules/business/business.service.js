const mongoose = require('mongoose');
const crypto = require('crypto');
const Business = require('./business.model');
const Product = require('../products/product.model');
const FleetInvitation = require('./fleetInvitation.model');
const businessRepository = require('./business.repository');
const notificationService = require('../../services/notification.service');
const { sendDriverInvitationEmail } = require('../../config/emailVerification');
const {
  notifyKycCompleted,
} = require('../../services/adminNotification.service');

const INVITE_TOKEN_EXPIRY_DAYS = Number(
  process.env.DRIVER_INVITE_EXPIRY_DAYS || 7,
);
const PLATFORM_URL = process.env.PLATFORM_URL || 'https://sabiguy.com';

class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ValidationError';
  }
}

class NotFoundError extends Error {
  constructor(message) {
    super(message);
    this.name = 'NotFoundError';
  }
}

class ConflictError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ConflictError';
  }
}

class ForbiddenError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ForbiddenError';
  }
}

const getBusinessesWithPagination = async (filters = {}, { skip, limit }) => {
  try {
    const query = { isDeleted: false, ...filters };

    const [businesses, total] = await Promise.all([
      Business.find(query)
        .select(
          '-password -refreshToken -refreshTokenExpiresAt -otp -resetOtp -resetOtpExpires -fcmToken',
        )
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Business.countDocuments(query),
    ]);

    const products = await Product.find({
      ownerType: 'business',
      owner: { $in: businesses.map((business) => business._id) },
      status: 'approved',
    }).lean();
    const productsByOwner = new Map();
    products.forEach((product) => {
      const key = String(product.owner);
      if (!productsByOwner.has(key)) productsByOwner.set(key, []);
      productsByOwner.get(key).push(product);
    });
    businesses.forEach((business) => {
      business.products = productsByOwner.get(String(business._id)) || [];
    });

    return {
      businesses,
      total,
    };
  } catch (error) {
    console.error('Error fetching businesses with pagination:', error);
    // throw new Error(`Failed to fetch businesses: ${error.message}`);
  }
};

const getBusinessById = async (businessId) => {
  if (!mongoose.isValidObjectId(businessId)) {
    throw new ValidationError('Invalid business ID');
  }

  const business = await businessRepository.findBusinessPublicById(businessId);
  if (!business || business.isDeleted) {
    throw new NotFoundError('Business not found');
  }

  const result = business.toObject ? business.toObject() : business;
  result.products = await Product.find({
    ownerType: 'business',
    owner: business._id,
    status: 'approved',
  }).lean();
  return result;
};

// 1. Invite a driver to a business/fleet.
const inviteDriver = async (businessId, { driverEmail, role } = {}) => {
  if (!driverEmail || typeof driverEmail !== 'string') {
    throw new ValidationError('driverEmail is required');
  }

  const business = await businessRepository.findBusinessById(businessId);
  if (!business || business.isDeleted) {
    throw new NotFoundError('Business not found');
  }

  // Per requirements: driverEmail must match an existing registered driver.
  const driver = await businessRepository.findDriverByEmail(driverEmail);
  if (!driver) {
    throw new NotFoundError('No registered driver found with this email');
  }
  if (driver.isDeleted || driver.isActive === false) {
    throw new ValidationError("This driver's account is not active");
  }

  if (businessRepository.isDriverLinked(business, driver._id)) {
    throw new ConflictError('Driver already belongs to this business');
  }

  const existingPending = await businessRepository.findPendingInvitation(
    businessId,
    driver._id,
  );
  if (existingPending) {
    throw new ConflictError(
      'A pending invitation already exists for this driver',
    );
  }

  const token = crypto.randomBytes(32).toString('hex');
  const tokenExpiresAt = new Date(
    Date.now() + INVITE_TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000,
  );

  const invitation = await businessRepository.createInvitation({
    business: business._id,
    driver: driver._id,
    driverEmail: driver.email,
    role: role || 'driver',
    token,
    tokenExpiresAt,
    invitedBy: business._id,
  });

  const businessName =
    business.BusinessName || business.fullName || 'the business';

  // Best-effort side effects: an invitation is still valid even if the
  // email/push happens to fail, so these don't roll back the invite.
  try {
    await sendDriverInvitationEmail(driver.email, {
      driverName: driver.fullName,
      businessName,
      inviteLink: `${PLATFORM_URL}/invitations/${invitation._id}?token=${token}`,
      expiryDays: INVITE_TOKEN_EXPIRY_DAYS,
    });
  } catch (error) {
    console.error('Driver invitation email failed:', error.message);
  }

  try {
    await notificationService.notifyProvider(driver._id, {
      type: 'driver_invitation_received',
      message: `${businessName} invited you to join their fleet as a driver`,
      businessId: business._id,
      invitationId: invitation._id,
    });
  } catch (error) {
    console.error('Driver invitation push notification failed:', error.message);
  }

  return invitation;
};

// 2. Get all drivers (invitations) belonging to a business, optionally
// filtered by status, with pagination.
const getBusinessDrivers = async (businessId, { status, skip, limit } = {}) => {
  let normalizedStatus;
  if (status) {
    normalizedStatus = String(status).toUpperCase();
    if (!FleetInvitation.INVITATION_STATUSES.includes(normalizedStatus)) {
      throw new ValidationError(
        `status must be one of: ${FleetInvitation.INVITATION_STATUSES.join(', ')}`,
      );
    }
  }

  return businessRepository.getInvitationsByBusiness(businessId, {
    status: normalizedStatus,
    skip,
    limit,
  });
};

// 3. Get all vehicles registered under a business, with pagination.
const getBusinessVehicles = (businessId, { skip, limit } = {}) =>
  businessRepository.getBusinessVehiclesPage(businessId, { skip, limit });

const getBusinessByEmail = async (email) => {
  if (!email || typeof email !== 'string') {
    throw new ValidationError('email is required');
  }

  const normalizedEmail = String(email).trim().toLowerCase();
  const business =
    await businessRepository.findBusinessByEmail(normalizedEmail);

  if (!business || business.isDeleted) {
    throw new NotFoundError('Business not found');
  }

  return business;
};

// 4. Confirm or reject a pending driver invitation.
const respondToInvitation = async (driverId, { invitationId, action } = {}) => {
  if (!invitationId || !mongoose.Types.ObjectId.isValid(invitationId)) {
    throw new ValidationError('A valid invitationId is required');
  }

  const normalizedAction = String(action || '').toUpperCase();
  if (!['ACCEPT', 'REJECT'].includes(normalizedAction)) {
    throw new ValidationError('action must be either ACCEPT or REJECT');
  }

  const invitation = await businessRepository.findInvitationById(invitationId);
  if (!invitation) {
    throw new NotFoundError('Invitation not found');
  }

  if (invitation.driver.toString() !== driverId.toString()) {
    throw new ForbiddenError('This invitation does not belong to you');
  }

  if (invitation.status !== 'PENDING') {
    throw new ConflictError(
      `This invitation has already been ${invitation.status.toLowerCase()}`,
    );
  }

  if (
    invitation.tokenExpiresAt &&
    invitation.tokenExpiresAt.getTime() < Date.now()
  ) {
    invitation.status = 'EXPIRED';
    await invitation.save();
    throw new ConflictError('This invitation has expired');
  }

  const session = await mongoose.startSession();
  try {
    session.startTransaction();

    invitation.status = normalizedAction === 'ACCEPT' ? 'ACCEPTED' : 'REJECTED';
    invitation.respondedAt = new Date();
    await invitation.save({ session });

    if (normalizedAction === 'ACCEPT') {
      await businessRepository.addDriverToBusiness(
        invitation.business,
        invitation.driver,
        session,
      );
    }

    await session.commitTransaction();
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }

  try {
    await notificationService.notifyBusiness(invitation.business, {
      type:
        normalizedAction === 'ACCEPT'
          ? 'driver_invitation_accepted'
          : 'driver_invitation_rejected',
      message: `A driver has ${normalizedAction === 'ACCEPT' ? 'accepted' : 'declined'} your fleet invitation`,
      invitationId: invitation._id,
    });
  } catch (error) {
    console.error('Business notification failed:', error.message);
  }

  return invitation;
};

const isValidUrl = (value) => {
  try {
    // eslint-disable-next-line no-new
    new URL(value);
    return true;
  } catch (err) {
    return false;
  }
};

// 5. Create the authenticated business owner's business profile.
const addBusinessDetails = async (businessId, payload) => {
  const { businessName, businessAddress, cityOfOperation, ninUrl } = payload;

  const requiredFields = {
    businessName,
    businessAddress,
    cityOfOperation,
    ninUrl,
  };

  const missingField = Object.entries(requiredFields).find(
    ([, value]) => value === undefined || value === null || value === '',
  );
  if (missingField) {
    throw new ValidationError(`${missingField[0]} is required`);
  }

  if (!isValidUrl(ninUrl)) {
    throw new ValidationError('ninUrl must be a valid URL');
  }

  const business = await businessRepository.findBusinessById(businessId);
  if (!business || business.isDeleted) {
    throw new NotFoundError('Business not found');
  }

  const alreadyOnboarded = Boolean(
    business.BusinessName || business.regNumber || business.cacFile,
  );
  if (alreadyOnboarded) {
    throw new ConflictError('Business profile already exists for this user');
  }

  const updated = await businessRepository.saveBusinessDetails(businessId, {
    BusinessName: businessName,
    BusinessAddress: businessAddress,
    cityOfOperation,
    ninSlip: ninUrl,
    kycLevel: Math.max(business.kycLevel || 0, 2),
  });
  await notifyKycCompleted('business', updated, business.kycCompleted);

  return {
    businessName: updated.BusinessName,
    businessAddress: updated.BusinessAddress,
    cityOfOperation: updated.cityOfOperation,
    ninUrl: updated.ninSlip,
  };
};

// 6. Submit business verification documents and photos.
const addBusinessVerification = async (businessId, payload) => {
  const { cacCertificateUrl, profilePhotoUrl, businessPhotos } = payload;

  const requiredFields = {
    cacCertificateUrl,
    profilePhotoUrl,
  };

  const missingField = Object.entries(requiredFields).find(
    ([, value]) => value === undefined || value === null || value === '',
  );
  if (missingField) {
    throw new ValidationError(`${missingField[0]} is required`);
  }

  if (!isValidUrl(cacCertificateUrl)) {
    throw new ValidationError('cacCertificateUrl must be a valid URL');
  }

  if (!isValidUrl(profilePhotoUrl)) {
    throw new ValidationError('profilePhotoUrl must be a valid URL');
  }

  if (!Array.isArray(businessPhotos) || businessPhotos.length === 0) {
    throw new ValidationError('businessPhotos must be a non-empty array');
  }

  (businessPhotos || []).forEach((photoUrl, index) => {
    if (!isValidUrl(photoUrl)) {
      throw new ValidationError(`businessPhotos[${index}] must be a valid URL`);
    }
  });

  const business = await businessRepository.findBusinessById(businessId);
  if (!business || business.isDeleted) {
    throw new NotFoundError('Business not found');
  }

  const verificationDetails = {
    cacFile: cacCertificateUrl,
    profilePicture: profilePhotoUrl,
    kycLevel: Math.max(business.kycLevel || 0, 3),
  };
  if (businessPhotos !== undefined) {
    verificationDetails.businessPhotos = businessPhotos;
  }

  const updated = await businessRepository.saveBusinessVerificationDetails(
    businessId,
    verificationDetails,
  );
  await notifyKycCompleted('business', updated, business.kycCompleted);

  return {
    cacCertificateUrl: updated.cacFile,
    profilePhotoUrl: updated.profilePicture,
    businessPhotos: updated.businessPhotos,
  };
};

// 7. Add or update service details for the authenticated business owner.
const addServiceDetails = async (businessId, payload = {}) => {
  const {
    businessCategory,
    service,
    availableDays,
    businessHours,
    servicePlace,
    studioImages,
  } = payload;

  if (service !== undefined && !Array.isArray(service)) {
    throw new ValidationError('service must be an array');
  }

  if (availableDays !== undefined && !Array.isArray(availableDays)) {
    throw new ValidationError('availableDays must be an array');
  }

  if (
    businessHours !== undefined &&
    (typeof businessHours !== 'object' ||
      businessHours === null ||
      Array.isArray(businessHours))
  ) {
    throw new ValidationError('businessHours must be an object');
  }

  if (servicePlace !== undefined && !Array.isArray(servicePlace)) {
    throw new ValidationError('servicePlace must be an array');
  }

  if (studioImages !== undefined && !Array.isArray(studioImages)) {
    throw new ValidationError('studioImages must be an array');
  }

  const business = await businessRepository.findBusinessById(businessId);
  if (!business || business.isDeleted) {
    throw new NotFoundError('Business not found');
  }

  const details = {};
  if (service !== undefined) {
    service.forEach((item, index) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) {
        throw new ValidationError(
          `service[${index}] must be an object with a serviceName`,
        );
      }
    });
    details.service = service.map((item = {}) => ({
      serviceName: item.serviceName,
      duration: item.duration,
      pricingModel: {
        walk_in: item.pricingModel?.walk_in,
        provider_address: item.pricingModel?.provider_address,
        customer_address: item.pricingModel?.customer_address,
      },
      fixedPrice: item.fixedPrice,
      pricingModel: {
        walk_in: item.pricingModel?.walk_in,
        provider_address: item.pricingModel?.provider_address,
        customer_address: item.pricingModel?.customer_address,
      },
      fixedPrice: item.fixedPrice,
    }));
  }
  if (availableDays !== undefined) details.availableDays = availableDays;
  if (businessHours !== undefined) {
    details.businessHours = {
      start: businessHours.start,
      end: businessHours.end,
    };
  }

  if (businessCategory !== undefined)
    details.businessCategory = businessCategory;
  if (servicePlace !== undefined) details.servicePlace = servicePlace;
  if (studioImages !== undefined) {
    details.studioImages = studioImages.map((item = {}) => ({
      pictures: Array.isArray(item.pictures) ? item.pictures : [],
      videos: Array.isArray(item.videos) ? item.videos : [],
    }));
  }

  const updated = await businessRepository.saveBusinessServiceDetails(
    businessId,
    details,
    {
      kycCompleted: true,
      kycLevel: Math.max(business.kycLevel || 0, 4),
    },
  );
  await notifyKycCompleted('business', updated, business.kycCompleted);

  return {
    service: updated.service,
    availableDays: updated.availableDays,
    businessHours: updated.businessHours,
    servicePlace: updated.servicePlace,
    studioImages: updated.studioImages,
    businessCategory: updated.businessCategory,
  };
};
// 7. Add one or more vehicles for the authenticated business owner.
const addVehicleDetails = async (businessId, vehicles) => {
  if (!Array.isArray(vehicles) || vehicles.length === 0) {
    throw new ValidationError('vehicles must be a non-empty array');
  }

  const business = await businessRepository.findBusinessById(businessId);
  if (!business || business.isDeleted) {
    throw new NotFoundError('Business not found');
  }

  const existingPlateNumbers = new Set(
    business.vehicles.map((vehicle) => vehicle.plateNumber),
  );
  const incomingPlateNumbers = new Set();
  const newVehicles = [];

  vehicles.forEach((vehicle, index) => {
    const { vehicleName, plateNumber, vehicleType, vehiclePictureUrl } =
      vehicle;

    const requiredFields = {
      vehicleName,
      plateNumber,
      vehicleType,
      vehiclePictureUrl,
    };
    const missingField = Object.entries(requiredFields).find(
      ([, value]) => value === undefined || value === null || value === '',
    );
    if (missingField) {
      throw new ValidationError(
        `vehicles[${index}].${missingField[0]} is required`,
      );
    }

    if (!isValidUrl(vehiclePictureUrl)) {
      throw new ValidationError(
        `vehicles[${index}].vehiclePictureUrl must be a valid URL`,
      );
    }

    if (
      existingPlateNumbers.has(plateNumber) ||
      incomingPlateNumbers.has(plateNumber)
    ) {
      throw new ConflictError(`Duplicate plate number: ${plateNumber}`);
    }

    incomingPlateNumbers.add(plateNumber);
    newVehicles.push({
      name: vehicleName,
      plateNumber,
      type: vehicleType,
      image: vehiclePictureUrl,
    });
  });

  const updated = await businessRepository.addVehiclesToBusiness(
    businessId,
    newVehicles,
    {
      kycCompleted: true,
      kycLevel: Math.max(business.kycLevel || 0, 4),
    },
  );
  await notifyKycCompleted('business', updated, business.kycCompleted);

  const createdVehicles = updated.vehicles
    .slice(-newVehicles.length)
    .map((vehicle) => ({
      vehicleName: vehicle.name,
      plateNumber: vehicle.plateNumber,
      vehicleType: vehicle.type,
      vehiclePictureUrl: vehicle.image,
    }));

  return createdVehicles;
};

const requireActiveBusiness = async (businessId) => {
  const business = await businessRepository.findBusinessById(businessId);
  if (!business || business.isDeleted) {
    throw new NotFoundError('Business not found');
  }
  return business;
};

const NON_EMPTY_FIELDS = new Set(['businessName', 'bankName', 'accountName']);

const applyStringField = (key, label, value, updates) => {
  if (value === undefined) return;
  if (typeof value !== 'string' || value.trim() === '') {
    if (NON_EMPTY_FIELDS.has(label)) {
      throw new ValidationError(`${label} must be a non-empty string`);
    }
    if (value === null) {
      updates[key] = undefined;
      return;
    }
    throw new ValidationError(`${label} must be a string`);
  }
  updates[key] = value.trim();
};

const isWeekday = (value) =>
  [
    'Monday',
    'Tuesday',
    'Wednesday',
    'Thursday',
    'Friday',
    'Saturday',
    'Sunday',
  ].includes(value);

// 8. Update the business profile identity fields (name, city, address).
const updateBusinessProfile = async (businessId, payload = {}) => {
  const { businessName, cityOfOperation, businessAddress } = payload;

  const updates = {};
  applyStringField('BusinessName', 'businessName', businessName, updates);
  applyStringField(
    'cityOfOperation',
    'cityOfOperation',
    cityOfOperation,
    updates,
  );
  applyStringField(
    'BusinessAddress',
    'businessAddress',
    businessAddress,
    updates,
  );

  if (Object.keys(updates).length === 0) {
    throw new ValidationError('No valid fields provided for update');
  }

  await requireActiveBusiness(businessId);

  const updated = await businessRepository.saveBusinessDetails(
    businessId,
    updates,
  );

  return {
    businessName: updated.BusinessName,
    cityOfOperation: updated.cityOfOperation,
    businessAddress: updated.BusinessAddress,
  };
};

// 9. Update business operating defaults (currency, timezone, week start).
const updateBusinessOperatingDefaults = async (businessId, payload = {}) => {
  const { currency, timezone, weekStarts } = payload;

  const updates = {};
  applyStringField('currency', 'currency', currency, updates);
  applyStringField('timezone', 'timezone', timezone, updates);
  if (weekStarts !== undefined) {
    if (typeof weekStarts !== 'string' || !isWeekday(weekStarts.trim())) {
      throw new ValidationError('weekStarts must be a weekday name');
    }
    updates.weekStarts = weekStarts.trim();
  }

  if (Object.keys(updates).length === 0) {
    throw new ValidationError('No valid fields provided for update');
  }

  await requireActiveBusiness(businessId);

  const updated = await businessRepository.saveBusinessDetails(
    businessId,
    updates,
  );

  return {
    currency: updated.currency,
    timezone: updated.timezone,
    weekStarts: updated.weekStarts,
  };
};

// 10. Update the business payout (company bank) account.
const updateBusinessPayoutAccount = async (businessId, payload = {}) => {
  const { bankName, bankCode, accountNumber, accountName, taxId } = payload;

  const updates = {};
  applyStringField('payoutAccount.bankName', 'bankName', bankName, updates);
  applyStringField('payoutAccount.bankCode', 'bankCode', bankCode, updates);
  applyStringField(
    'payoutAccount.accountName',
    'accountName',
    accountName,
    updates,
  );
  applyStringField('payoutAccount.taxId', 'taxId', taxId, updates);
  if (accountNumber !== undefined) {
    if (
      typeof accountNumber !== 'string' ||
      !/^\d{9,17}$/.test(accountNumber.trim())
    ) {
      throw new ValidationError(
        'accountNumber must be a valid bank account number',
      );
    }
    updates['payoutAccount.accountNumber'] = accountNumber.trim();
  }

  if (Object.keys(updates).length === 0) {
    throw new ValidationError('No valid fields provided for update');
  }

  await requireActiveBusiness(businessId);

  const updated = await businessRepository.saveBusinessDetails(
    businessId,
    updates,
  );

  return {
    bankName: updated.payoutAccount?.bankName,
    bankCode: updated.payoutAccount?.bankCode,
    accountNumber: updated.payoutAccount?.accountNumber,
    accountName: updated.payoutAccount?.accountName,
    taxId: updated.payoutAccount?.taxId,
    verified: updated.payoutAccount?.verified ?? false,
  };
};

// 11. Update the business default payout schedule.
const updateBusinessPayoutSchedule = async (businessId, payload = {}) => {
  const { automatic, day, minimumThreshold } = payload;

  const updates = {};
  if (automatic !== undefined) {
    if (typeof automatic !== 'boolean') {
      throw new ValidationError('automatic must be a boolean');
    }
    updates['payoutSchedule.automatic'] = automatic;
  }
  if (day !== undefined) {
    if (typeof day !== 'string' || !isWeekday(day.trim())) {
      throw new ValidationError('day must be a weekday name');
    }
    updates['payoutSchedule.day'] = day.trim();
  }
  if (minimumThreshold !== undefined) {
    if (
      typeof minimumThreshold !== 'number' ||
      !Number.isFinite(minimumThreshold) ||
      minimumThreshold < 0
    ) {
      throw new ValidationError(
        'minimumThreshold must be a non-negative number',
      );
    }
    updates['payoutSchedule.minimumThreshold'] = minimumThreshold;
  }

  if (Object.keys(updates).length === 0) {
    throw new ValidationError('No valid fields provided for update');
  }

  await requireActiveBusiness(businessId);

  const updated = await businessRepository.saveBusinessDetails(
    businessId,
    updates,
  );

  return {
    automatic: updated.payoutSchedule?.automatic ?? false,
    day: updated.payoutSchedule?.day,
    minimumThreshold: updated.payoutSchedule?.minimumThreshold,
  };
};

// 12. Update only the business service catalog (service[]).
const updateBusinessServices = async (businessId, payload = {}) => {
  const { service } = payload;

  if (!Array.isArray(service)) {
    throw new ValidationError('service must be an array');
  }
  service.forEach((item, index) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      throw new ValidationError(
        `service[${index}] must be an object with a serviceName`,
      );
    }
  });

  await requireActiveBusiness(businessId);

  const updates = {
    service: service.map((item = {}) => ({
      serviceName: item.serviceName,
      duration: item.duration,
      pricingModel: {
        walk_in: item.pricingModel?.walk_in,
        provider_address: item.pricingModel?.provider_address,
        customer_address: item.pricingModel?.customer_address,
      },
      fixedPrice: item.fixedPrice,
    })),
  };

  const updated = await businessRepository.saveBusinessDetails(
    businessId,
    updates,
  );

  return { service: updated.service };
};

const toStringArray = (name, value) => {
  if (!Array.isArray(value)) {
    throw new ValidationError(`${name} must be an array`);
  }
  value.forEach((item, index) => {
    if (typeof item !== 'string' || item.trim() === '') {
      throw new ValidationError(`${name}[${index}] must be a non-empty string`);
    }
  });
  return value.map((item) => item.trim());
};

// 13. Update only the days the business operates (availableDays[]).
const updateBusinessAvailableDays = async (businessId, payload = {}) => {
  const { availableDays } = payload;

  const updates = {
    availableDays: toStringArray('availableDays', availableDays),
  };

  await requireActiveBusiness(businessId);

  const updated = await businessRepository.saveBusinessDetails(
    businessId,
    updates,
  );

  return { availableDays: updated.availableDays };
};

// 14. Update only the business service places (servicePlace[]).
const updateBusinessServicePlace = async (businessId, payload = {}) => {
  const { servicePlace } = payload;

  const updates = { servicePlace: toStringArray('servicePlace', servicePlace) };

  await requireActiveBusiness(businessId);

  const updated = await businessRepository.saveBusinessDetails(
    businessId,
    updates,
  );

  return { servicePlace: updated.servicePlace };
};

// 15. Update the business opening hours (start / end), partial-friendly.
const updateBusinessHours = async (businessId, payload = {}) => {
  const { start, end } = payload;

  const updates = {};
  applyStringField('businessHours.start', 'start', start, updates);
  applyStringField('businessHours.end', 'end', end, updates);

  if (Object.keys(updates).length === 0) {
    throw new ValidationError('No valid fields provided for update');
  }

  await requireActiveBusiness(businessId);

  const updated = await businessRepository.saveBusinessDetails(
    businessId,
    updates,
  );

  return { businessHours: updated.businessHours };
};

// 16. Update only the studio gallery (studioImages[] of pictures/videos).
const updateBusinessStudioImages = async (businessId, payload = {}) => {
  const { studioImages } = payload;

  if (!Array.isArray(studioImages)) {
    throw new ValidationError('studioImages must be an array');
  }
  studioImages.forEach((item, index) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      throw new ValidationError(`studioImages[${index}] must be an object`);
    }
  });

  const updates = {
    studioImages: studioImages.map((item = {}) => ({
      pictures: Array.isArray(item.pictures) ? item.pictures : [],
      videos: Array.isArray(item.videos) ? item.videos : [],
    })),
  };

  await requireActiveBusiness(businessId);

  const updated = await businessRepository.saveBusinessDetails(
    businessId,
    updates,
  );

  return { studioImages: updated.studioImages };
};

module.exports = {
  getBusinessesWithPagination,
  getBusinessById,
  inviteDriver,
  getBusinessDrivers,
  getBusinessVehicles,
  getBusinessByEmail,
  addBusinessDetails,
  addBusinessVerification,
  addVehicleDetails,
  addServiceDetails,
  respondToInvitation,
  updateBusinessProfile,
  updateBusinessOperatingDefaults,
  updateBusinessPayoutAccount,
  updateBusinessPayoutSchedule,
  updateBusinessServices,
  updateBusinessAvailableDays,
  updateBusinessServicePlace,
  updateBusinessHours,
  updateBusinessStudioImages,

  ValidationError,
  NotFoundError,
  ConflictError,
  ForbiddenError,
};
