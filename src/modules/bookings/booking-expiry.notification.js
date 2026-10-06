const notificationService = require("../../services/notification.service");

const notifyBookingExpiry = async (booking) => {
  const paymentExpired = booking.status === "expired";
  const userData = {
    type: "booking_status_updated",
    title: paymentExpired ? "Payment Window Expired" : "Booking Expired",
    message: paymentExpired
      ? "The payment window for this booking has expired. Please create a new booking if you still need this service."
      : "No provider accepted this booking within the allowed time. Please create a new booking to try again.",
    bookingId: booking._id,
  };

  const notifications = [
    notificationService.notifyUser(booking.userId, userData),
  ];

  // A booking with no accepted provider has no provider party to notify.
  if (booking.providerId) {
    const providerData = {
      type: "booking_status_updated",
      title: "Booking Expired",
      message: paymentExpired
        ? "This booking expired because the customer did not complete payment in time. It is no longer active."
        : "This booking expired before a provider accepted it. It is no longer active.",
      bookingId: booking._id,
    };
    notifications.push(
      notificationService.notifyProvider(booking.providerId, providerData),
    );
  }

  const results = await Promise.allSettled(notifications);
  results.forEach((result) => {
    if (result.status === "rejected") {
      console.error("Failed to send booking expiry notification:", result.reason);
    }
  });
};

module.exports = { notifyBookingExpiry };
