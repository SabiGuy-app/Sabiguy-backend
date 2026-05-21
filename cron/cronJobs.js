/**
 * Cron Jobs Handler
 * This file is run by PM2 as a separate process to handle all scheduled tasks
 */

require("dotenv").config();
const cron = require("node-cron");
const connectToDB = require("../utils/db");
const Booking = require("../models/Bookings");
const notificationService = require("./notificationService");
const paymentService = require("../src/services/payment.service");

// Connect to database
connectToDB().catch((err) => {
  console.error("Failed to connect to database:", err);
  process.exit(1);
});

console.log(`[${new Date().toISOString()}] Cron jobs service started`);

function getBookingLabel(booking) {
  return (
    booking?.title ||
    booking?.serviceType ||
    booking?.subCategory ||
    `Booking ${booking?._id || ""}`
  );
}

function getProviderName(provider) {
  return (
    provider?.fullName ||
    provider?.BusinessName ||
    provider?.jobTitle ||
    provider?.service ||
    provider?.email ||
    "Provider"
  );
}

/**
 * BOOKING COMPLETION WORKFLOW
 *
 * Cron job to send completion notifications every 30 minutes
 * Checks for bookings with status 'completed' but not yet 'user_accepted_completion' or 'disputed'
 * Sends notifications to users asking them to accept completion or dispute
 *
 * Cron pattern: (every 30 minutes)
 */
cron.schedule("*/30 * * * *", async () => {
  try {
    console.log(
      `[${new Date().toISOString()}] Running: Send booking completion notifications`,
    );

    const oneMinuteAgo = new Date(Date.now() - 1 * 60 * 1000);
  const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000); // back to 30 mins

    // Find bookings that are 'completed' but not accepted or disputed
    const pendingCompletionBookings = await Booking.find({
      status: "completed",
      completedAt: { $exists: true, $lte: oneMinuteAgo }, // Only notify if completed more than 1 minute ago
      disputeRaisedAt: { $exists: false },
      $or: [
        { lastNotifiedAt: { $exists: false } },
        { lastNotifiedAt: { $lte: thirtyMinutesAgo } },
      ],
    }).populate("userId providerId");

    console.log(
      `Found ${pendingCompletionBookings.length} bookings pending user action`,
    );

    for (const booking of pendingCompletionBookings) {
      try {
        const bookingLabel = getBookingLabel(booking);
        const providerName = getProviderName(booking.providerId);

        // Send notification to user about job completion
        await notificationService.notifyUser(booking.userId._id, {
          type: "booking_completed_awaiting_acceptance",
          title: "Job Completed",
          body: `Your "${bookingLabel}" booking has been completed by the provider. Please accept the completion or raise a dispute if needed.`,
          bookingId: booking._id,
          bookingTitle: bookingLabel,
          providerId: booking.providerId._id,
          providerName,
          action: "ACCEPT_COMPLETION",
        });

        booking.lastNotifiedAt = new Date();
        await booking.save();

        console.log(
          `✓ Notification sent to user ${booking.userId._id} for booking ${booking._id}`,
        );
      } catch (error) {
        console.error(
          `✗ Error sending notification for booking ${booking._id}:`,
          error.message,
        );
      }
    }
  } catch (error) {
    console.error(
      "Error in booking completion notifications cron:",
      error.message,
    );
  }
});

/**
 * AUTO-COMPLETE BOOKING AFTER 10 HOURS
 *
 * Cron job that runs every 2 hours to check for bookings that:
 * - Were marked as 'completed' more than 10 hours ago
 * - Have NOT been marked as 'user_accepted_completion' or 'disputed'
 * - Auto-marks them as 'user_accepted_completion' and sends notifications to both provider and user
 *
 * Cron pattern:(every 2 hours)
 */
cron.schedule("0 */2 * * *", async () => {
  try {
    console.log(
      `[${new Date().toISOString()}] Running: Auto-complete bookings after 10 hours`,
    );

    // Calculate 10 hours ago from now
    const twelveHoursAgo = new Date(Date.now() - 12 * 60 * 60 * 1000);

    // Find bookings that meet the criteria
    const autoCompleteBookings = await Booking.find({
      status: "completed",
      completedAt: { $lte: twelveHoursAgo, $exists: true },
      disputeRaisedAt: { $exists: false },
    })
      .populate("userId", "fullName deviceTokens")
      .populate("providerId", "fullName email deviceTokens");

    console.log(
      `Found ${autoCompleteBookings.length} bookings to auto-complete`,
    );

    for (const booking of autoCompleteBookings) {
      try {
        const userId = booking.userId._id;
        const providerId = booking.providerId._id;
        const bookingLabel = getBookingLabel(booking);
        const providerName = getProviderName(booking.providerId);

        // Update booking status to user_accepted_completion
        booking.status = "user_accepted_completion";
        await booking.save();

        // Release escrow to provider (same as acceptJobCompleted endpoint)
        let escrowReleased = false;
        try {
          await paymentService.releaseEscrow(booking._id, userId);
          escrowReleased = true;
          console.log(`✅ Escrow released for booking ${booking._id}`);
        } catch (escrowErr) {
          console.error(
            `❌ Failed to release escrow for booking ${booking._id}:`,
            escrowErr.message,
          );
        }

        // Notify user that booking was auto-completed
        await notificationService.notifyUser(userId, {
          type: "booking_auto_completed",
          title: "Job Auto-Completed",
          body: `Your booking "${bookingLabel}" was automatically marked as completed after 12 hours with no dispute. Funds have been released to the provider.`,
          bookingId: booking._id,
          bookingTitle: bookingLabel,
          status: "user_accepted_completion",
        });

        // Notify provider that booking was auto-completed and funds are released
        await notificationService.notifyProvider(providerId, {
          type: "booking_auto_completed",
          title: "Job Confirmed & Funds Released",
          body: `Your booking "${bookingLabel}" was automatically confirmed after 10 hours. The user did not dispute it, and funds have been released to your wallet.`,
          bookingId: booking._id,
          bookingTitle: bookingLabel,
          amount: booking.providerReceives,
          providerName,
          status: "funds_released",
          escrowReleased,
        });

        console.log(
          `✓ Auto-completed booking ${booking._id} and notified both parties`,
        );
      } catch (error) {
        console.error(
          `✗ Error auto-completing booking ${booking._id}:`,
          error.message,
        );
      }
    }
  } catch (error) {
    console.error("Error in auto-complete bookings cron:", error.message);
  }
});

// Graceful shutdown
process.on("SIGTERM", () => {
  console.log("SIGTERM received. Shutting down gracefully...");
  process.exit(0);
});

process.on("SIGINT", () => {
  console.log("SIGINT received. Shutting down gracefully...");
  process.exit(0);
});
