const test = require("node:test");
const assert = require("node:assert/strict");

const notificationService = require("../src/services/notification.service");

const BUSINESS_ID = "64b000000000000000000001";

test("getRecipientRoom matches the socket rooms joined in src/index.js", () => {
  assert.equal(
    notificationService.getRecipientRoom("Business", BUSINESS_ID),
    `businessOwner:${BUSINESS_ID}`,
  );
  assert.equal(notificationService.getRecipientRoom("Provider", "p1"), "provider:p1");
  assert.equal(notificationService.getRecipientRoom("Buyer", "b1"), "buyer:b1");
});

test("notifyBusiness emits in real time to the businessOwner room", async () => {
  const originals = {
    io: notificationService.io,
    createNotification: notificationService.createNotification,
    sendPushNotification: notificationService.sendPushNotification,
  };
  const emitted = [];
  const notification = { _id: "n1", type: "staff_clock_in_requested" };
  notificationService.io = {
    to(room) {
      return { emit: (event, payload) => emitted.push({ room, event, payload }) };
    },
  };
  notificationService.createNotification = async () => notification;
  notificationService.sendPushNotification = async () => {};

  try {
    await notificationService.notifyBusiness(BUSINESS_ID, {
      type: "staff_clock_in_requested",
      message: "test",
    });
    assert.deepEqual(emitted, [
      {
        room: `businessOwner:${BUSINESS_ID}`,
        event: "new_notification",
        payload: notification,
      },
    ]);
  } finally {
    Object.assign(notificationService, originals);
  }
});
