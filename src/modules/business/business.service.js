const mongoose = require('mongoose');
const crypto = require('crypto');
const Business = require('./business.model');
const Product = require('../products/product.model');
const FleetInvitation = require('./fleetInvitation.model');
const businessRepository = require('./business.repository');
const notificationService = require('../../services/notification.service');
const geolocationService = require('../../services/geolocation.service');
const { sendDriverInvitationEmail } = require('../../config/emailVerification');
const {
  notifyKycCompleted,
} = require('../../services/adminNotification.service');
const Booking = require('../bookings/Bookings.model');
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

  // Required lazily: staff.service imports this module, so a top-level
  // require would create a circular dependency.
  const { getStaffOnDuty } = require('./staff.service');
  const staffsOnDuty = await getStaffOnDuty(business._id);

  return { ...business.toObject(), staffsOnDuty };
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

  if (businessPhotos !== undefined) {
    if (!Array.isArray(businessPhotos)) {
      throw new ValidationError('businessPhotos must be an array');
    }

    businessPhotos.forEach((photoUrl, index) => {
      if (!isValidUrl(photoUrl)) {
        throw new ValidationError(`businessPhotos[${index}] must be a valid URL`);
      }
    });
  }

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

// Validates a latitude/longitude pair and returns the $set fields for the
// business's GeoJSON location.
const buildLocationUpdates = (latitude, longitude) => {
  const parsedLatitude = Number(latitude);
  const parsedLongitude = Number(longitude);
  if (
    latitude === null ||
    latitude === undefined ||
    latitude === '' ||
    longitude === null ||
    longitude === undefined ||
    longitude === '' ||
    !Number.isFinite(parsedLatitude) ||
    parsedLatitude < -90 ||
    parsedLatitude > 90 ||
    !Number.isFinite(parsedLongitude) ||
    parsedLongitude < -180 ||
    parsedLongitude > 180
  ) {
    throw new ValidationError(
      'latitude and longitude must be valid coordinates',
    );
  }
  return {
    'currentLocation.type': 'Point',
    'currentLocation.coordinates': [parsedLongitude, parsedLatitude],
    lastLocationUpdate: new Date(),
  };
};

