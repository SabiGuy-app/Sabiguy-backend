const cron = require("node-cron");
const Booking = require("./Bookings.model");
const { BOOKING_ACCEPTANCE_WINDOW_MS } = require("./booking-expiry.config");
const { notifyBookingExpiry } = require("./booking-expiry.notification");
const notificationService = require("../../services/notification.service");
const { getScheduledStartAt } = require("./booking-scheduling.service");

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

const processScheduledBookings = async (now = new Date()) => {
  const bookings = await Booking.find({
    scheduleType: "scheduled",
    status: "paid_escrow_scheduled",
    providerId: { $ne: null },
  })
    .select(
      "scheduleType scheduleDate scheduledTime startDate endDate providerId serviceType scheduledReminder10SentAt scheduledReminder5SentAt",
    )
    .lean();

  let activated = 0;
  let remindersSent = 0;

  for (const booking of bookings) {
    const scheduledStart = getScheduledStartAt(booking);
    if (!scheduledStart) continue;

    if (scheduledStart <= now) {
      const updated = await Booking.findOneAndUpdate(
        { _id: booking._id, status: "paid_escrow_scheduled" },
        { $set: { status: "paid_escrow" } },
        { new: true },
      );
      if (updated) activated += 1;
      continue;
    }

    const minutesUntilStart =
      (scheduledStart.getTime() - now.getTime()) / 60000;
    const reminders = [
      {
        minutes: 10,
        field: "scheduledReminder10SentAt",
        windowStart: 5,
      },
      {
        minutes: 5,
        field: "scheduledReminder5SentAt",
        windowStart: 0,
      },
    ];

    for (const reminder of reminders) {
      if (
        minutesUntilStart > reminder.minutes ||
        minutesUntilStart <= reminder.windowStart ||
        booking[reminder.field]
      ) {
        continue;
      }

      const claimed = await Booking.findOneAndUpdate(
        {
          _id: booking._id,
          status: "paid_escrow_scheduled",
          [reminder.field]: null,
        },
        { $set: { [reminder.field]: now } },
        { new: true },
      );
      if (!claimed) continue;

      try {
        await notificationService.notifyProvider(booking.providerId, {
          type: "booking_status_updated",
          title: `Scheduled booking in ${reminder.minutes} minutes`,
          message: `Your ${booking.serviceType} booking is scheduled to start in about ${reminder.minutes} minutes.`,
          bookingId: booking._id,
          scheduledStartAt: scheduledStart,
        });
        remindersSent += 1;
      } catch (error) {
        await Booking.updateOne(
          { _id: booking._id },
          { $set: { [reminder.field]: null } },
        );
        console.error(
          `Scheduled reminder failed for booking ${booking._id}:`,
          error.message,
        );
      }
    }
  }

  return { activated, remindersSent };
};

const runBookingExpiryJob = async () => {
  try {
    const [expiryResult, scheduledResult] = await Promise.all([
      expireOverdueBookings(),
      processScheduledBookings(),
    ]);
    if (
      expiryResult.acceptanceExpired ||
      expiryResult.paymentExpired ||
      scheduledResult.activated ||
      scheduledResult.remindersSent
    ) {
      console.log(
        `Booking job: ${expiryResult.acceptanceExpired} acceptance expired, ${expiryResult.paymentExpired} payment expired, ${scheduledResult.activated} scheduled activated, ${scheduledResult.remindersSent} reminders sent.`,
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
  processScheduledBookings,
  startBookingExpiryJob,
};
