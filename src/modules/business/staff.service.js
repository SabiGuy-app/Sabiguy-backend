const mongoose = require('mongoose');
const crypto = require('crypto');
const Staff = require('./staff.model');
const Booking = require('../bookings/Bookings.model');
const businessRepository = require('./business.repository');
const Provider = require('../../../models/ServiceProvider');
const notificationService = require('../../services/notification.service');
const geolocationService = require('../../services/geolocation.service');
const {
  ValidationError,
  NotFoundError,
  ConflictError,
  ForbiddenError,
} = require('./business.service');
const { sendStaffInvitationEmail } = require('../../config/emailVerification');

const STAFF_INVITE_EXPIRY_DAYS = Number(
  process.env.STAFF_INVITE_EXPIRY_DAYS || 7,
);
const STAFF_ETA_AVG_SPEED_KMH = Number(
  process.env.STAFF_ETA_AVG_SPEED_KMH || 15,
);
const PLATFORM_URL = process.env.PLATFORM_URL || 'https://sabiguy.com';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const normalizeEmail = (email) => String(email).trim().toLowerCase();

// Resolves requested service names against the business's own service
// catalog (case-insensitive) and returns the canonical catalog names.
const matchServicesToCatalog = (requestedServices, catalogServices = []) => {
  if (!Array.isArray(requestedServices) || requestedServices.length === 0) {
    throw new ValidationError('services must be a non-empty array');
  }

  const catalogNames = catalogServices
    .map((entry) =>
      typeof entry?.serviceName === 'string' ? entry.serviceName.trim() : '',
    )
    .filter(Boolean);

  const matched = [];
  for (const requested of requestedServices) {
    if (typeof requested !== 'string' || !requested.trim()) {
      throw new ValidationError('each service must be a non-empty string');
    }
    const needle = requested.trim().toLowerCase();
    const canonical = catalogNames.find(
      (name) => name.toLowerCase() === needle,
    );
    if (!canonical) {
      throw new ValidationError(
        `Unknown service: "${requested.trim()}". Available services: ${catalogNames.join(
          ', ',
        )}`,
      );
    }
    if (!matched.includes(canonical)) matched.push(canonical);
  }

  return matched;
};

const inviteStaff = async (businessId, payload = {}) => {
  if (!mongoose.isValidObjectId(businessId)) {
    throw new ValidationError('Invalid business ID');
  }

  const { email, role, services, canDoHomeService } = payload;

  if (
    !email ||
    typeof email !== 'string' ||
    !EMAIL_PATTERN.test(email.trim())
  ) {
    throw new ValidationError('A valid email is required');
  }
  if (!role || typeof role !== 'string' || !role.trim()) {
    throw new ValidationError('role is required');
  }

  const normalizedEmail = normalizeEmail(email);

  const business = await businessRepository.findBusinessById(businessId);
  if (!business || business.isDeleted) {
    throw new NotFoundError('Business not found');
  }
  if (business.isActive === false) {
    throw new ConflictError('Business account is not active');
  }

  const matchedServices = matchServicesToCatalog(services, business.service);
  const existing = await Staff.findOne({
    business: businessId,
    email: normalizedEmail,
    status: { $in: ['INVITED', 'ACTIVE'] },
  });
  if (existing) {
    throw new ConflictError(
      existing.status === 'ACTIVE'
        ? 'This person is already staff at your business'
        : 'A pending invitation already exists for this email',
    );
  }

  const token = crypto.randomBytes(32).toString('hex');
  const inviteExpiresAt = new Date(
    Date.now() + STAFF_INVITE_EXPIRY_DAYS * 24 * 60 * 60 * 1000,
  );

  const staff = await Staff.create({
    business: business._id,
    email: normalizedEmail,
    role: role.trim(),
    services: matchedServices,
    canDoHomeService: Boolean(canDoHomeService),
    status: 'INVITED',
    invitedBy: business._id,
    inviteToken: token,
    inviteExpiresAt,
  });

  // Keep the business attribution on an existing provider profile so it is
  // returned by both auth/me and user lookup by email. New providers receive
  // the same field when they accept the invitation below.
  await Provider.updateOne(
    { email: normalizedEmail },
    { $set: { invitedBy: business._id } },
  );

  const businessName =
    business.BusinessName || business.fullName || 'the business';

  try {
    await sendStaffInvitationEmail(normalizedEmail, {
      businessName,
      role: staff.role,
      services: staff.services,
      inviteLink: `${PLATFORM_URL}/business/${business._id}/invitations/${token}`,
      expiryDays: STAFF_INVITE_EXPIRY_DAYS,
    });
  } catch (error) {
    console.error('Staff invitation email failed:', error.message);
    await Staff.deleteOne({ _id: staff._id });
    throw new Error('Failed to send invitation email');
  }

  return staff;
};

const INELIGIBLE = {
  ALREADY_ASSIGNED: 'already_assigned',
  DOES_NOT_DO_SERVICE: 'does_not_do_service',
  OFF_DUTY: 'off_duty',
};

const normalizeServiceName = (name) =>
  typeof name === 'string' ? name.trim().toLowerCase() : '';