// 8. Update business identity and nearby-search location.
const updateBusinessProfile = async (businessId, payload = {}) => {
  const {
    businessName,
    cityOfOperation,
    businessAddress,
    latitude,
    longitude,
  } = payload;

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
  if (typeof businessAddress === 'string') {
    updates['currentLocation.address'] = businessAddress.trim();
  }
  if (latitude !== undefined || longitude !== undefined) {
    Object.assign(updates, buildLocationUpdates(latitude, longitude));
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
    businessName: updated.BusinessName,
    cityOfOperation: updated.cityOfOperation,
    businessAddress: updated.BusinessAddress,
    currentLocation: updated.currentLocation,
    lastLocationUpdate: updated.lastLocationUpdate,
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

// 17. Toggle whether the business accepts fast bookings.
const setBusinessAvailability = async (businessId, payload = {}) => {
  const { isAvailable } = payload;

  if (typeof isAvailable !== 'boolean') {
    throw new ValidationError('isAvailable must be a boolean');
  }

  const now = new Date();
  const updates = {
    'availability.isAvailable': isAvailable,
    'availability.lastUpdated': now,
  };
  // Going available is a sign of life; going unavailable leaves presence alone.
  if (isAvailable) {
    updates.isOnline = true;
    updates.lastSeenAt = now;
  }

  const business = await requireActiveBusiness(businessId);
  // Turning availability off is always allowed; turning it on needs KYC.
  if (isAvailable && !business.kycVerified) {
    throw new ForbiddenError(
      'KYC must be verified before turning on availability',
    );
  }

  const updated = await businessRepository.saveBusinessDetails(
    businessId,
    updates,
  );

  return {
    availability: updated.availability,
    isOnline: updated.isOnline,
    lastSeenAt: updated.lastSeenAt,
  };
};

// Parses "09:00", "9:00", "9am", "6:30 PM" into minutes since midnight.
const parseClockMinutes = (value) => {
  const match = String(value || '')
    .trim()
    .match(/^(\d{1,2})(?::(\d{2}))?\s*([ap])?\.?\s*m?\.?$/i);
  if (!match) return null;

  let hours = Number(match[1]);
  const minutes = Number(match[2] || 0);
  const meridiem = match[3]?.toLowerCase();
  if (minutes > 59) return null;
  if (meridiem) {
    if (hours < 1 || hours > 12) return null;
    hours = (hours % 12) + (meridiem === 'p' ? 12 : 0);
  } else if (hours > 23) {
    return null;
  }
  return hours * 60 + minutes;
};

const getLocalDayAndMinutes = (now, timeZone) => {
  const format = (zone) =>
    new Intl.DateTimeFormat('en-US', {
      timeZone: zone,
      weekday: 'long',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(now);
  let parts;
  try {
    parts = format(timeZone || 'Africa/Lagos');
  } catch {
    parts = format('Africa/Lagos');
  }
  const part = (type) => parts.find((p) => p.type === type)?.value;
  return {
    weekday: part('weekday').toLowerCase(),
    minutes: Number(part('hour')) * 60 + Number(part('minute')),
  };
};

// Whether the business is open right now in its own timezone. Missing or
// unparseable days/hours never exclude a business — they are free-text today.
// Overnight hours (e.g. 20:00–02:00) are supported; the day check uses the
// current local day.
const isWithinBusinessHours = (business = {}, now = new Date()) => {
  const { weekday, minutes } = getLocalDayAndMinutes(now, business.timezone);

  const days = (business.availableDays || [])
    .map((day) => String(day).trim().toLowerCase())
    .filter(Boolean);
  if (
    days.length &&
    !days.some((day) => day === weekday || day === weekday.slice(0, 3))
  ) {
    return false;
  }

  const start = parseClockMinutes(business.businessHours?.start);
  const end = parseClockMinutes(business.businessHours?.end);
  if (start === null || end === null || start === end) return true;

  return start < end
    ? minutes >= start && minutes < end
    : minutes >= start || minutes < end;
};

// 18. Location heartbeat — called regularly by the business app. Doubles as
// the presence signal used by nearby search. Mirrors PUT /provider/location:
// KYC-gated, and resolves a human-readable address (never null).
const updateBusinessLocation = async (businessId, payload = {}) => {
  const { latitude, longitude, address } = payload;

  const updates = buildLocationUpdates(latitude, longitude);
  updates.isOnline = true;
  updates.lastSeenAt = updates.lastLocationUpdate;

  const business = await requireActiveBusiness(businessId);
  if (!business.kycVerified) {
    throw new ForbiddenError('KYC verification required to update location');
  }

  const [parsedLongitude, parsedLatitude] =
    updates['currentLocation.coordinates'];
  updates['currentLocation.address'] =
    await geolocationService.resolveLocationAddress({
      latitude: parsedLatitude,
      longitude: parsedLongitude,
      providedAddress: address,
      existingLocation: business.currentLocation,
    });

  const updated = await businessRepository.saveBusinessDetails(
    businessId,
    updates,
  );

  return {
    currentLocation: updated.currentLocation,
    lastLocationUpdate: updated.lastLocationUpdate,
    isOnline: updated.isOnline,
    lastSeenAt: updated.lastSeenAt,
  };
};

// 19. Bookings belonging to the business, newest first. Mirrors
// GET /provider/bookings: optional `status` filter, plus `businessStatus`
// for the business-facing lifecycle, and a derived `pricing` block.
const getBookingsForBusiness = async (
  businessId,
  { status, businessStatus, skip = 0, limit = 10 } = {},
) => {
  await requireActiveBusiness(businessId);

  const query = { businessId };
  if (status) query.status = status;
  if (businessStatus) query.businessStatus = businessStatus;

  const [bookings, total] = await Promise.all([
    Booking.find(query)
      .populate('userId', 'fullName profilePicture phoneNumber email')
      .populate(
        'businessId',
        'fullName profilePicture phoneNumber email currentLocation lastLocationUpdate',
      )
      .populate(
        'providerId',
        'fullName profilePicture phoneNumber email currentLocation lastLocationUpdate',
      )
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Booking.countDocuments(query),
  ]);

  const bookingsWithPricing = bookings.map((booking) => ({
    ...booking,
    pricing: {
      riderPays:
        booking.calculatedPrice ??
        booking.agreedPrice ??
        booking.totalAmount ??
        booking.budget ??
        null,
      driverReceives: booking.driverReceives ?? null,
      platformEarns: booking.platformEarns ?? null,
      breakdown: booking.pricingBreakdown ?? null,
      meta: booking.pricingMeta ?? null,
    },
  }));

  return { bookings: bookingsWithPricing, total };
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
  setBusinessAvailability,
  updateBusinessLocation,
  isWithinBusinessHours,
  getBookingsForBusiness,

  ValidationError,
  NotFoundError,
  ConflictError,
  ForbiddenError,
};

const acceptBooking = async (businessId, bookingIdInput, ...rest) => {
  let bookingId = bookingIdInput;
  let reason;
  if (bookingIdInput && typeof bookingIdInput === 'object') {
    bookingId = bookingIdInput.bookingId || bookingIdInput.id || bookingIdInput._id || bookingIdInput.booking;
    reason = bookingIdInput.reason;
  }
  if (rest && rest.length && reason === undefined) reason = rest[0];
  if (!mongoose.isValidObjectId(businessId)) throw new ValidationError('Invalid business ID');
  if (!mongoose.isValidObjectId(bookingId)) throw new ValidationError('Invalid booking ID');
  await requireActiveBusiness(businessId);
  const booking = await Booking.findOne({ _id: bookingId, businessId });
  if (!booking) throw new NotFoundError('Booking not found');
  if (!['awaiting_provider_acceptance','pending_providers'].includes(booking.status)) throw new ConflictError('Booking is no longer available');
  const acceptedAt = new Date();
  booking.status = 'provider_selected';
  booking.acceptedAt = acceptedAt;
  booking.selectedAt = acceptedAt;
  booking.paymentDeadlineAt = new Date(acceptedAt.getTime() + 5*60*1000);
  booking.providerResponse = 'accepted';
  await booking.save();
  await notificationService.notifyUser(booking.userId, {
    type: 'provider_accepted',
    title: 'Business Accepted Your Booking',
    message: 'A business accepted your service booking',
    bookingId: booking._id,
    businessId,
  });
  return booking;
};

const declineBooking = async (businessId, bookingIdInput, ...rest) => {
  let bookingId = bookingIdInput;
  let reason;
  if (bookingIdInput && typeof bookingIdInput === 'object') {
    bookingId = bookingIdInput.bookingId || bookingIdInput.id || bookingIdInput._id || bookingIdInput.booking;
    reason = bookingIdInput.reason;
  }
  if (rest && rest.length && reason === undefined) reason = rest[0];
  if (rest && rest.length && typeof rest[0] === 'object' && rest[0] !== null) reason = rest[0].reason || reason;
  if (!mongoose.isValidObjectId(businessId)) throw new ValidationError('Invalid business ID');
  if (!mongoose.isValidObjectId(bookingId)) throw new ValidationError('Invalid booking ID');
  await requireActiveBusiness(businessId);
  const booking = await Booking.findOne({ _id: bookingId, businessId, status: { $in: ['awaiting_provider_acceptance','pending_providers'] } });
  if (!booking) throw new NotFoundError('Booking not found or cannot be declined');
  if (booking.providerId && String(booking.providerId) === String(businessId)) booking.providerId = undefined;
  booking.providerResponse = 'declined';
  await booking.save();
  await notificationService.notifyUser(booking.userId, {
    type: 'booking_declined',
    title: 'Business Declined Booking',
    message: reason && String(reason).trim() ? 'A business declined your booking: ' + String(reason).trim() : 'A business declined your booking. We will continue looking for an available provider.',
    bookingId: booking._id,
  });
  return booking;
};

Object.assign(module.exports, { acceptBooking, declineBooking, acceptBusinessBooking: acceptBooking, declineBusinessBooking: declineBooking });
