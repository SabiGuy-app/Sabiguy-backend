# DevOps Deployment Playbook - Sabiguy Backend

## Quick Reference for DevOps Team

### Pre-Deployment (Do This FIRST)

```bash
# 1. Verify EC2 instance is running
aws ec2 describe-instances --region us-east-1 --filters "Name=tag:Name,Values=sabiguy-prod"

# 2. SSH into instance
ssh -i sabiguy-prod.pem ubuntu@54.xxx.xxx.xxx

# 3. Check existing services
pm2 status
systemctl status nginx
redis-cli ping
mongosh --eval "db.version()"

# 4. Stop current application gracefully
pm2 stop all
sleep 5

# 5. Backup database (CRITICAL!)
mkdir -p /backups/$(date +%Y%m%d)
mongodump --uri="mongodb+srv://..." --out=/backups/$(date +%Y%m%d)/mongo
redis-cli --rdb /backups/$(date +%Y%m%d)/redis-backup.rdb
tar -czf /backups/sabiguy-backup-$(date +%Y%m%d-%H%M%S).tar.gz /backups/$(date +%Y%m%d)/
```

### Deployment

```bash
# 1. Update code
cd /opt/sabiguy-backend
git fetch origin
git checkout main
git pull origin main

# 2. Install dependencies
npm install --production

# 3. Verify critical files exist
[ -f ecosystem.config.js ] && echo "✓ ecosystem.config.js" || echo "✗ MISSING"
[ -f cron/cronJobs.js ] && echo "✓ cron/cronJobs.js" || echo "✗ MISSING"
[ -f .env ] && echo "✓ .env" || echo "✗ MISSING"

# 4. Start application
pm2 start ecosystem.config.js

# 5. Verify startup (WAIT 10 SECONDS)
sleep 10
pm2 status

# Expected output:
# │ 0  │ sabiguy-api  │ online │ fork │ 0%   │ ~45 MB │
# │ 1  │ sabiguy-cron │ online │ fork │ 0%   │ ~28 MB │

# 6. Check logs for errors
pm2 logs --lines 50 --err

# 7. Save PM2 state
pm2 save
```

### Post-Deployment Health Checks

```bash
# 1. API Health
curl -X GET https://your-domain.com/api/health -H "Content-Type: application/json"
# Expected: { "status": "ok" }

# 2. Database connectivity
curl -X GET https://your-domain.com/api/v1/bookings?limit=1 \
  -H "Authorization: Bearer test-token"
# Should NOT return 5xx error

# 3. Check cron job execution (wait 1-2 minutes)
pm2 logs sabiguy-cron | grep "Send booking completion notifications"
# Should see: "Running: Send booking completion notifications"

# 4. Monitor process memory
pm2 monit
# Watch for 2-3 minutes - should be stable

# 5. Check for errors in logs
pm2 logs --err | head -20
# Should show no new errors

# 6. Verify both processes are running
pm2 list | grep online
# Should have 2 online processes
```

### Critical Environment Variables (Verify Before Deploy)

```bash
# Check all required env vars are set
env | grep -E "^(NODE_ENV|MONGODB_URI|REDIS_HOST|REDIS_PORT|FIREBASE_SERVICE_ACCOUNT_KEY|PAYSTACK_SECRET_KEY)="

# If any missing, update .env and restart:
pm2 restart all
```

### Redis Health Check

```bash
# Test Redis connection
redis-cli -h ${REDIS_HOST:-localhost} -p ${REDIS_PORT:-6379} ping
# Expected: PONG

# Check Redis memory
redis-cli -h ${REDIS_HOST:-localhost} -p ${REDIS_PORT:-6379} info memory | grep used_memory_human

# Monitor Redis in real-time
redis-cli -h ${REDIS_HOST:-localhost} -p ${REDIS_PORT:-6379} monitor
```

### Database Health Check

```bash
# MongoDB stats
mongosh "$MONGODB_URI" --eval "db.stats()"

# Connection count
mongosh "$MONGODB_URI" --eval "db.serverStatus().connections"

# Check bookings collection
mongosh "$MONGODB_URI" --eval "db.bookings.countDocuments()"
```

