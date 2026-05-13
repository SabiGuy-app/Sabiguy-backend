# Booking Completion Workflow - Cron Jobs Guide

## Overview

This document explains the cron jobs that handle the booking completion workflow, ensuring users are notified to accept or dispute job completion, with automatic completion after 10 hours of inactivity.

## Cron Jobs

### 1. Send Booking Completion Notifications (Every 30 Minutes)

**Schedule:** `*/30 * * * *` (every 30 minutes)

**What it does:**

- Finds all bookings with status `completed` that are NOT yet `user_accepted_completion` or `disputed`
- Sends a notification to the user asking them to either:
  - Accept the job completion
  - Raise a dispute if there's an issue

**Notification includes:**

- Job title
- Provider name
- Action button to accept or dispute
- Link to the booking details

**Why every 30 minutes?**

- Ensures users get reminded frequently about pending action
- Gives users multiple opportunities to respond
- Not too frequent to cause notification spam

### 2. Auto-Complete Booking After 10 Hours (Every 2 Hours Check)

**Schedule:** `0 */2 * * *` (every 2 hours)

**What it does:**

- Finds bookings that:
  - Were marked as `completed` MORE than 10 hours ago
  - Have NOT been marked as `user_accepted_completion`
  - Have NO dispute raised (`disputeRaisedAt` is null)
- Auto-updates their status to `user_accepted_completion`
- Sends notifications to BOTH user and provider:
  - **User:** "Your job was auto-completed after 10 hours with no dispute"
  - **Provider:** "Funds have been released to your wallet"

**Why every 2 hours?**

- Efficient database queries - doesn't need to run very frequently
- Captures the 10-hour window accurately
- Reduces server load while maintaining accuracy

## Database Queries

### Query 1: Pending Completion Notifications

```javascript
{
  status: "completed",
  completedAt: { $exists: true },
  disputeRaisedAt: { $exists: false },
  $nor: [{ status: "user_accepted_completion" }]
}
```

**Explanation:**

- Finds bookings where job is completed
- But user hasn't accepted yet
- And no dispute has been raised

### Query 2: Auto-Complete Eligibility

```javascript
{
  status: "completed",
  completedAt: { $lte: tenHoursAgo, $exists: true },
  disputeRaisedAt: { $exists: false }
}
```

**Explanation:**

- `completedAt` is MORE than 10 hours ago
- No dispute has been raised

## Booking Status Flow

```
in_progress
    ↓
completed (marked by provider/system)
    ↓
[User has 10 hours to dispute or accept]
    ├─ If user accepts → user_accepted_completion
    ├─ If user disputes → disputed
    └─ If 10 hours pass with no action → user_accepted_completion (AUTO)
    ↓
funds_released (payment released to provider)
```

## Notification Data Structure

### Completion Reminder Notification (User)

```javascript
{
  type: "booking_completed_awaiting_acceptance",
  title: "Job Completed",
  body: "Your booking 'Service Title' has been completed...",
  bookingId: "...",
  bookingTitle: "Service Title",
  providerId: "...",
  providerName: "Provider Name",
  action: "ACCEPT_COMPLETION"
}
```

### Auto-Complete Notification (User)

```javascript
{
  type: "booking_auto_completed",
  title: "Job Auto-Completed",
  body: "Your booking was automatically confirmed after 10 hours...",
  bookingId: "...",
  bookingTitle: "Service Title",
  status: "user_accepted_completion"
}
```

### Auto-Complete Notification (Provider)

```javascript
{
  type: "booking_auto_completed",
  title: "Job Confirmed & Funds Released",
  body: "Your booking was automatically confirmed. Funds released to wallet.",
  bookingId: "...",
  bookingTitle: "Service Title",
  amount: 5000, // providerReceives
  status: "funds_released"
}
```

## Integration Steps

### 1. Frontend - User Action Handlers

You need endpoints to handle user acceptance/dispute:

```javascript
// POST /api/bookings/:bookingId/accept-completion
app.post(
  "/api/bookings/:bookingId/accept-completion",
  authMiddleware,
  async (req, res) => {
    const booking = await Booking.findById(req.params.bookingId);
    booking.status = "user_accepted_completion";
    await booking.save();

    // Release funds to provider
    // Trigger payment release logic

    res.json({ success: true, message: "Booking completed" });
  },
);

// POST /api/bookings/:bookingId/dispute
app.post(
  "/api/bookings/:bookingId/dispute",
  authMiddleware,
  async (req, res) => {
    const { reason } = req.body;
    const booking = await Booking.findById(req.params.bookingId);
    booking.status = "disputed";
    booking.disputeRaisedAt = new Date();
    booking.disputeRaisedBy = req.user._id;
    booking.disputeReason = reason;
    await booking.save();

    // Notify provider about dispute

    res.json({ success: true, message: "Dispute raised" });
  },
);
```

### 2. Database Indexes

The cron jobs use these queries, so ensure these indexes exist:

