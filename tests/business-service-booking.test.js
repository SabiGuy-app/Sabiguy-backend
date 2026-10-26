const test = require("node:test");
const assert = require("node:assert/strict");

const bookingController = require("../src/modules/bookings/bookings.controller");
const Booking = require("../src/modules/bookings/Bookings.model");
const Business = require("../src/modules/business/business.model");
const Staff = require("../src/modules/business/staff.model");
const notificationService = require("../src/services/notification.service");

const BUSINESS_ID = "64b000000000000000000001";
const STAFF_CODE = "SGD-284961";

const createResponse = () => ({
  statusCode: null,
  body: null,
  status(code) {
    this.statusCode = code;
    return this;
  },
  json(body) {
    this.body = body;
    return this;
  },
});

const createRequest = (overrides = {}) => ({
  user: { id: "64d000000000000000000001" },
  body: {
    category: "Beauty",
    service: [{ serviceName: "Braids", pricingOption: "customer_address" }],
    date: "2099-05-06",
    time: "10:00 AM",
    location: {
      address: "Ikeja, Lagos",
      latitude: 6.6,
      longitude: 3.35,
    },
    businessId: BUSINESS_ID,
    staffCode: STAFF_CODE,
    ...overrides,
  },
});

test("business service booking stores staffCode as a preference and leaves assignment to owner", async () => {
  const originalBusinessFindOne = Business.findOne;
  const originalStaffExists = Staff.exists;
  const originalBookingCreate = Booking.create;
  const originalNotifyBusiness = notificationService.notifyBusiness;
  const originalGeocodeWithFallback = bookingController.geocodeWithFallback;

  let createdBooking;
  let notifiedBusiness;
  let notificationData;

  Business.findOne = () => ({
    select: async () => ({
      availability: { isAvailable: true },
      businessCategory: "Beauty",
      service: [
        {
          serviceName: "Braids",
          duration: "60 minutes",
          pricingModel: { customer_address: 5000 },
        },
      ],
    }),
  });
  Staff.exists = async (query) => {
    assert.equal(String(query.business), BUSINESS_ID);
    assert.equal(query.staffCode, STAFF_CODE);
    assert.equal(query.status, "ACTIVE");
    return { _id: "64e000000000000000000001" };
  };
  Booking.create = async (booking) => {
    createdBooking = booking;
    return { ...booking, _id: "64f000000000000000000001" };
  };
  notificationService.notifyBusiness = async (businessId, data) => {
    notifiedBusiness = businessId;
    notificationData = data;
  };
  bookingController.geocodeWithFallback = async () => {
    throw new Error("Geocoding should not be needed for supplied coordinates");
  };

  try {
    const response = createResponse();
    await bookingController.createServiceBooking(createRequest(), response);

    assert.equal(response.statusCode, 201);
    assert.equal(createdBooking.businessId, BUSINESS_ID);
    assert.equal(createdBooking.providerId, null);
    assert.equal(createdBooking.requestedStaffCode, STAFF_CODE);
    assert.equal(createdBooking.businessStatus, "needs_staff");
    assert.equal(createdBooking.assignedStaff, undefined);
    assert.equal(notifiedBusiness, BUSINESS_ID);
    assert.equal(notificationData.staffCode, STAFF_CODE);
    assert.match(notificationData.message, /requested staff SGD-284961/);
    assert.equal(response.body.businessNotified, true);
  } finally {
    Business.findOne = originalBusinessFindOne;
    Staff.exists = originalStaffExists;
    Booking.create = originalBookingCreate;
    notificationService.notifyBusiness = originalNotifyBusiness;
    bookingController.geocodeWithFallback = originalGeocodeWithFallback;
  }
});

test("business service booking rejects a staffCode that is not active at that business", async () => {
  const originalBusinessFindOne = Business.findOne;
  const originalStaffExists = Staff.exists;
  const originalBookingCreate = Booking.create;

  Business.findOne = () => ({
    select: async () => ({
      availability: { isAvailable: true },
      businessCategory: "Beauty",
      service: [{ serviceName: "Braids", pricingModel: { customer_address: 5000 } }],
    }),
  });
  Staff.exists = async () => null;
  Booking.create = async () => {
    throw new Error("Booking must not be created for an invalid staff code");
  };

  try {
    const response = createResponse();
    await bookingController.createServiceBooking(createRequest(), response);

    assert.equal(response.statusCode, 400);
    assert.equal(
      response.body.message,
      "staffCode does not belong to an active staff member of this business",
    );
  } finally {
    Business.findOne = originalBusinessFindOne;
    Staff.exists = originalStaffExists;
    Booking.create = originalBookingCreate;
  }
});

test("service booking requires exactly one providerId or businessId", async () => {
  const response = createResponse();

  await bookingController.createServiceBooking(
    createRequest({ providerId: "64a000000000000000000001" }),
    response,
  );

  assert.equal(response.statusCode, 400);
  assert.match(response.body.message, /exactly one of providerId or businessId/);
});