// Precedence: already assigned > doesn't do the service > off duty.
const evaluateStaffEligibility = (
  staff,
  { serviceName, alreadyAssigned = false, requireOnDuty = true } = {},
) => {
  if (alreadyAssigned) {
    return { eligible: false, reason: INELIGIBLE.ALREADY_ASSIGNED };
  }

  const wanted = normalizeServiceName(serviceName);
  const offersService =
    wanted !== '' &&
    Array.isArray(staff.services) &&
    staff.services.some((s) => normalizeServiceName(s) === wanted);
  if (!offersService) {
    return { eligible: false, reason: INELIGIBLE.DOES_NOT_DO_SERVICE };
  }

  if (requireOnDuty && !(staff.onDuty && staff.onDuty.active)) {
    return { eligible: false, reason: INELIGIBLE.OFF_DUTY };
  }

  return { eligible: true, reason: null };
};

// GeoJSON stores [lng, lat]; convert to the {lat, lng} the distance helper wants.
const coordsToLatLng = (coords) =>
  Array.isArray(coords) && coords.length === 2
    ? { lat: coords[1], lng: coords[0] }
    : null;

const computeDistanceAndEta = (bookingCoords, providerCoords) => {
  const booking = coordsToLatLng(bookingCoords);
  const provider = coordsToLatLng(providerCoords);
  if (!booking || !provider) {
    return { distanceKm: null, etaMinutes: null };
  }
  const rawKm = geolocationService.calculateDistance(
    booking.lat,
    booking.lng,
    provider.lat,
    provider.lng,
  );
  const distanceKm = Math.round(rawKm * 10) / 10;
  const etaMinutes = Math.ceil((distanceKm / STAFF_ETA_AVG_SPEED_KMH) * 60);
  return { distanceKm, etaMinutes };
};

const bookingServiceName = (booking) =>
  booking?.serviceDetails?.serviceName || booking?.serviceType || '';

const assertBookingOwnership = (booking, businessId) => {
  if (
    !booking.businessId ||
    String(booking.businessId) !== String(businessId)
  ) {
    throw new ForbiddenError('Booking does not belong to your business');
  }
};

// Lists the business's active staff,
// annotated with eligibility, distance and ETA so the front-end renders rows.
const getStaffCandidates = async (businessId, bookingId) => {
  if (!mongoose.isValidObjectId(bookingId)) {
    throw new ValidationError('Invalid booking ID');
  }

  const booking = await Booking.findById(bookingId).select(
    'businessId serviceType serviceDetails location assignedStaff',
  );
  if (!booking) {
    throw new NotFoundError('Booking not found');
  }
  assertBookingOwnership(booking, businessId);

  const serviceName = bookingServiceName(booking);
  const staffList = await Staff.find({
    business: businessId,
    status: 'ACTIVE',
  }).populate(
    'provider',
    'fullName profilePicture rating.average currentLocation',
  );

  const assignedStaffIds = new Set(
    (booking.assignedStaff || []).map((a) => String(a.staff)),
  );

  const candidates = staffList
    .filter((staff) => staff.provider)
    .map((staff) => {
      const alreadyAssigned = assignedStaffIds.has(String(staff._id));
      const { eligible, reason } = evaluateStaffEligibility(staff, {
        serviceName,
        alreadyAssigned,
      });
      const { distanceKm, etaMinutes } = computeDistanceAndEta(
        booking.location?.coordinates?.coordinates,
        staff.provider?.currentLocation?.coordinates,
      );

      return {
        staffId: staff._id,
        staffCode: staff.staffCode,
        name: staff.provider.fullName,
        avatar: staff.provider.profilePicture,
        role: staff.role,
        rating: staff.provider.rating?.average ?? null,
        onDuty: Boolean(staff.onDuty && staff.onDuty.active),
        distanceKm,
        etaMinutes,
        eligible,
        reason,
      };
    })
    .sort((a, b) => {
      if (a.eligible !== b.eligible) return a.eligible ? -1 : 1;
      if (a.distanceKm == null) return 1;
      if (b.distanceKm == null) return -1;
      return a.distanceKm - b.distanceKm;
    });

  return {
    bookingId: booking._id,
    serviceName,
    assignedStaffIds: [...assignedStaffIds],
    candidates,
  };
};

// Updates role / services / home-service capability for an existing staff
// member (ACTIVE or INVITED). Partial: only supplied fields are changed.
const EDITABLE_STAFF_STATUSES = ['ACTIVE', 'INVITED'];

