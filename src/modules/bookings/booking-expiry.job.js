const cron = require("node-cron");
const Booking = require("./Bookings.model");
const {
  BOOKING_ACCEPTANCE_WINDOW_MS,
} = require("./booking-expiry.config");

const expireOverdueBookings = async (now = new Date()) => {
  const acceptanceDeadline = new Date(
    now.getTime() - BOOKING_ACCEPTANCE_WINDOW_MS,
  );

  const [acceptanceResult, paymentResult] = await Promise.all([
    Booking.updateMany(
      {
        status: { $in: ["pending_providers", "awaiting_provider_acceptance"] },
        createdAt: { $lte: acceptanceDeadline },
      },
      {
        $set: {
          status: "booking_expired",
          expiredAt: now,
        },
      },
    ),
    Booking.updateMany(
      {
        status: {
          $in: ["provider_selected", "provider_accepted", "payment_pending"],
        },
        paymentDeadlineAt: { $lte: now },
      },
      {
        $set: {
          status: "expired",
          expiredAt: now,
        },
      },
    ),
  ]);

  return {
    acceptanceExpired: acceptanceResult.modifiedCount,
    paymentExpired: paymentResult.modifiedCount,
  };
};

const runBookingExpiryJob = async () => {
  try {
    const result = await expireOverdueBookings();
    if (result.acceptanceExpired || result.paymentExpired) {
      console.log(
        `Expired bookings: ${result.acceptanceExpired} acceptance, ${result.paymentExpired} payment.`,
      );
    }
  } catch (error) {
    console.error("Booking expiry job failed:", error);
  }
};

const startBookingExpiryJob = () => {
  void runBookingExpiryJob();
  return cron.schedule("* * * * *", runBookingExpiryJob);
};

module.exports = {
  expireOverdueBookings,
  startBookingExpiryJob,
};
