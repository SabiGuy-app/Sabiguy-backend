const cron = require("node-cron");
const Booking = require("./Bookings.model");
const {
  BOOKING_ACCEPTANCE_WINDOW_MS,
} = require("./booking-expiry.config");
const { notifyBookingExpiry } = require("./booking-expiry.notification");

const expireBookings = async (filter, status, now) => {
  const expiredBookings = [];

  while (true) {
    const booking = await Booking.findOneAndUpdate(
      filter,
      { $set: { status, expiredAt: now } },
      { new: true },
    );

    if (!booking) break;
    expiredBookings.push(booking);
  }

  return expiredBookings;
};

const expireOverdueBookings = async (now = new Date()) => {
  const acceptanceDeadline = new Date(
    now.getTime() - BOOKING_ACCEPTANCE_WINDOW_MS,
  );

  const [acceptanceBookings, paymentBookings] = await Promise.all([
    expireBookings(
      {
        status: { $in: ["pending_providers", "awaiting_provider_acceptance"] },
        createdAt: { $lte: acceptanceDeadline },
      },
      "booking_expired",
      now,
    ),
    expireBookings(
      {
        status: {
          $in: ["provider_selected", "provider_accepted", "payment_pending"],
        },
        $or: [
          { paymentDeadlineAt: { $lte: now } },
          {
            paymentDeadlineAt: { $exists: false },
            selectedAt: { $lte: acceptanceDeadline },
          },
          {
            paymentDeadlineAt: { $exists: false },
            acceptedAt: { $lte: acceptanceDeadline },
          },
        ],
      },
      "expired",
      now,
    ),
  ]);

  await Promise.all([
    ...acceptanceBookings.map(notifyBookingExpiry),
    ...paymentBookings.map(notifyBookingExpiry),
  ]);

  return {
    acceptanceExpired: acceptanceBookings.length,
    paymentExpired: paymentBookings.length,
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