const updateStaffRole = async (businessId, staffId, payload = {}) => {
  if (!mongoose.isValidObjectId(businessId)) {
    throw new ValidationError('Invalid business ID');
  }
  if (!mongoose.isValidObjectId(staffId)) {
    throw new ValidationError('Invalid staff ID');
  }

  const { role, services, canDoHomeService } = payload;

  const updates = {};

  if (role !== undefined) {
    if (typeof role !== 'string' || !role.trim()) {
      throw new ValidationError('role must be a non-empty string');
    }
    updates.role = role.trim();
  }

  if (canDoHomeService !== undefined) {
    if (typeof canDoHomeService !== 'boolean') {
      throw new ValidationError('canDoHomeService must be a boolean');
    }
    updates.canDoHomeService = canDoHomeService;
  }

  if (services !== undefined && !Array.isArray(services)) {
    throw new ValidationError('services must be an array');
  }

  if (
    role === undefined &&
    services === undefined &&
    canDoHomeService === undefined
  ) {
    throw new ValidationError('No valid fields provided for update');
  }

  const staff = await Staff.findOne({ _id: staffId, business: businessId });
  if (!staff) {
    throw new NotFoundError('Staff not found in your business');
  }
  if (!EDITABLE_STAFF_STATUSES.includes(staff.status)) {
    throw new ConflictError(
      `Cannot update a staff member who is ${staff.status.toLowerCase()}`,
    );
  }

  if (services !== undefined) {
    const business = await businessRepository.findBusinessById(businessId);
    if (!business || business.isDeleted) {
      throw new NotFoundError('Business not found');
    }
    updates.services = matchServicesToCatalog(services, business.service);
  }

  const updated = await Staff.findByIdAndUpdate(
    staff._id,
    { $set: updates },
    { new: true, runValidators: true },
  );

  return {
    staffId: updated._id,
    email: updated.email,
    role: updated.role,
    services: updated.services,
    canDoHomeService: updated.canDoHomeService,
    status: updated.status,
  };
};

// Assigns one more eligible staff member to a booking (additive).
const assignStaffToBooking = async (businessId, bookingId, staffId) => {
  if (!mongoose.isValidObjectId(bookingId)) {
    throw new ValidationError('Invalid booking ID');
  }
  if (!mongoose.isValidObjectId(staffId)) {
    throw new ValidationError('Invalid staff ID');
  }

  const booking = await Booking.findById(bookingId).select(
    'userId businessId serviceType serviceDetails assignedStaff businessStatus',
  );
  if (!booking) {
    throw new NotFoundError('Booking not found');
  }
  assertBookingOwnership(booking, businessId);

  const staff = await Staff.findOne({
    _id: staffId,
    business: businessId,
    status: 'ACTIVE',
  });
  if (!staff) {
    throw new NotFoundError('Staff not found in your business');
  }
  if (!staff.provider) {
    throw new ConflictError('Staff is not linked to a provider account yet');
  }

  const serviceName = bookingServiceName(booking);
  const assignedStaffIds = new Set(
    (booking.assignedStaff || []).map((a) => String(a.staff)),
  );

  const { eligible, reason } = evaluateStaffEligibility(staff, {
    serviceName,
    alreadyAssigned: assignedStaffIds.has(String(staff._id)),
  });
  if (!eligible) {
    if (reason === INELIGIBLE.ALREADY_ASSIGNED) {
      throw new ConflictError('This staff member is already assigned');
    }
    if (reason === INELIGIBLE.DOES_NOT_DO_SERVICE) {
      throw new ValidationError(
        `This staff member does not provide ${serviceName || 'this service'}`,
      );
    }
    if (reason === INELIGIBLE.OFF_DUTY) {
      throw new ConflictError('This staff member is off duty');
    }
  }

  booking.assignedStaff.push({
    staff: staff._id,
    provider: staff.provider._id ?? staff.provider,
    assignedAt: new Date(),
  });
  if (
    booking.businessStatus === 'needs_staff' ||
    booking.businessStatus == null
  ) {
    booking.businessStatus = 'assigned';
  }
  await booking.save();

  // Reflect the new assignment on the staff member's working state.
  if (staff.workStatus !== 'in_service') {
    staff.workStatus = 'booked';
    await staff.save();
  }

  await notificationService.notifyUser(booking.userId, { type: 'booking_status_updated', title: 'Staff Assigned to Your Booking', message: (staff.fullName || 'A staff member') + ' has been assigned to your ' + (serviceName || 'service') + ' booking.', bookingId: booking._id, staffId: staff._id }).catch(() => {});
  if (staff.provider) await notificationService.notifyProvider(staff.provider._id ?? staff.provider, { type: 'booking_status_updated', title: 'New Booking Assignment', message: 'You have been assigned to a ' + (serviceName || 'service') + ' booking.', bookingId: booking._id, staffId: staff._id }).catch(() => {});
  await notificationService.notifyBusiness(businessId, { type: 'booking_status_updated', title: 'Staff Assigned to Booking', message: (staff.fullName || 'A staff member') + ' has been assigned to booking ' + booking._id + '.', bookingId: booking._id, staffId: staff._id }).catch(() => {});
  return {
    bookingId: booking._id,
    serviceName,
    assignedStaff: booking.assignedStaff.map((a) => ({
      staffId: a.staff,
      providerId: a.provider,
      assignedAt: a.assignedAt,
    })),
  };
};

const WORK_STATUS_RANK = {
  in_service: 0,
  booked: 1,
  available: 2,
  offline: 3,
};

// A business needs at least this many clocked-in staff to receive fast bookings.
const MIN_ON_DUTY_STAFF = Number(process.env.BUSINESS_MIN_ON_DUTY_STAFF || 1);

