const mongoose = require('mongoose');

const Booking = require('../bookings/Bookings.model');
const Notification = require('../notifications/notification.model');
const { getStaffOnDuty } = require('./staff.service');
const { ValidationError } = require('./business.service');

const DEFAULT_ACTIVITY_LIMIT = 10;
const MAX_ACTIVITY_LIMIT = 50;

const startOfToday = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};

// KPI cards for the business overview.
const getDashboardStats = async (businessId) => {
  if (!mongoose.isValidObjectId(businessId)) {
    throw new ValidationError('Invalid business ID');
  }

  const today = startOfToday();

  const [
    bookingsTodayTotal,
    bookingsTodayCompleted,
    activeBookingsTotal,
    [ratingAgg],
    onDuty,
  ] = await Promise.all([
    Booking.countDocuments({ businessId, createdAt: { $gte: today } }),
    Booking.countDocuments({
      businessId,
      createdAt: { $gte: today },
      businessStatus: 'completed',
    }),
    Booking.countDocuments({
      businessId,
      businessStatus: { $in: ['assigned', 'in_progress'] },
    }),
    Booking.aggregate([
      {
        $match: {
          businessId: new mongoose.Types.ObjectId(businessId),
          'rating.score': { $gt: 0 },
        },
      },
      {
        $group: {
          _id: null,
          average: { $avg: '$rating.score' },
          count: { $sum: 1 },
        },
      },
    ]),
    getStaffOnDuty(businessId),
  ]);

  const onRoad = onDuty.staff.filter((s) => s.workStatus === 'booked').length;
  const onSite = onDuty.staff.filter(
    (s) => s.workStatus === 'in_service',
  ).length;

  return {
    earnedToday: null,
    bookingsToday: {
      total: bookingsTodayTotal,
      completed: bookingsTodayCompleted,
      scheduled: Math.max(bookingsTodayTotal - bookingsTodayCompleted, 0),
    },
    activeBookings: { total: activeBookingsTotal },
    activeStaff: { total: onRoad + onSite, onRoad, onSite },
    rating: {
      average: ratingAgg?.average ? Math.round(ratingAgg.average * 10) / 10 : 0,
      count: ratingAgg?.count || 0,
    },
  };
};

// Live activity feed for the business, sourced from its Notification docs.
const getDashboardActivity = async (businessId, options = {}) => {
  if (!mongoose.isValidObjectId(businessId)) {
    throw new ValidationError('Invalid business ID');
  }

  const raw = Number.parseInt(options.limit, 10);
  const limit =
    Number.isFinite(raw) && raw > 0
      ? Math.min(raw, MAX_ACTIVITY_LIMIT)
      : DEFAULT_ACTIVITY_LIMIT;

  const docs = await Notification.find({
    recipient: businessId,
    recipientModel: 'Business',
  })
    .sort({ createdAt: -1 })
    .limit(limit);

  return {
    count: docs.length,
    activities: docs.map((n) => ({
      id: n._id,
      type: n.type,
      title: n.title,
      message: n.message,
      bookingId: n.data?.bookingId ?? null,
      isRead: n.isRead,
      createdAt: n.createdAt,
    })),
  };
};

module.exports = {
  getDashboardStats,
  getDashboardActivity,
};
