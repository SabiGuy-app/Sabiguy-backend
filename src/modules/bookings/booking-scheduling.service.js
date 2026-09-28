const Booking = require("./Bookings.model.js");

const DEFAULT_BOOKING_DURATION_MINUTES = Math.max(
  Number(process.env.SCHEDULED_BOOKING_DEFAULT_DURATION_MINUTES || 60),
  1,
);

const PROVIDER_BLOCKING_STATUSES = [
  "awaiting_provider_acceptance",
  "provider_selected",
  "provider_accepted",
  "payment_pending",
  "paid_escrow",
  "paid_escrow_scheduled",
  "in_progress",
  "arrived_at_pickup",
  "enroute_to_dropoff",
  "arrived_at_dropoff",
];

const parseScheduledTime = (time) => {
  if (!time) return null;
  const normalized = String(time)
    .trim()
    .match(/^(\d{1,2}):(\d{2})(?:\s*(AM|PM))?$/i);
  if (!normalized) return null;

  let hours = Number(normalized[1]);
  const minutes = Number(normalized[2]);
  const meridiem = normalized[3]?.toUpperCase();
  if (minutes > 59 || hours > (meridiem ? 12 : 23)) return null;
  if (meridiem) {
    if (hours < 1) return null;
    hours = (hours % 12) + (meridiem === "PM" ? 12 : 0);
  }

  return { hours, minutes };
};

const getScheduledStartAt = (booking) => {
  if (booking?.scheduledStartAt) {
    const storedStart = new Date(booking.scheduledStartAt);
    if (!Number.isNaN(storedStart.getTime())) return storedStart;
  }

  const dateValue = booking?.startDate || booking?.scheduleDate;
  if (!dateValue) return null;

  const start = new Date(dateValue);
  if (Number.isNaN(start.getTime())) return null;

  const time = booking.startDate
    ? null
    : parseScheduledTime(booking.scheduledTime);
  if (time) start.setUTCHours(time.hours - 1, time.minutes, 0, 0);

  return start;
};

const getBookingDurationMinutes = (booking, providerId) => {
  const providerDistance = booking?.providerDistances?.find(
    (item) => String(item.providerId) === String(providerId),
  );
  const providerEta = Number(providerDistance?.providerETAMinutes || 0);
  const duration = Number(
    booking?.bookingDuration?.value ?? booking?.estimatedDuration?.value ?? 0,
  );
  const totalDuration =
    duration + (booking?.bookingDuration?.value ? 0 : providerEta);

  return Number.isFinite(totalDuration) && totalDuration > 0
    ? totalDuration
    : DEFAULT_BOOKING_DURATION_MINUTES;
};

const getBookingInterval = (booking, providerId, now = new Date()) => {
  const scheduledStart = getScheduledStartAt(booking);
  if (booking?.scheduleType === "scheduled" || scheduledStart) {
    if (!scheduledStart) return null;

    const explicitEnd = booking.endDate ? new Date(booking.endDate) : null;
    const end =
      explicitEnd && explicitEnd > scheduledStart
        ? explicitEnd
        : new Date(
            scheduledStart.getTime() +
              getBookingDurationMinutes(booking, providerId) * 60 * 1000,
          );

    return { start: scheduledStart, end };
  }

  let start = new Date(
    booking?.startedAt ||
      booking?.acceptedAt ||
      booking?.selectedAt ||
      booking?.createdAt ||
      now,
  );
  if (Number.isNaN(start.getTime()) || start < now) start = new Date(now);

  const estimatedEnd = booking?.estimatedCompletionAt
    ? new Date(booking.estimatedCompletionAt)
    : null;
  const end =
    estimatedEnd && estimatedEnd > start
      ? estimatedEnd
      : new Date(
          start.getTime() +
            getBookingDurationMinutes(booking, providerId) * 60 * 1000,
        );

  return { start, end };
};

const bookingIntervalsOverlap = (first, second) =>
  first.start < second.end && second.start < first.end;

const findProviderScheduleConflict = async (
  providerId,
  candidateBooking,
  { excludeBookingId } = {},
) => {
  const candidateInterval = getBookingInterval(candidateBooking, providerId);
  if (!candidateInterval) return null;

  const query = {
    providerId,
    status: { $in: PROVIDER_BLOCKING_STATUSES },
  };
  if (excludeBookingId || candidateBooking?._id) {
    query._id = { $ne: excludeBookingId || candidateBooking._id };
  }

  const bookings = await Booking.find(query)
    .select(
      "scheduleType scheduledStartAt scheduleDate scheduledTime startDate endDate bookingDuration estimatedDuration providerDistances estimatedCompletionAt startedAt acceptedAt selectedAt createdAt status",
    )
    .lean();

  return (
    bookings.find((booking) => {
      const interval = getBookingInterval(booking, providerId);
      return interval && bookingIntervalsOverlap(candidateInterval, interval);
    }) || null
  );
};

const getPaidBookingStatus = (booking) =>
  booking?.scheduleType === "scheduled"
    ? "paid_escrow_scheduled"
    : "paid_escrow";

module.exports = {
  DEFAULT_BOOKING_DURATION_MINUTES,
  bookingIntervalsOverlap,
  findProviderScheduleConflict,
  getBookingInterval,
  getBookingDurationMinutes,
  getPaidBookingStatus,
  getScheduledStartAt,
};
