const test = require("node:test");
const assert = require("node:assert/strict");

const Booking = require("../src/modules/bookings/Bookings.model");
const Buyer = require("../models/ServiceUser");
const bookingController = require("../src/modules/bookings/bookings.controller");
const providerController = require("../src/modules/provider/provider.controller");
const adminController = require("../src/modules/admin/admin.controller");
const notificationService = require("../src/services/notification.service");
const emailVerification = require("../src/config/emailVerification");

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

test("buyer cancellation requests lock a paid booking and notify both parties", async () => {
  const originals = {
    findOne: Booking.findOne,
    findOneAndUpdate: Booking.findOneAndUpdate,
    findBuyer: Buyer.findById,
    notifyUser: notificationService.notifyUser,
    notifyProvider: notificationService.notifyProvider,
  };
  const sentNotifications = [];
  const booking = {
    _id: "booking-id",
    userId: "buyer-id",
    providerId: "provider-id",
    status: "in_progress",
    save: async function () {},
  };
  Booking.findOne = async () => booking;
  Booking.findOneAndUpdate = async (_query, update) => {
    Object.assign(booking, update.$set);
    return booking;
  };
  Buyer.findById = () => ({
    select: () => ({ lean: async () => null }),
  });
  notificationService.notifyUser = async (id, payload) =>
    sentNotifications.push(["buyer", id, payload]);
  notificationService.notifyProvider = async (id, payload) =>
    sentNotifications.push(["provider", id, payload]);

  try {
    const response = createResponse();
    await bookingController.cancelBooking(
      {
        params: { id: "booking-id" },
        user: { id: "buyer-id" },
        body: { reason: "Reschedule" },
      },
      response,
    );

    assert.equal(response.statusCode, 200);
    assert.equal(booking.status, "cancellation_requested");
    assert.equal(booking.cancellationRequest.previousStatus, "in_progress");
    assert.deepEqual(
      sentNotifications.map(([party]) => party).sort(),
      ["buyer", "provider"],
    );
  } finally {
    Booking.findOne = originals.findOne;
    Booking.findOneAndUpdate = originals.findOneAndUpdate;
    Buyer.findById = originals.findBuyer;
    notificationService.notifyUser = originals.notifyUser;
    notificationService.notifyProvider = originals.notifyProvider;
  }
});

test("provider cancellation requests lock a paid booking and notify both parties", async () => {
  const originals = {
    findOne: Booking.findOne,
    findOneAndUpdate: Booking.findOneAndUpdate,
    findBuyer: Buyer.findById,
    notifyUser: notificationService.notifyUser,
    notifyProvider: notificationService.notifyProvider,
  };
  const sentNotifications = [];
  const booking = {
    _id: "booking-id",
    userId: "buyer-id",
    providerId: "provider-id",
    status: "paid_escrow_scheduled",
    save: async function () {},
  };
  Booking.findOne = async () => booking;
  Booking.findOneAndUpdate = async (_query, update) => {
    Object.assign(booking, update.$set);
    return booking;
  };
  Buyer.findById = () => ({
    select: () => ({ lean: async () => null }),
  });
  notificationService.notifyUser = async (id, payload) =>
    sentNotifications.push(["buyer", id, payload]);
  notificationService.notifyProvider = async (id, payload) =>
    sentNotifications.push(["provider", id, payload]);

  try {
    const response = createResponse();
    await providerController.cancelBooking(
      {
        params: { bookingId: "booking-id" },
        user: { id: "provider-id" },
        body: { reason: "Unavailable" },
      },
      response,
    );

    assert.equal(response.statusCode, 200);
    assert.equal(booking.status, "cancellation_requested");
    assert.equal(
      booking.cancellationRequest.previousStatus,
      "paid_escrow_scheduled",
    );
    assert.deepEqual(
      sentNotifications.map(([party]) => party).sort(),
      ["buyer", "provider"],
    );
  } finally {
    Booking.findOne = originals.findOne;
    Booking.findOneAndUpdate = originals.findOneAndUpdate;
    Buyer.findById = originals.findBuyer;
    notificationService.notifyUser = originals.notifyUser;
    notificationService.notifyProvider = originals.notifyProvider;
  }
});

