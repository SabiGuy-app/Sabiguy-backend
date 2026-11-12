const test = require("node:test");
const assert = require("node:assert/strict");

const notificationService = require("../src/services/notification.service");
const notificationsRepository = require("../src/modules/notifications/notifications.repository");
const notificationsModule = require("../src/modules/notifications/notifications.service");

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

test("custom booking preferences can still exclude booking_assigned", () => {
  const preferences = notificationService.mergeNotificationPreferences({
    bookings: {
      push: true,
      email: true,
      types: ["new_booking_request"],
    },
  });

  assert.deepEqual(
    notificationService.shouldNotify(preferences, "booking_assigned"),
    { allowInApp: false, allowPush: false, allowEmail: false },
  );
});