---

## Monitoring & Alerting Setup

### PM2+ Cloud Monitoring (Recommended)

```bash
# Link PM2 to cloud dashboard
pm2 link <secret-key> <public-key>

# View dashboard at: https://app.pm2.io

# Enable alerts for:
# - Process crash
# - High memory (>80%)
# - High CPU (>90%)
# - Exception thrown
```

### CloudWatch Integration (AWS)

```bash
# Enable CloudWatch monitoring
aws cloudwatch put-metric-alarm \
  --alarm-name sabiguy-api-high-cpu \
  --alarm-actions arn:aws:sns:region:account:topic \
  --threshold 90 \
  --comparison-operator GreaterThanThreshold

aws cloudwatch put-metric-alarm \
  --alarm-name sabiguy-cron-offline \
  --alarm-actions arn:aws:sns:region:account:topic \
  --threshold 1 \
  --comparison-operator LessThanThreshold
```

### Manual Health Check Script

```bash
#!/bin/bash
# Save as /opt/sabiguy-backend/health-check.sh

API_URL="https://your-domain.com"
SLACK_WEBHOOK="https://hooks.slack.com/..."

check_api() {
    response=$(curl -s -o /dev/null -w "%{http_code}" $API_URL/api/health)
    if [ "$response" != "200" ]; then
        curl -X POST $SLACK_WEBHOOK \
          -d '{"text":"❌ API Health Check Failed: '$response'"}'
        return 1
    fi
    return 0
}

check_cron() {
    count=$(pm2 list | grep sabiguy-cron | grep online | wc -l)
    if [ "$count" != "1" ]; then
        curl -X POST $SLACK_WEBHOOK \
          -d '{"text":"❌ Cron Job Offline"}'
        return 1
    fi
    return 0
}

check_api && check_cron && echo "✓ All checks passed" || echo "✗ Checks failed"

# Schedule via crontab: */5 * * * * /opt/sabiguy-backend/health-check.sh
```

---

## Rollback Procedure

### Quick Rollback (Code Only)

```bash
cd /opt/sabiguy-backend

# Stop application
pm2 stop all

# Checkout previous version
git log --oneline -5  # See recent commits
git checkout <previous-commit-hash>

# Reinstall dependencies
npm install --production

# Start application
pm2 start ecosystem.config.js

# Verify
pm2 logs --lines 20
curl https://your-domain.com/api/health
```

### Full Rollback (Code + Database)

```bash
# Use ONLY if data corruption occurred

# 1. Stop everything
pm2 stop all

# 2. Restore MongoDB
ls -la /backups/  # Find latest backup
mongorestore --uri="$MONGODB_URI" --drop /backups/[DATE]/mongo/

# 3. Restore Redis
redis-cli shutdown
cp /backups/[DATE]/redis-backup.rdb /var/lib/redis/dump.rdb
redis-server

# 4. Rollback code
cd /opt/sabiguy-backend
git checkout main~1

# 5. Restart
npm install --production
pm2 start ecosystem.config.js

# 6. Verify
pm2 status
curl https://your-domain.com/api/health
```

---

## Common Issues & Solutions

### Issue: Cron process exits immediately

```bash
# Check error logs
pm2 logs sabiguy-cron --err

# Common causes:
# 1. Database not accessible
#    → Verify MONGODB_URI
# 2. Firebase credentials invalid
#    → Check FIREBASE_SERVICE_ACCOUNT_KEY is base64-encoded
# 3. Node modules missing
#    → Run: npm install --production

# Fix and restart
pm2 restart sabiguy-cron
```

### Issue: Memory keeps growing

```bash
# Check which process is leaking
pm2 monit

# Set memory restart threshold
pm2 set max_memory_restart 1G

# Or restart on schedule (nightly at 3 AM)
pm2 restart sabiguy-api --cron "0 3 * * *"
pm2 restart sabiguy-cron --cron "0 3 * * *"

pm2 save
```

