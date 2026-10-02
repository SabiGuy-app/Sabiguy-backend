const test = require("node:test");
const assert = require("node:assert/strict");

const {
  bookingIntervalsOverlap,
  getBookingInterval,
  getPaidBookingStatus,
} = require("../src/modules/bookings/booking-scheduling.service");

test("paid scheduled bookings use a distinct escrow status", () => {
  assert.equal(
    getPaidBookingStatus({ scheduleType: "scheduled" }),
    "paid_escrow_scheduled",
  );
  assert.equal(
    getPaidBookingStatus({ scheduleType: "immediate" }),
    "paid_escrow",
  );
});

test("scheduled interval uses the explicit service window", () => {
  const interval = getBookingInterval(
    {
      scheduleType: "scheduled",
      startDate: new Date("2030-05-06T10:00:00.000Z"),
      endDate: new Date("2030-05-06T11:30:00.000Z"),
    },
    "provider-1",
  );

  assert.equal(interval.start.toISOString(), "2030-05-06T10:00:00.000Z");
  assert.equal(interval.end.toISOString(), "2030-05-06T11:30:00.000Z");
});

test("scheduled interval falls back to estimated duration", () => {
  const interval = getBookingInterval(
    {
      scheduleType: "scheduled",
      scheduleDate: "2030-05-06",
      scheduledTime: "3:15 PM",
    },
    "provider-1",
  );

  assert.equal(interval.start.toISOString(), "2030-05-06T14:15:00.000Z");
  assert.equal((interval.end - interval.start) / 60000, 60);
});

test("booking intervals overlap only when their time ranges intersect", () => {
  const first = {
    start: new Date("2030-05-06T10:00:00.000Z"),
    end: new Date("2030-05-06T11:00:00.000Z"),
  };

  assert.equal(
    bookingIntervalsOverlap(first, {
      start: new Date("2030-05-06T10:30:00.000Z"),
      end: new Date("2030-05-06T11:30:00.000Z"),
    }),
    true,
  );
  assert.equal(
    bookingIntervalsOverlap(first, {
      start: new Date("2030-05-06T11:00:00.000Z"),
      end: new Date("2030-05-06T12:00:00.000Z"),
    }),
    false,
  );
});