// Staff only count as on duty while their own app is alive: their provider
// location heartbeat must be at least this fresh (matches nearby search).
const STAFF_STALE_LOCATION_MINUTES = Number(
  process.env.STAFF_STALE_LOCATION_MINUTES || 10,
);

// Clocked-in (onDuty.active) ACTIVE staff whose provider account has a fresh
// location heartbeat, per business, as a Map of businessId string -> count.
// Businesses with nobody online on duty are absent.
const countOnDutyStaffByBusiness = async (businessIds = []) => {
  if (!businessIds.length) return new Map();

  const onDutyStaff = await Staff.find(
    {
      business: { $in: businessIds },
      status: 'ACTIVE',
      'onDuty.active': true,
      provider: { $ne: null },
    },
    'business provider',
    { lean: true },
  );
  if (!onDutyStaff.length) return new Map();

  const staleThreshold = new Date(
    Date.now() - STAFF_STALE_LOCATION_MINUTES * 60 * 1000,
  );
  const onlineProviderIds = await Provider.distinct('_id', {
    _id: { $in: onDutyStaff.map((s) => s.provider) },
    lastLocationUpdate: { $gte: staleThreshold },
  });
  const online = new Set(onlineProviderIds.map(String));

  const counts = new Map();
  for (const s of onDutyStaff) {
    if (!online.has(String(s.provider))) continue;
    const key = String(s.business);
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return counts;
};

// Resolves the ACTIVE staff record the authenticated provider is clocking
// against. `businessId` is optional when the provider works for one business.
const findOwnActiveStaff = async (providerId, businessId) => {
  if (!mongoose.isValidObjectId(providerId)) {
    throw new ForbiddenError('Valid provider account required');
  }
  if (businessId !== undefined && !mongoose.isValidObjectId(businessId)) {
    throw new ValidationError('Invalid business ID');
  }

  const records = await Staff.find({
    provider: providerId,
    status: 'ACTIVE',
    ...(businessId !== undefined ? { business: businessId } : {}),
  });
  if (!records.length) {
    throw new NotFoundError(
      businessId !== undefined
        ? 'You are not an active staff member of this business'
        : 'You are not an active staff member of any business',
    );
  }
  if (records.length > 1) {
    throw new ValidationError(
      'You work for more than one business; businessId is required',
    );
  }
  return records[0];
};

// Owner-side lookup of one of their staff, by Staff _id.
const findBusinessActiveStaff = async (businessId, staffId) => {
  if (!mongoose.isValidObjectId(businessId)) {
    throw new ValidationError('Invalid business ID');
  }
  if (!mongoose.isValidObjectId(staffId)) {
    throw new ValidationError('Invalid staff ID');
  }

  const staff = await Staff.findOne({ _id: staffId, business: businessId });
  if (!staff) {
    throw new NotFoundError('Staff not found in your business');
  }
  if (staff.status !== 'ACTIVE') {
    throw new ConflictError(
      `Cannot change duty for a staff member who is ${staff.status.toLowerCase()}`,
    );
  }
  return staff;
};

const hasPendingClockRequest = (staff) =>
  staff.clockRequest?.status === 'pending';

const toClockState = (staff) => ({
  staffId: staff._id,
  businessId: staff.business,
  onDuty: Boolean(staff.onDuty?.active),
  since: staff.onDuty?.since || null,
  lastClockInAt: staff.onDuty?.lastClockInAt || null,
  lastClockOutAt: staff.onDuty?.lastClockOutAt || null,
  workStatus: staff.workStatus,
  clockRequest: staff.clockRequest?.status
    ? {
        action: staff.clockRequest.action,
        status: staff.clockRequest.status,
        requestedAt: staff.clockRequest.requestedAt,
        respondedAt: staff.clockRequest.respondedAt,
        reason: staff.clockRequest.reason,
      }
    : null,
});

// Is this provider on duty — or waiting on a clock-in — at another business?
const assertNotOnDutyElsewhere = async (staff) => {
  const elsewhere = await Staff.exists({
    provider: staff.provider,
    status: 'ACTIVE',
    business: { $ne: staff.business },
    $or: [
      { 'onDuty.active': true },
      { 'clockRequest.status': 'pending', 'clockRequest.action': 'clock_in' },
    ],
  });
  if (elsewhere) {
    throw new ConflictError(
      'You are clocked in (or awaiting clock-in) at another business; clock out there first',
    );
  }
};

// Flips the duty state. Callers save.
const applyDutyChange = (staff, onDuty, now = new Date()) => {
  if (onDuty) {
    staff.set({
      'onDuty.active': true,
      'onDuty.since': now,
      'onDuty.lastClockInAt': now,
    });
    // Keep busy states (booked / in_service); otherwise mark available.
    if (!['booked', 'in_service'].includes(staff.workStatus)) {
      staff.workStatus = 'available';
    }
  } else {
    staff.set({
      'onDuty.active': false,
      'onDuty.since': null,
      'onDuty.lastClockOutAt': now,
    });
    staff.workStatus = 'offline';
  }
};

const notifySafely = async (send, label) => {
  try {
    await send();
  } catch (error) {
    console.error(`${label} notification failed:`, error.message);
  }
};

// Staff (provider) asks to clock in or out. Nothing changes on duty until the
// business owner approves. Requesting the state you're already in cancels any
// pending request; repeating a pending request is a no-op.
const requestClockChange = async (providerId, action, { businessId } = {}) => {
  const staff = await findOwnActiveStaff(providerId, businessId);
  const wantsOnDuty = action === 'clock_in';

  if (Boolean(staff.onDuty?.active) === wantsOnDuty) {
    if (hasPendingClockRequest(staff)) {
      staff.set({
        'clockRequest.status': 'cancelled',
        'clockRequest.respondedAt': new Date(),
      });
      await staff.save();
    }
    return toClockState(staff);
  }
  if (hasPendingClockRequest(staff) && staff.clockRequest.action === action) {
    return toClockState(staff);
  }
  if (wantsOnDuty) await assertNotOnDutyElsewhere(staff);

  staff.clockRequest = {
    action,
    status: 'pending',
    requestedAt: new Date(),
    respondedAt: null,
    respondedBy: null,
    reason: null,
  };
  await staff.save();

  const label = wantsOnDuty ? 'clock in' : 'clock out';
  await notifySafely(
    () =>
      notificationService.notifyProvider(providerId, {
        type: wantsOnDuty
          ? 'staff_clock_in_requested'
          : 'staff_clock_out_requested',
        title: `Clock-${wantsOnDuty ? 'in' : 'out'} request sent`,
        message: `Your ${label} request was sent to the business for approval.`,
        businessId: staff.business,
        staffId: staff._id,
      }),
    'Clock request provider',
  );
  await notifySafely(
    () =>
      notificationService.notifyBusiness(staff.business, {
        type: wantsOnDuty
          ? 'staff_clock_in_requested'
          : 'staff_clock_out_requested',
        title: `Staff ${label} request`,
        message: `${staff.email} (${staff.role}) wants to ${label}`,
        staffId: staff._id,
      }),
    'Clock request',
  );

  return toClockState(staff);
};

const clockInStaff = (providerId, options) =>
  requestClockChange(providerId, 'clock_in', options);

const clockOutStaff = (providerId, options) =>
  requestClockChange(providerId, 'clock_out', options);

// Owner: staff with a pending clock-in/out request, oldest first.
const getPendingClockRequests = async (businessId) => {
  if (!mongoose.isValidObjectId(businessId)) {
    throw new ValidationError('Invalid business ID');
  }

  const staffList = await Staff.find({
    business: businessId,
    status: 'ACTIVE',
    'clockRequest.status': 'pending',
  })
    .sort({ 'clockRequest.requestedAt': 1 })
    .populate('provider', 'fullName profilePicture');

  return staffList.map((s) => ({
    ...toClockState(s),
    staffCode: s.staffCode,
    role: s.role,
    email: s.email,
    fullName: s.provider?.fullName || null,
    profilePicture: s.provider?.profilePicture || null,
  }));
};

const CLOCK_RESPONSE_ACTIONS = ['approve', 'reject'];

// Owner approves or rejects a staff member's pending clock request.
const respondToClockRequest = async (
  businessId,
  staffId,
  { action, reason } = {},
) => {
  if (!CLOCK_RESPONSE_ACTIONS.includes(action)) {
    throw new ValidationError("action must be 'approve' or 'reject'");
  }
  if (reason !== undefined && reason !== null && typeof reason !== 'string') {
    throw new ValidationError('reason must be a string');
  }

  const staff = await findBusinessActiveStaff(businessId, staffId);
  if (!hasPendingClockRequest(staff)) {
    throw new ConflictError('This staff member has no pending clock request');
  }

  const requested = staff.clockRequest.action;
  const now = new Date();
  if (action === 'approve') {
    if (requested === 'clock_in') await assertNotOnDutyElsewhere(staff);
    applyDutyChange(staff, requested === 'clock_in', now);
  }
  staff.set({
    'clockRequest.status': action === 'approve' ? 'approved' : 'rejected',
    'clockRequest.respondedAt': now,
    'clockRequest.respondedBy': businessId,
    'clockRequest.reason': reason?.trim() || null,
  });
  await staff.save();

  const label = requested === 'clock_in' ? 'clock-in' : 'clock-out';
  await notifySafely(
    () =>
      notificationService.notifyProvider(staff.provider, {
        type:
          action === 'approve'
            ? 'staff_clock_request_approved'
            : 'staff_clock_request_rejected',
        title: `${label[0].toUpperCase()}${label.slice(1)} ${action === 'approve' ? 'approved' : 'rejected'}`,
        message: `Your ${label} request was ${action === 'approve' ? 'approved' : 'rejected'}${reason?.trim() ? `: ${reason.trim()}` : ''}`,
        businessId: staff.business,
      }),
    'Clock response',
  );
  await notifySafely(
    () =>
      notificationService.notifyBusiness(staff.business, {
        type:
          action === 'approve'
            ? 'staff_clock_request_approved'
            : 'staff_clock_request_rejected',
        title: `Staff ${label} request ${action === 'approve' ? 'approved' : 'rejected'}`,
        message: `You ${action === 'approve' ? 'approved' : 'rejected'} ${staff.email}'s ${label} request${reason?.trim() ? `: ${reason.trim()}` : ''}.`,
        staffId: staff._id,
      }),
    'Clock response business',
  );

  return toClockState(staff);
};

// Owner clocks a staff member out directly (no request needed). Resolves a
// pending clock-out as approved. Idempotent when already off duty.
const businessClockOutStaff = async (businessId, staffId, { reason } = {}) => {
  if (reason !== undefined && reason !== null && typeof reason !== 'string') {
    throw new ValidationError('reason must be a string');
  }

  const staff = await findBusinessActiveStaff(businessId, staffId);
  if (!staff.onDuty?.active) return toClockState(staff);

  const now = new Date();
  applyDutyChange(staff, false, now);
  if (hasPendingClockRequest(staff)) {
    staff.set({
      'clockRequest.status': 'approved',
      'clockRequest.respondedAt': now,
      'clockRequest.respondedBy': businessId,
      'clockRequest.reason': reason?.trim() || null,
    });
  }
  await staff.save();

  await notifySafely(
    () =>
      notificationService.notifyProvider(staff.provider, {
        type: 'staff_clocked_out_by_business',
        title: 'Clocked out',
        message: `You were clocked out by the business${reason?.trim() ? `: ${reason.trim()}` : ''}`,
        businessId: staff.business,
      }),
    'Business clock-out',
  );
  await notifySafely(
    () =>
      notificationService.notifyBusiness(staff.business, {
        type: 'staff_clocked_out_by_business',
        title: 'Staff clocked out',
        message: `${staff.email} was clocked out by the business${reason?.trim() ? `: ${reason.trim()}` : ''}.`,
        staffId: staff._id,
      }),
    'Business clock-out business',
  );

  return toClockState(staff);
};

// The "Staff on duty" board: every active staff member with a working status.
// Busy states are derived from the staff's not-yet-completed assigned bookings
// (in_progress -> in_service, assigned -> booked); everyone else falls back
// to their stored workStatus (available / offline).
const getStaffOnDuty = async (businessId) => {
  if (!mongoose.isValidObjectId(businessId)) {
    throw new ValidationError('Invalid business ID');
  }

  const [staffList, activeBookings] = await Promise.all([
    Staff.find({ business: businessId, status: 'ACTIVE' }).populate(
      'provider',
      'fullName profilePicture',
    ),
    Booking.find({
      businessId,
      businessStatus: { $in: ['assigned', 'in_progress'] },
      'assignedStaff.0': { $exists: true },
    })
      .select('serviceType serviceDetails businessStatus userId assignedStaff')
      .sort({ updatedAt: -1 })
      .populate('userId', 'fullName'),
  ]);

  // Most-relevant active booking per staff: in_progress beats assigned.
  const jobByStaff = new Map();
  for (const booking of activeBookings) {
    for (const a of booking.assignedStaff) {
      const key = String(a.staff);
      const existing = jobByStaff.get(key);
      const isUpgrade =
        !existing ||
        (existing.businessStatus !== 'in_progress' &&
          booking.businessStatus === 'in_progress');
      if (isUpgrade) {
        jobByStaff.set(key, {
          bookingId: booking._id,
          businessStatus: booking.businessStatus,
          serviceName: bookingServiceName(booking),
          customerName: booking.userId?.fullName || null,
        });
      }
    }
  }

  const staff = staffList
    .filter((s) => s.provider)
    .map((s) => {
      const job = jobByStaff.get(String(s._id)) || null;
      let workStatus = s.workStatus;
      if (job) {
        workStatus =
          job.businessStatus === 'in_progress' ? 'in_service' : 'booked';
      }
      return {
        staffId: s._id,
        staffCode: s.staffCode,
        name: s.provider.fullName,
        avatar: s.provider.profilePicture,
        role: s.role,
        services: s.services,
        workStatus,
        currentJob: job
          ? {
              bookingId: job.bookingId,
              serviceName: job.serviceName,
              customerName: job.customerName,
            }
          : null,
      };
    })
    .sort(
      (a, b) =>
        (WORK_STATUS_RANK[a.workStatus] ?? 9) -
        (WORK_STATUS_RANK[b.workStatus] ?? 9),
    );

  return { count: staff.length, staff };
};

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

const parsePagination = ({ page, limit } = {}) => {
  const p = Number.parseInt(page, 10);
  const l = Number.parseInt(limit, 10);
  const pageNum = Number.isFinite(p) && p > 0 ? p : 1;
  const size =
    Number.isFinite(l) && l > 0
      ? Math.min(l, MAX_PAGE_SIZE)
      : DEFAULT_PAGE_SIZE;
  return { pageNum, size };
};

// Roster of the business's staff across all account statuses, with optional
// status filter and page/limit pagination.
const getAllStaff = async (businessId, options = {}) => {
  if (!mongoose.isValidObjectId(businessId)) {
    throw new ValidationError('Invalid business ID');
  }

  const { status } = options;
  const filter = { business: businessId };
  if (status !== undefined) {
    if (!Staff.STAFF_STATUSES.includes(status)) {
      throw new ValidationError(
        `status must be one of: ${Staff.STAFF_STATUSES.join(', ')}`,
      );
    }
    filter.status = status;
  }

  const { pageNum, size } = parsePagination(options);

  const [docs, total] = await Promise.all([
    Staff.find(filter)
      .populate('provider', 'fullName profilePicture')
      .sort({ createdAt: -1 })
      .skip((pageNum - 1) * size)
      .limit(size),
    Staff.countDocuments(filter),
  ]);

  return {
    pagination: {
      total,
      page: pageNum,
      limit: size,
      pages: Math.ceil(total / size) || 1,
    },
    staff: docs.map((s) => ({
      staffId: s._id,
      staffCode: s.staffCode,
      name: s.provider?.fullName || null,
      avatar: s.provider?.profilePicture || null,
      email: s.email,
      role: s.role,
      services: s.services,
      status: s.status,
      workStatus: s.workStatus,
      canDoHomeService: s.canDoHomeService,
    })),
  };
};

const startOfToday = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};

