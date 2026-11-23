const test = require("node:test");
const assert = require("node:assert/strict");

const notificationService = require("../src/services/notification.service");
const notificationsRepository = require("../src/modules/notifications/notifications.repository");
const notificationsModule = require("../src/modules/notifications/notifications.service");
const Business = require("../src/modules/business/business.model");

test("enabling booking notifications allows every booking type", async () => {
  const originalFindUserPreferences = notificationsRepository.findUserPreferences;
  const originalSaveUser = notificationsRepository.saveUser;
  const user = {
    notificationPreferences: {},
    async save() {},
  };
  notificationsRepository.findUserPreferences = async () => user;
  notificationsRepository.saveUser = async () => {};

  try {
    const preferences = await notificationsModule.updateNotificationPreferences(
      "buyer-id",
      "buyer",
      {
        bookings: {
          push: true,
          email: true,
          types: ["new_booking_request"],
        },
      },
    );

    assert.deepEqual(preferences.bookings.types, []);
    assert.deepEqual(
      notificationService.shouldNotify(preferences, "booking_assigned"),
      { allowInApp: true, allowPush: true, allowEmail: true },
    );
  } finally {
    notificationsRepository.findUserPreferences = originalFindUserPreferences;
    notificationsRepository.saveUser = originalSaveUser;
  }
});

test("business owners can update booking preferences through the shared endpoint", async () => {
  const originalFindById = Business.findById;
  const business = {
    notificationPreferences: {},
    async save() {},
  };
  Business.findById = () => ({
    select: async () => business,
  });

  try {
    const preferences = await notificationsModule.updateNotificationPreferences(
      "business-id",
      "businessOwner",
      {
        bookings: {
          push: true,
          email: true,
          types: ["new_booking_request"],
        },
      },
    );

    assert.deepEqual(preferences.bookings.types, []);
  } finally {
    Business.findById = originalFindById;
  }
});

test("legacy booking defaults allow booking_assigned notifications", () => {
  const preferences = notificationService.mergeNotificationPreferences({
    bookings: {
      push: true,
      email: true,
      types: [
        "new_booking_request",
        "provider_accepted",
        "booking_selected",
        "booking_cancelled",
        "booking_status_updated",
        "booking_taken",
        "counter_offer",
        "booking_completed_awaiting_acceptance",
      ],
    },
  });

  assert.deepEqual(preferences.bookings.types, []);
  assert.deepEqual(
    notificationService.shouldNotify(preferences, "booking_assigned"),
    { allowInApp: true, allowPush: true, allowEmail: true },
  );
});

test("existing enabled booking preferences allow newly added booking types", () => {
  const preferences = notificationService.mergeNotificationPreferences({
    bookings: {
      push: true,
      email: true,
      types: ["new_booking_request"],
    },
  });

  assert.deepEqual(
    notificationService.shouldNotify(preferences, "booking_assigned"),
    { allowInApp: true, allowPush: true, allowEmail: true },
  );
  assert.deepEqual(
    notificationService.shouldNotify(preferences, "product_order_updated"),
    { allowInApp: true, allowPush: true, allowEmail: true },
  );
});

test("business notifications use preferences and skip disabled booking types", async () => {
  const originals = {
    getPreferences: notificationService.getPreferences,
    createNotification: notificationService.createNotification,
    sendPushNotification: notificationService.sendPushNotification,
  };
  notificationService.getPreferences = async () => ({
    bookings: { push: false, email: false, types: [] },
  });
  notificationService.createNotification = async () => {
    assert.fail("disabled business preference should not create a notification");
  };
  notificationService.sendPushNotification = async () => {
    assert.fail("disabled business preference should not send a push");
  };

  try {
    assert.equal(
      await notificationService.notifyBusiness("business-id", {
        type: "product_order_updated",
      }),
      null,
    );
  } finally {
    Object.assign(notificationService, originals);
  }
});

test("campaign bonus notifications use promotions preferences and send a push", async () => {
  const originals = {
    getPreferences: notificationService.getPreferences,
    createNotification: notificationService.createNotification,
    sendPushNotification: notificationService.sendPushNotification,
  };
  const sentPushes = [];
  notificationService.getPreferences = async () =>
    notificationService.getDefaultPreferences();
  notificationService.createNotification = async (_userId, _model, data) => ({
    type: data.type,
  });
  notificationService.sendPushNotification = async (_userId, _model, data) => {
    sentPushes.push(data);
  };

  try {
    const notification = await notificationService.notifyUser("buyer-id", {
      type: "campaign_bonus_credited",
      title: "You won!",
      body: "Your promotional bonus has been credited.",
      campaignId: "campaign-id",
      creditId: "credit-id",
      amount: 500,
      expiresAt: new Date("2026-12-23T00:00:00.000Z"),
    });

    assert.equal(notification.type, "campaign_bonus_credited");
    assert.equal(sentPushes.length, 1);
    assert.equal(sentPushes[0].campaignId, "campaign-id");
    assert.equal(sentPushes[0].creditId, "credit-id");
    assert.equal(sentPushes[0].amount, 500);
  } finally {
    Object.assign(notificationService, originals);
  }
});
