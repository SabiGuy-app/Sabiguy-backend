const notificationService = require("../../services/notification.service");

const notifyBookingExpiry = async (booking) => {
  const paymentExpired = booking.status === "expired";
  const title = paymentExpired ? "Payment Window Expired" : "Booking Expired";
  const message = paymentExpired
    ? "The payment window for this booking has expired. Please create a new booking."
    : "No provider accepted this booking within the allowed time. Please create a new booking.";
  const data = {
    type: "booking_status_updated",
    title,
    message,
    bookingId: booking._id,
  };

  const notifications = [notificationService.notifyUser(booking.userId, data)];

  // A booking with no accepted provider has no provider party to notify.
  if (booking.providerId) {
    notifications.push(notificationService.notifyProvider(booking.providerId, data));
  }

  const results = await Promise.allSettled(notifications);
  results.forEach((result) => {
    if (result.status === "rejected") {
      console.error("Failed to send booking expiry notification:", result.reason);
    }
  });
};

module.exports = { notifyBookingExpiry };
