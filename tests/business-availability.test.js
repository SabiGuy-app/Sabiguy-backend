const test = require("node:test");
const assert = require("node:assert/strict");

const bookingController = require("../src/modules/bookings/bookings.controller");
const Business = require("../src/modules/business/business.model");
const Provider = require("../models/ServiceProvider");
const Staff = require("../src/modules/business/staff.model");
const {
  setBusinessAvailability,
  updateBusinessLocation,
  isWithinBusinessHours,
  ValidationError,
  ForbiddenError,
} = require("../src/modules/business/business.service");
const businessRepository = require("../src/modules/business/business.repository");
const { MIN_ON_DUTY_STAFF } = require("../src/modules/business/staff.service");

const BUSINESS_ID = "64b000000000000000000001";
const SHORT_STAFFED_ID = "64b000000000000000000002";

const rejects = (promise, messagePattern) =>
  promise.then(
    () => assert.fail("expected rejection"),
    (error) => {
      assert.ok(error instanceof ValidationError, "expected ValidationError");
      assert.match(error.message, messagePattern);
    },
  );

// Wednesday 2026-10-21 12:00 in Lagos (UTC+1).
const WEDNESDAY_NOON_LAGOS = new Date("2026-10-21T11:00:00Z");

test("setBusinessAvailability rejects non-boolean isAvailable", () => {
  return rejects(
    setBusinessAvailability(BUSINESS_ID, { isAvailable: "true" }),
    /isAvailable must be a boolean/,
  );
});

test("setBusinessAvailability requires verified KYC to turn on", async () => {
  const originalFind = businessRepository.findBusinessById;
  const originalSave = businessRepository.saveBusinessDetails;
  let saved = false;
  businessRepository.findBusinessById = async () => ({ kycVerified: false });
  businessRepository.saveBusinessDetails = async () => {
    saved = true;
  };

  try {
    await assert.rejects(
      setBusinessAvailability(BUSINESS_ID, { isAvailable: true }),
      (error) =>
        error instanceof ForbiddenError &&
        /KYC must be verified/.test(error.message),
    );
    assert.equal(saved, false);
  } finally {
    businessRepository.findBusinessById = originalFind;
    businessRepository.saveBusinessDetails = originalSave;
  }
});

test("setBusinessAvailability lets an unverified business turn off", async () => {
  const originalFind = businessRepository.findBusinessById;
  const originalSave = businessRepository.saveBusinessDetails;
  businessRepository.findBusinessById = async () => ({ kycVerified: false });
  businessRepository.saveBusinessDetails = async (id, updates) => ({
    availability: { isAvailable: updates["availability.isAvailable"] },
  });

  try {
    const result = await setBusinessAvailability(BUSINESS_ID, {
      isAvailable: false,
    });
    assert.equal(result.availability.isAvailable, false);
  } finally {
    businessRepository.findBusinessById = originalFind;
    businessRepository.saveBusinessDetails = originalSave;
  }
});

test("updateBusinessLocation rejects missing coordinates", () => {
  return rejects(
    updateBusinessLocation(BUSINESS_ID, { latitude: 6.5 }),
    /latitude and longitude must be valid coordinates/,
  );
});

test("updateBusinessLocation rejects out-of-range latitude", () => {
  return rejects(
    updateBusinessLocation(BUSINESS_ID, { latitude: 91, longitude: 3.4 }),
    /latitude and longitude must be valid coordinates/,
  );
});

test("isWithinBusinessHours allows businesses without days or hours", () => {
  assert.equal(isWithinBusinessHours({}, WEDNESDAY_NOON_LAGOS), true);
});

test("isWithinBusinessHours checks available days in the business timezone", () => {
  assert.equal(
    isWithinBusinessHours(
      { availableDays: ["Monday", "Wednesday"] },
      WEDNESDAY_NOON_LAGOS,
    ),
    true,
  );
  assert.equal(
    isWithinBusinessHours({ availableDays: ["Mon", "Tue"] }, WEDNESDAY_NOON_LAGOS),
    false,
  );
});

test("isWithinBusinessHours parses 24h and am/pm hours", () => {
  assert.equal(
    isWithinBusinessHours(
      { businessHours: { start: "09:00", end: "17:00" } },
      WEDNESDAY_NOON_LAGOS,
    ),
    true,
  );
  assert.equal(
    isWithinBusinessHours(
      { businessHours: { start: "1pm", end: "6:30 PM" } },
      WEDNESDAY_NOON_LAGOS,
    ),
    false,
  );
});

test("isWithinBusinessHours supports overnight hours", () => {
  const hours = { businessHours: { start: "20:00", end: "02:00" } };
  assert.equal(isWithinBusinessHours(hours, WEDNESDAY_NOON_LAGOS), false);
  assert.equal(
    isWithinBusinessHours(hours, new Date("2026-10-21T22:30:00Z")),
    true,
  );
});

test("business search requires availability, presence and enough online on-duty staff", async () => {
  const originalProviderAggregate = Provider.aggregate;
  const originalBusinessAggregate = Business.aggregate;
  const originalStaffFind = Staff.find;
  const originalProviderDistinct = Provider.distinct;
  let businessQuery;
  let providerQuery;

  Provider.aggregate = async () => [];
  Business.aggregate = async ([geoNear]) => {
    businessQuery = geoNear.$geoNear.query;
    return [BUSINESS_ID, SHORT_STAFFED_ID].map((id, index) => ({
      _id: id,
      BusinessName: `Business ${index}`,
      service: [],
      distanceFromPickup: 1000 + index,
    }));
  };
  // Each business has MIN_ON_DUTY_STAFF clocked in, plus one stale staff
  // member. In the short-staffed business one of the MIN is also stale, so
  // only MIN - 1 are online there.
  let seq = 0;
  const providerId = () =>
    `64c0000000000000000${String(++seq).padStart(5, "0")}`;
  const onDuty = [];
  const online = [];
  for (const business of [BUSINESS_ID, SHORT_STAFFED_ID]) {
    for (let i = 0; i <= MIN_ON_DUTY_STAFF; i++) {
      const provider = providerId();
      onDuty.push({ business, provider });
      const isStale =
        i === MIN_ON_DUTY_STAFF || (business === SHORT_STAFFED_ID && i === 0);
      if (!isStale) online.push(provider);
    }
  }
  Staff.find = async () => onDuty;
  Provider.distinct = async (field, query) => {
    providerQuery = query;
    return online;
  };

  try {
    const results = await bookingController.findNearbyProviders(
      { latitude: 6.5, longitude: 3.4 },
      null,
      null,
      null,
      null,
      null,
      undefined,
      undefined,
      "Business",
      true,
    );

    assert.equal(businessQuery["availability.isAvailable"], true);
    assert.equal(businessQuery.isOnline, true);
    assert.ok(businessQuery.lastSeenAt.$gte instanceof Date);
    assert.equal(businessQuery.lastLocationUpdate, undefined);

    assert.deepEqual(
      results.map((account) => String(account.id)),
      [BUSINESS_ID],
    );
    assert.equal(results[0].onDutyStaffCount, MIN_ON_DUTY_STAFF);
    assert.ok(providerQuery.lastLocationUpdate.$gte instanceof Date);
  } finally {
    Provider.aggregate = originalProviderAggregate;
    Business.aggregate = originalBusinessAggregate;
    Staff.find = originalStaffFind;
    Provider.distinct = originalProviderDistinct;
  }
});