### Issue: Notifications not sending

```bash
# Check Firebase
echo $FIREBASE_SERVICE_ACCOUNT_KEY | base64 -d | jq .
# Should output valid JSON

# Check device tokens
mongosh "$MONGODB_URI" --eval \
  "db.serviceusers.findOne({ _id: ObjectId('user-id') }).deviceTokens"

# If empty, users haven't registered device tokens
# Check logs for notification errors
pm2 logs sabiguy-api | grep -i firebase
pm2 logs sabiguy-cron | grep -i notification
```

### Issue: High latency on bookings endpoints

```bash
# Check database indexes
mongosh "$MONGODB_URI" --eval "db.bookings.getIndexes()"

# Create missing indexes if needed
mongosh "$MONGODB_URI" --eval \
  "db.bookings.createIndex({ status: 1, completedAt: 1 })"

# Monitor query performance
mongosh "$MONGODB_URI" --eval "db.setProfilingLevel(1)"
# Run problematic queries
# Then: db.system.profile.find().limit(10).sort({ ts: -1 }).pretty()
```

---

## Log File Locations

```bash
# API logs
tail -f /opt/sabiguy-backend/logs/api-out.log
tail -f /opt/sabiguy-backend/logs/api-error.log

# Cron logs
tail -f /opt/sabiguy-backend/logs/cron-out.log
tail -f /opt/sabiguy-backend/logs/cron-error.log

# Nginx logs
tail -f /var/log/nginx/access.log
tail -f /var/log/nginx/error.log

# System logs
journalctl -u pm2-ubuntu -f
journalctl -u nginx -f
```

---

## Performance Baseline

After deployment, measure these metrics for comparison:

```bash
# Get baseline metrics
pm2 status

# Expected:
# API:   0-1% CPU, 45-60MB memory
# Cron:  0-1% CPU, 25-40MB memory (only runs every 30min-2h)

# Response time
time curl -s https://your-domain.com/api/health | jq .

# Expected: <500ms total

# Database query performance
mongosh "$MONGODB_URI" --eval "
  db.system.profile.find({ millis: { \$gt: 100 } }).count()
" # Should be <5 slow queries

# Save these metrics
pm2 status > /backups/metrics-$(date +%Y%m%d-%H%M%S).txt
```

---

## Deployment Checklist

```
BEFORE DEPLOYMENT:
  ☐ Code reviewed and approved
  ☐ All tests passing
  ☐ Database backups taken
  ☐ Rollback procedure documented
  ☐ Team notified of deployment window
  ☐ Status page updated (if applicable)

DURING DEPLOYMENT:
  ☐ Backup database
  ☐ Stop current application
  ☐ Pull latest code
  ☐ Install dependencies
  ☐ Start with PM2
  ☐ Verify both processes online
  ☐ Monitor logs for 5 minutes
  ☐ Run health checks
  ☐ Save PM2 state

AFTER DEPLOYMENT:
  ☐ All endpoints returning 200
  ☐ Cron jobs executing
  ☐ Notifications sending
  ☐ No memory leaks
  ☐ No error spikes
  ☐ Database queries normal speed
  ☐ Redis connected and responding
  ☐ Monitor for 1-2 hours
  ☐ Update status page
  ☐ Notify team deployment complete

ONGOING:
  ☐ Daily log review
  ☐ Weekly backup verification
  ☐ Monthly dependency updates
  ☐ Quarterly security audit
```

---

## Emergency Contacts

- **Backend Lead:**
- **DevOps/Infrastructure:**
- **Database Admin:**
- **On-Call Engineer:**

## Incident Response

If critical issue occurs post-deployment:

1. **Alert team immediately** via Slack #incident
2. **Assess severity** - is user-facing? is data affected?
3. **Execute rollback** if necessary (see section above)
4. **Document issue** - what happened, what we did, root cause
5. **Post-mortem** - schedule meeting to prevent recurrence

---

**Last Updated:** 2026-05-13
**Deployment Version:** 1.0 (With Cron Jobs)
