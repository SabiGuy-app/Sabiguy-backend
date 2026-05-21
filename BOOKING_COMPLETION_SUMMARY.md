# Booking Completion Cron Jobs - Implementation Summary

## What Was Created

### 1. **cron/cronJobs.js** - Main Cron Handler

Implements two automated workflows:

#### Job 1: Send Completion Notifications (Every 30 Minutes)

```
Schedule: */30 * * * *
Finds: Bookings with status='completed' that user hasn't accepted/disputed
Action: Sends push notification reminding user to accept or dispute
```

#### Job 2: Auto-Complete After 10 Hours (Every 2 Hours Check)

```
Schedule: 0 */2 * * *
Finds: Bookings completed >10 hours ago without dispute
Action: Auto-marks as 'user_accepted_completion' and notifies both parties
```

### 2. **cron/notificationService.js** - Notification Wrapper

Bridges the cron process with your existing notification service for:

- Notifying users
- Notifying providers
- Sending generic notifications

### 3. **ecosystem.config.js** (Already Updated)

Runs cron as separate PM2 process alongside your API

### 4. **package.json** (Already Updated)

Added `node-cron` dependency

## Workflow Timeline

```
T=0h:      Provider marks booking "completed"
           ↓
T=0-10h:   Every 30 min: Send user notification to "accept or dispute"
           ↓
T=10h:     If user did nothing:
           - Auto-mark as "user_accepted_completion"
           - Release funds to provider
           - Notify user: "Auto-completed, no dispute received"
           - Notify provider: "Funds released to your wallet"
```

## Database Status Progression

```
in_progress
    ↓
completed ← Provider marks job done
    ↓
[User window: 10 hours]
├─→ user_accepted_completion (manual or auto)
├─→ disputed (if user raises dispute)
    ↓
funds_released ← Payment to provider
```

## Key Features

✅ **Every 30 minutes**: Users reminded about completion  
✅ **After 10 hours**: Auto-completes if no dispute  
✅ **Dual notification**: Both user and provider notified on auto-complete  
✅ **Error handling**: Try-catch on every operation  
✅ **Logging**: Detailed console logs for monitoring  
✅ **Non-blocking**: Runs in separate PM2 process

## How to Use

### Start the Cron Service

```bash
npm install                    # Install node-cron
npm run pm2:start             # Start API + cron with PM2
npm run pm2:logs              # View real-time logs
```

### Monitor in Production (AWS EC2)

```bash
pm2 logs sabiguy-cron         # View cron logs only
pm2 monit                     # Live CPU/memory monitoring
pm2 status                    # Check process status
```

### View Logs

```bash
tail -f logs/cron-out.log     # Current notifications/completions
tail -f logs/cron-error.log   # Any errors
```

## API Endpoints You Need to Add

### User Acceptance Endpoint

```javascript
POST /api/bookings/:bookingId/accept-completion
Body: {}
Response: { success: true, message: 'Booking completed' }
```

### User Dispute Endpoint

```javascript
POST /api/bookings/:bookingId/dispute
Body: { reason: "Service not completed properly" }
Response: { success: true, message: 'Dispute raised' }
```

These endpoints should:

1. Update booking status
2. Update timestamps (disputeRaisedAt, etc.)
3. Trigger payment release logic if accepted
4. Notify provider if disputed

## Testing

### Local Test

```bash
# Start PM2
pm2 start ecosystem.config.js

# In another terminal, check logs
pm2 logs sabiguy-cron

# Manually test by creating a "completed" booking in DB
# Wait 2 hours (or edit cron timing for testing)
# Should see auto-complete notification
```

### Database Test Query

```javascript
// Find bookings pending user action
db.bookings.find({
  status: "completed",
  completedAt: { $exists: true },
  disputeRaisedAt: { $exists: false },
});
```

## Customization

### Change notification frequency

Edit **cron/cronJobs.js**:

```javascript
// Change from every 30 minutes to every 10 minutes:
cron.schedule("*/10 * * * *", async () => { ... });
```

### Change auto-complete window

Edit **cron/cronJobs.js**:

```javascript
// Change from 10 hours to 24 hours:
const tenHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
```

### Add more cron jobs

Simply add another `cron.schedule()` block in **cron/cronJobs.js**

## Files Created/Modified

```
✅ Created: cron/cronJobs.js
✅ Created: cron/notificationService.js
✅ Created: ecosystem.config.js
✅ Modified: package.json (added node-cron)
✅ Created: PM2_SETUP_GUIDE.md
✅ Created: BOOKING_COMPLETION_CRON_GUIDE.md
✅ Created: this file
```

## Next Steps

1. **Implement API endpoints** for accepting/disputing completion
2. **Test locally** with PM2 for 5-10 minutes
3. **Deploy to AWS EC2** using the PM2_SETUP_GUIDE.md
4. **Monitor logs** to verify cron jobs are running
5. **Add payment release logic** when user accepts/auto-completes

## Important Notes

⚠️ **Notification Service**: Make sure Firebase is configured (FIREBASE_SERVICE_ACCOUNT_KEY env var)  
⚠️ **Database Connection**: Ensure MONGODB_URI env var is set  
⚠️ **Timings**: Adjust cron patterns based on your business needs  
⚠️ **Error Handling**: Check logs regularly for any failed notifications

## Support

For issues:

1. Check `logs/cron-error.log`
2. Review `pm2 logs sabiguy-cron`
3. Verify MongoDB connection
4. Check Firebase credentials
