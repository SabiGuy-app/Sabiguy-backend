const fcmRepository = require("./fcm.repository");
const notificationService = require("../../services/notification.service");

class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = "ValidationError";
  }
}

exports.ValidationError = ValidationError;

exports.registerFCMDevice = async (id, role, { fcmToken, deviceType, deviceId }) => {
  if (!fcmToken) {
    throw new ValidationError("FCM token is required");
  }

  const update = {
    fcmToken,
    "device.type": deviceType || "unknown",
    "device.id": deviceId,
    "device.updatedAt": new Date(),
  };

  await fcmRepository.updateFcmDeviceForRegister(id, role, update);
};

exports.removeToken = async (id, role) => {
  await fcmRepository.unsetFcmTokenForRemove(id, role);
};

exports.testNotification = async (id, role, { title, message }) => {
  const payload = {
    type: "test",
    title: title || "Test Notification",
    message: message || "This is a test notification",
  };

  if (role === "provider") {
    await notificationService.notifyProvider(id, payload);
  } else {
    await notificationService.notifyUser(id, payload);
  }
};