test("concurrent buyer cancellation requests only trigger one admin email", async () => {
  const originals = {
    findOne: Booking.findOne,
    findOneAndUpdate: Booking.findOneAndUpdate,
    findBuyer: Buyer.findById,
    notifyUser: notificationService.notifyUser,
    notifyProvider: notificationService.notifyProvider,
    sendAdminEmail: emailVerification.sendCancellationRequestAdminEmail,
  };
  let currentStatus = "in_progress";
  let adminEmailsSent = 0;
  const initialBooking = {
    _id: "booking-id",
    userId: "buyer-id",
    providerId: "provider-id",
    serviceType: "Cleaning",
    status: "in_progress",
  };

  Booking.findOne = async () => ({ ...initialBooking });
  Booking.findOneAndUpdate = async (_query, update) => {
    if (currentStatus !== "in_progress") return null;
    currentStatus = update.$set.status;
    return {
      ...initialBooking,
      ...update.$set,
      save: async function () {},
    };
  };
  Buyer.findById = () => ({
    select: () => ({ lean: async () => null }),
  });
  notificationService.notifyUser = async () => null;
  notificationService.notifyProvider = async () => null;
  emailVerification.sendCancellationRequestAdminEmail = async () => {
    adminEmailsSent += 1;
  };

  try {
    const invokeCancellation = () => {
      const response = createResponse();
      return bookingController
        .cancelBooking(
          {
            params: { id: "booking-id" },
            user: { id: "buyer-id" },
            body: { reason: "Reschedule" },
          },
          response,
        )
        .then(() => response);
    };

    const responses = await Promise.all([
      invokeCancellation(),
      invokeCancellation(),
    ]);

    assert.deepEqual(
      responses.map((response) => response.statusCode).sort(),
      [200, 409],
    );
    assert.equal(currentStatus, "cancellation_requested");
    assert.equal(adminEmailsSent, 1);
  } finally {
    Booking.findOne = originals.findOne;
    Booking.findOneAndUpdate = originals.findOneAndUpdate;
    Buyer.findById = originals.findBuyer;
    notificationService.notifyUser = originals.notifyUser;
    notificationService.notifyProvider = originals.notifyProvider;
    emailVerification.sendCancellationRequestAdminEmail =
      originals.sendAdminEmail;
  }
});

test("admin rejection restores the booking's prior status and notifies both parties", async () => {
  const originals = {
    findOne: Booking.findOne,
    notifyUser: notificationService.notifyUser,
    notifyProvider: notificationService.notifyProvider,
  };
  const sentNotifications = [];
  const booking = {
    _id: "booking-id",
    userId: "buyer-id",
    providerId: "provider-id",
    status: "cancellation_requested",
    cancellationRequest: {
      status: "pending",
      previousStatus: "arrived_at_pickup",
      toObject() {
        return { ...this };
      },
    },
    save: async function () {},
  };
  Booking.findOne = async () => booking;
  notificationService.notifyUser = async (id, payload) =>
    sentNotifications.push(["buyer", id, payload]);
  notificationService.notifyProvider = async (id, payload) =>
    sentNotifications.push(["provider", id, payload]);

  try {
    const response = createResponse();
    await adminController.rejectBookingCancellation(
      {
        params: { bookingId: "booking-id" },
        user: { id: "admin-id" },
        body: {
          buyerMessage: "The request was rejected.",
          providerMessage: "The booking remains active.",
        },
      },
      response,
    );

    assert.equal(response.statusCode, 200);
    assert.equal(booking.status, "arrived_at_pickup");
    assert.equal(booking.cancellationRequest.status, "rejected");
    assert.deepEqual(
      sentNotifications.map(([party]) => party).sort(),
      ["buyer", "provider"],
    );
  } finally {
    Booking.findOne = originals.findOne;
    notificationService.notifyUser = originals.notifyUser;
    notificationService.notifyProvider = originals.notifyProvider;
  }
});

test("provider status updates reject bookings with a pending cancellation", async () => {
  const originalFindOne = Booking.findOne;
  Booking.findOne = async () => ({
    status: "cancellation_requested",
  });

  try {
    const response = createResponse();
    await providerController.updateBookingStatus(
      {
        params: { bookingId: "booking-id" },
        query: { status: "arrived_at_dropoff" },
        user: { id: "provider-id" },
      },
      response,
    );

    assert.equal(response.statusCode, 400);
    assert.match(response.body.message, /Cannot update status/);
  } finally {
    Booking.findOne = originalFindOne;
  }
});
