const Notification = require("./notification.model");
const Buyer = require("../../../models/ServiceUser");
const Provider = require("../../../models/ServiceProvider");

const modelForRole = (role) => (role === "provider" ? Provider : Buyer);

exports.findNotifications = (query, { limit, skip }) =>
  Notification.find(query)
    .sort({ createdAt: -1 })
    .limit(limit)
    .skip(skip)
    .populate("data.bookingId", "serviceType status createdAt");

exports.countNotifications = (query) => Notification.countDocuments(query);

exports.countUnread = (recipient) =>
  Notification.countDocuments({ recipient, isRead: false });

exports.markOneAsRead = (notificationId, recipient) =>
  Notification.findOneAndUpdate(
    { _id: notificationId, recipient },
    { isRead: true, readAt: new Date() },
    { new: true },
  );

exports.markAllAsRead = (recipient) =>
  Notification.updateMany(
    { recipient, isRead: false },
    { isRead: true, readAt: new Date() },
  );

exports.deleteOne = (notificationId, recipient) =>
  Notification.findOneAndDelete({ _id: notificationId, recipient });

exports.findUserPreferences = (role, userId) =>
  modelForRole(role).findById(userId).select("notificationPreferences");

exports.saveUser = (user) => user.save();
