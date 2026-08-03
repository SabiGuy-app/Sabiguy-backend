const notificationsRepository = require("./notifications.repository");
const notificationService = require("../../services/notification.service.js");

class NotFoundError extends Error {
  constructor(message) {
    super(message);
    this.name = "NotFoundError";
  }
}

class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = "ValidationError";
  }
}

exports.NotFoundError = NotFoundError;
exports.ValidationError = ValidationError;

const DEFAULT_PREFERENCES = {
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
      "booking_auto_completed"
    ],
  },
  jobCompleted: {
    push: true,
    email: true,
    types: ["job_started", "booking_completed", "job_completed_confirmed"],
  },
  chatMessages: {
    push: true,
    email: false,
    types: ["new_message", "message_received"],
  },
  walletPayments: {
    push: true,
    email: true,
    types: ["wallet_funded", "wallet_payment", "payment_received", "payment_sent"],
  },
  promotions: {
    push: false,
    email: false,
    types: ["test"],
  },
};

exports.getNotifications = async (userId, { page = 1, limit = 20, type }) => {
  const pageNum = parseInt(page);
  const limitNum = parseInt(limit);
  const skip = (pageNum - 1) * limitNum;

  const query = { recipient: userId };
  if (type) {
    query.type = type;
  }

  const notifications = await notificationsRepository.findNotifications(query, {
    limit: limitNum,
    skip,
  });
  const total = await notificationsRepository.countNotifications(query);
  const unreadCount = await notificationsRepository.countUnread(userId);

  return {
    notifications,
    pagination: {
      page: pageNum,
      limit: limitNum,
      total,
      pages: Math.ceil(total / limitNum),
    },
    unreadCount,
  };
};

exports.markAsRead = async (notificationId, userId) => {
  const notification = await notificationsRepository.markOneAsRead(
    notificationId,
    userId,
  );

  if (!notification) {
    throw new NotFoundError("Notification not found");
  }

  return notification;
};

exports.markAllAsRead = async (userId) => {
  const result = await notificationsRepository.markAllAsRead(userId);
  return result.modifiedCount;
};

exports.deleteNotification = async (notificationId, userId) => {
  const notification = await notificationsRepository.deleteOne(
    notificationId,
    userId,
  );

  if (!notification) {
    throw new NotFoundError("Notification not found");
  }
};

exports.getUnreadCount = (userId) => notificationsRepository.countUnread(userId);

exports.getNotificationPreferences = async (userId, role) => {
  const user = await notificationsRepository.findUserPreferences(role, userId);

  if (!user) {
    throw new NotFoundError("User not found");
  }

  return notificationService.mergeNotificationPreferences(
    user.notificationPreferences,
  );
};

exports.updateNotificationPreferences = async (
  userId,
  role,
  notificationPreferences,
) => {
  if (!notificationPreferences || typeof notificationPreferences !== "object") {
    throw new ValidationError("notificationPreferences is required");
  }

  const user = await notificationsRepository.findUserPreferences(role, userId);

  if (!user) {
    throw new NotFoundError("User not found");
  }

  const current = notificationService.mergeNotificationPreferences(
    user.notificationPreferences,
  );
  const merged = { ...current };

  Object.keys(DEFAULT_PREFERENCES).forEach((key) => {
    if (!notificationPreferences[key]) return;
    const incoming = notificationPreferences[key];
    const base = current[key];

    merged[key] = {
      push: typeof incoming.push === "boolean" ? incoming.push : base.push,
      email: typeof incoming.email === "boolean" ? incoming.email : base.email,
      types: Array.isArray(incoming.types) ? incoming.types : base.types,
    };
  });

  user.notificationPreferences = merged;
  await notificationsRepository.saveUser(user);

  return merged;
};