// Full staff profile for the detail sheet: identity, live working status,
// current job, today's jobs and rating. Only fields backed by real data are
// returned (no fabricated acceptance / punctuality / clock-in stats).
const getStaffDetail = async (businessId, identifier) => {
  if (!mongoose.isValidObjectId(businessId)) {
    throw new ValidationError('Invalid business ID');
  }
  if (!identifier || typeof identifier !== 'string' || !identifier.trim()) {
    throw new ValidationError('A staff identifier is required');
  }

  const value = identifier.trim();
  const or = [{ staffCode: value }, { email: normalizeEmail(value) }];
  if (mongoose.isValidObjectId(value)) or.push({ _id: value });

  const staff = await Staff.findOne({ business: businessId, $or: or }).populate(
    'provider',
    'fullName profilePicture rating kycVerified createdAt',
  );
  if (!staff) {
    throw new NotFoundError('Staff not found in your business');
  }

  const [activeBookings, todayBookings, jobsLast7Days] = await Promise.all([
    Booking.find({
      businessId,
      businessStatus: { $in: ['assigned', 'in_progress'] },
      'assignedStaff.staff': staff._id,
    })
      .select('serviceType serviceDetails businessStatus userId')
      .sort({ updatedAt: -1 })
      .populate('userId', 'fullName'),
    Booking.find({
      businessId,
      'assignedStaff.staff': staff._id,
      businessStatus: { $ne: 'cancelled' },
      createdAt: { $gte: startOfToday() },
    })
      .select('serviceType serviceDetails businessStatus location')
      .sort({ createdAt: -1 }),
    Booking.countDocuments({
      businessId,
      'assignedStaff.staff': staff._id,
      createdAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
    }),
  ]);

  const current = activeBookings[0] || null;
  const workStatus = current
    ? current.businessStatus === 'in_progress'
      ? 'in_service'
      : 'booked'
    : staff.workStatus;

  return {
    staffId: staff._id,
    staffCode: staff.staffCode,
    name: staff.provider?.fullName || null,
    avatar: staff.provider?.profilePicture || null,
    email: staff.email,
    role: staff.role,
    status: staff.status,
    workStatus,
    services: staff.services,
    canDoHomeService: staff.canDoHomeService,
    joinedAt: staff.provider?.createdAt || staff.createdAt,
    rating: staff.provider?.rating || { average: 0, count: 0 },
    documents: staff.provider?.kycVerified ? 'verified' : 'pending',
    jobsLast7Days,
    currentJob: current
      ? {
          bookingId: current._id,
          serviceName: bookingServiceName(current),
          customerName: current.userId?.fullName || null,
        }
      : null,
    todayJobs: todayBookings.map((b) => ({
      bookingId: b._id,
      serviceName: bookingServiceName(b),
      location: b.location?.formattedAddress || b.location?.address || null,
      status: b.businessStatus,
    })),
  };
};