```javascript
// In Bookings.js model - Already exist!
bookingSchema.index({ status: 1 });
bookingSchema.index({ userId: 1, status: 1 });
bookingSchema.index({ providerId: 1, status: 1 });
// Consider adding for performance:
bookingSchema.index({ completedAt: 1, status: 1 });
bookingSchema.index({ disputeRaisedAt: 1 });
```

### 3. Custom Cron Jobs

To add more jobs, edit `cron/cronJobs.js`:

```javascript
/**
 * Your custom cron job
 * Cron pattern: 0 9 * * * (every day at 9 AM)
 */
cron.schedule("0 9 * * *", async () => {
  try {
    console.log(`[${new Date().toISOString()}] Running: Your job name`);
    // Your logic here
  } catch (error) {
    console.error("Error in your job:", error.message);
  }
});
```

## Cron Pattern Reference

```
┌───────────── minute (0 - 59)
│ ┌───────────── hour (0 - 23)
│ │ ┌───────────── day of month (1 - 31)
│ │ │ ┌───────────── month (1 - 12)
│ │ │ │ ┌───────────── day of week (0 - 6) (0 = Sunday)
│ │ │ │ │
│ │ │ │ │
* * * * *

*/30 * * * *     → Every 30 minutes
0 */2 * * *      → Every 2 hours (at minute 0)
0 9 * * *        → Every day at 9 AM
0 */6 * * *      → Every 6 hours
0 3 * * 1        → Every Monday at 3 AM
*/15 * * * *     → Every 15 minutes
0 0 1 * *        → First day of month at midnight
```

## Testing the Cron Jobs

### Local Testing

```bash
# Start the cron service with PM2
pm2 start ecosystem.config.js

# Monitor logs
pm2 logs sabiguy-cron

# Test with specific bookings
node -e "
const mongoose = require('mongoose');
const Booking = require('./models/Bookings');
require('dotenv').config();

mongoose.connect(process.env.MONGODB_URI).then(() => {
  Booking.findOne({ status: 'completed' }).then(b => {
    console.log('Sample booking:', b);
    process.exit();
  });
});"
```

### Database Testing

```javascript
// Find pending completion bookings
db.bookings.find({
  status: "completed",
  completedAt: { $exists: true },
  disputeRaisedAt: { $exists: false },
});

// Find auto-complete eligible bookings
const tenHoursAgo = new Date(Date.now() - 10 * 60 * 60 * 1000);
db.bookings.find({
  status: "completed",
  completedAt: { $lte: tenHoursAgo },
  disputeRaisedAt: { $exists: false },
});
```

## Monitoring

### PM2 Monitoring

```bash
# View real-time stats
pm2 monit

# View logs with timestamps
pm2 logs sabiguy-cron --lines 100

# Check if cron process is running
pm2 status
```

### Log Files

Logs are stored in `logs/` directory:

- `logs/cron-out.log` - Standard output
- `logs/cron-error.log` - Error output

### Cloud Monitoring (Optional)

Install PM2+ for cloud monitoring:

```bash
pm2 link <secret-key> <public-key>

# Then view at: https://app.pm2.io
```

## Troubleshooting

### Cron jobs not running

```bash
# Check if process is alive
pm2 status

# Check logs for errors
pm2 logs sabiguy-cron

# Restart the cron service
pm2 restart sabiguy-cron
```

### Notifications not sending

```bash
# Verify Firebase is configured
echo $FIREBASE_SERVICE_ACCOUNT_KEY | base64 -d | jq .

# Check notification preferences in DB
db.serviceusers.findOne().notificationPreferences
```

### Database connection issues

```bash
# Check MongoDB connection string
echo $MONGODB_URI

# Test connection
node -e "require('mongoose').connect(process.env.MONGODB_URI).then(() => {
  console.log('✓ Connected'); process.exit(0);
}).catch(e => { console.error('✗ Failed:', e.message); process.exit(1); })"
```

## Performance Considerations

### Database Query Optimization

The queries use indexed fields:

- `status` - Single field index
- `userId + status` - Compound index
- `providerId + status` - Compound index

Consider adding:

```javascript
// In Bookings model
bookingSchema.index({ completedAt: 1, disputeRaisedAt: 1, status: 1 });
```

### Notification Service Load

- Runs every 30 minutes - low frequency
- Auto-complete check every 2 hours - very low frequency
- Should not impact API performance

### Database Load

Each cron job:

1. **30-min job:** 1 query + up to N notifications (where N = pending bookings)
2. **2-hour job:** 1 query + up to M notifications (where M = auto-complete eligible)

With pagination/batching for large datasets:

```javascript
const pageSize = 100;
const pages = Math.ceil(bookingCount / pageSize);

for (let page = 0; page < pages; page++) {
  const bookings = await Booking.find({...})
    .skip(page * pageSize)
    .limit(pageSize);
  // Process...
}
```

## Future Enhancements

1. **Escalation workflow**: Additional notification at 5 hours, 9 hours
2. **Automatic dispute resolution**: Auto-refund after 20 hours if disputed
3. **Analytics**: Track completion times, dispute rates
4. **Batch notifications**: Group multiple bookings in one notification
5. **SMS/Email fallback**: If push notification fails
6. **Webhook support**: Notify external systems when bookings auto-complete