const STAFF_RESPONSE_STATUSES = ['accept', 'decline'];
const STAFF_CODE_PREFIX = 'SGD-';

// Per-business 6-digit staff code. Collisions are re-rolled (bounded) because
// the {business, staffCode} pair is what must be unique, not the code alone.
const generateStaffCode = async (businessId) => {
  for (let attempt = 0; attempt < 25; attempt += 1) {
    const code = `${STAFF_CODE_PREFIX}${String(
      Math.floor(100000 + Math.random() * 900000),
    )}`;
    const exists = await Staff.exists({
      business: businessId,
      staffCode: code,
    });
    if (!exists) return code;
  }
  throw new ConflictError(
    'Could not generate a unique staff code, please retry',
  );
};

// Provider-facing: the invited person accepts or declines a business's staff
// invitation. The caller must be authenticated as a provider whose email
// matches the invitation. Declining soft-marks the record (the Provider
// account is never touched); accepting flips status to ACTIVE, links the
// provider and only then assigns the staffCode.
const respondToStaffInvite = async (payload = {}, provider = {}) => {
  const { staffEmail, businessEmail, status } = payload;

  if (!STAFF_RESPONSE_STATUSES.includes(status)) {
    throw new ValidationError("status must be 'accept' or 'decline'");
  }
  if (
    !staffEmail ||
    typeof staffEmail !== 'string' ||
    !EMAIL_PATTERN.test(staffEmail.trim())
  ) {
    throw new ValidationError('A valid staff email is required');
  }
  if (
    !businessEmail ||
    typeof businessEmail !== 'string' ||
    !EMAIL_PATTERN.test(businessEmail.trim())
  ) {
    throw new ValidationError('A valid business email is required');
  }
  if (!provider || !provider.email) {
    throw new ForbiddenError('Authentication required');
  }

  const normalizedStaffEmail = normalizeEmail(staffEmail);
  if (normalizeEmail(provider.email) !== normalizedStaffEmail) {
    throw new ForbiddenError('You can only respond to your own invitation');
  }

  const business = await businessRepository.findBusinessByEmail(
    normalizeEmail(businessEmail),
  );
  if (!business || business.isDeleted) {
    throw new NotFoundError('Business not found');
  }

  const staff = await Staff.findOne({
    email: normalizedStaffEmail,
    business: business._id,
  });
  if (!staff) {
    throw new NotFoundError('No invitation found for this email');
  }
  if (staff.status === 'ACTIVE') {
    throw new ConflictError('You have already accepted this invitation');
  }
  if (staff.status !== 'INVITED') {
    throw new ConflictError(`This invitation is ${staff.status.toLowerCase()}`);
  }

  if (status === 'decline') {
    staff.status = 'DECLINED';
    staff.declinedAt = new Date();
    await staff.save();
    await notifySafely(
      () =>
        notificationService.notifyProvider(provider.id, {
          type: 'staff_invitation_declined',
          title: 'Invitation declined',
          message: `You declined the staff invitation from ${business.BusinessName || business.fullName || 'the business'}.`,
          businessId: business._id,
          staffId: staff._id,
        }),
      'Staff invitation decline provider',
    );
    await notifySafely(
      () =>
        notificationService.notifyBusiness(business._id, {
          type: 'staff_invitation_declined',
          title: 'Staff invitation declined',
          message: `${normalizedStaffEmail} declined your staff invitation.`,
          staffId: staff._id,
        }),
      'Staff invitation decline business',
    );
    return {
      status: 'DECLINED',
      staffId: staff._id,
      businessId: business._id,
    };
  }

  if (staff.inviteExpiresAt && staff.inviteExpiresAt.getTime() < Date.now()) {
    staff.status = 'EXPIRED';
    await staff.save();
    throw new ConflictError('This invitation has expired');
  }

  if (!mongoose.isValidObjectId(provider.id)) {
    throw new ForbiddenError('Valid provider account required to accept');
  }

  staff.status = 'ACTIVE';
  staff.provider = provider.id;
  staff.acceptedAt = new Date();
  staff.staffCode = await generateStaffCode(business._id);
  await staff.save();
  await Provider.updateOne(
    { _id: provider.id },
    { $set: { invitedBy: business._id } },
  );
  await notifySafely(
    () =>
      notificationService.notifyProvider(provider.id, {
        type: 'staff_invitation_accepted',
        title: 'Invitation accepted',
        message: `You joined ${business.BusinessName || business.fullName || 'the business'} as ${staff.role}.`,
        businessId: business._id,
        staffId: staff._id,
      }),
    'Staff invitation acceptance provider',
  );
  await notifySafely(
    () =>
      notificationService.notifyBusiness(business._id, {
        type: 'staff_invitation_accepted',
        title: 'Staff invitation accepted',
        message: `${normalizedStaffEmail} accepted your staff invitation.`,
        staffId: staff._id,
      }),
    'Staff invitation acceptance business',
  );

  return {
    status: 'ACTIVE',
    staffId: staff._id,
    staffCode: staff.staffCode,
    role: staff.role,
    services: staff.services,
    businessId: business._id,
    businessName: business.BusinessName || business.fullName || 'the business',
  };
};

module.exports = {
  inviteStaff,
  normalizeEmail,
  matchServicesToCatalog,
  STAFF_INVITE_EXPIRY_DAYS,
  evaluateStaffEligibility,
  getStaffCandidates,
  assignStaffToBooking,
  updateStaffRole,
  getStaffOnDuty,
  countOnDutyStaffByBusiness,
  MIN_ON_DUTY_STAFF,
  clockInStaff,
  clockOutStaff,
  getPendingClockRequests,
  respondToClockRequest,
  businessClockOutStaff,
  getAllStaff,
  getStaffDetail,
  respondToStaffInvite,
};

const acceptBooking = async (...args) => { const { acceptBooking: fn } = require('./business.service'); return fn(...args); };
const declineBooking = async (...args) => { const { declineBooking: fn } = require('./business.service'); return fn(...args); };
Object.assign(module.exports, { acceptBooking, declineBooking, acceptBusinessBooking: acceptBooking, declineBusinessBooking: declineBooking });
