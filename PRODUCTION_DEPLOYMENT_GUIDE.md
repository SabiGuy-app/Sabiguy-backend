# Production Deployment Guide - Sabiguy Backend

## Pre-Deployment Checklist

### 1. Local Testing & Validation

```bash
# ✅ Test locally first
npm install
npm run pm2:start
npm run pm2:logs

# Wait 2-5 minutes and verify:
# - Cron job messages appear every 1 minute (notification job)
# - Cron job appears every 2 hours (auto-complete job)
# - No Firebase errors
# - No database connection errors

# Stop and clean
pm2 kill
```

### 2. Code Review & Commit

```bash
# Commit cron job changes
git add .
git commit -m "feat: add booking completion cron jobs with PM2

- Every 30min: Send notifications to users for completion acceptance
- Every 2h: Auto-complete bookings after 10 hours
- Proper error handling and logging
- Uses existing acceptJobCompleted endpoint logic"

git push origin main
```

---

## DevOps Tasks BEFORE Deployment

### 1. Environment Setup on EC2

```bash
# SSH into your EC2 instance
ssh -i your-key.pem ubuntu@your-ec2-public-ip

# Update system
sudo apt update && sudo apt upgrade -y

# Install Node.js if not already installed
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install PM2 globally
sudo npm install -g pm2

# Install PM2 startup hook
pm2 startup systemd -u ubuntu --hp /home/ubuntu

# Copy the output command and run it with sudo
# Example: sudo /usr/lib/node_modules/pm2/bin/pm2 startup systemd -u ubuntu --hp /home/ubuntu
```

### 2. Verify Dependencies

```bash
# Check Redis is running
redis-cli ping
# Should return: PONG

# Check MongoDB is accessible
mongosh --eval "db.version()"
# Should show your MongoDB version

# Verify all required environment variables are set
env | grep -E "MONGODB_URI|REDIS_HOST|REDIS_PORT|FIREBASE_SERVICE_ACCOUNT_KEY|NODE_ENV"
```

### 3. Create/Update .env File on EC2

```bash
cd /opt/sabiguy-backend  # or your deployment directory

# Create .env file with production values
cat > .env << 'EOF'
NODE_ENV=production
PORT=3000

# Database
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/sabiguy?retryWrites=true&w=majority

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379

# Use localhost only if Redis runs on the same machine.
# If Redis is on another server, replace REDIS_HOST with that server's private IP, hostname, or managed Redis endpoint.

# Firebase
FIREBASE_SERVICE_ACCOUNT_KEY=base64-encoded-json-here

# API Keys
PAYSTACK_SECRET_KEY=your-key
GROQ_API_KEY=your-key
CLOUDINARY_NAME=your-name
CLOUDINARY_API_KEY=your-key
CLOUDINARY_API_SECRET=your-secret

# App URLs
APP_URL=https://your-domain.com
ADMIN_URL=https://admin.your-domain.com
EOF

# Secure the file
chmod 600 .env
```

### 4. SSL Certificate Setup

```bash
# Use Let's Encrypt with Nginx reverse proxy (recommended)
sudo apt install -y nginx certbot python3-certbot-nginx

# Create Nginx config
sudo tee /etc/nginx/sites-available/sabiguy << 'EOF'
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
EOF

# Enable config
sudo ln -s /etc/nginx/sites-available/sabiguy /etc/nginx/sites-enabled/

# Get SSL certificate
sudo certbot --nginx -d your-domain.com

# Enable auto-renewal
sudo systemctl enable certbot.timer
```

### 5. Firewall & Security

```bash
# Allow necessary ports
sudo ufw allow 22/tcp    # SSH
sudo ufw allow 80/tcp    # HTTP
sudo ufw allow 443/tcp   # HTTPS
sudo ufw enable

# Restrict MongoDB/Redis access (if on same server)
sudo ufw allow from 127.0.0.1 to 127.0.0.1 port 6379
sudo ufw allow from 127.0.0.1 to 127.0.0.1 port 27017
```

---

## Deployment Steps

### 1. Pull Latest Code

```bash
cd /opt/sabiguy-backend
git fetch origin
git checkout main
git pull origin main
```

### 2. Install Dependencies

```bash
npm install --production

# Verify node-cron is installed
npm list node-cron
```

### 3. Start Services with PM2

```bash
# Start with ecosystem config
pm2 start ecosystem.config.js

# Verify both processes started
pm2 status

# Output should show:
# │ id │ name           │ status  │ ↺ │ cpu │ memory   │
# ├────┼────────────────┼─────────┼───┼─────┼──────────┤
# │ 0  │ sabiguy-api    │ online  │ 0 │ 0%  │ 45.2 MB  │
# │ 1  │ sabiguy-cron   │ online  │ 0 │ 0%  │ 28.1 MB  │
```

### 4. Save PM2 Configuration for Auto-Restart

```bash
# Save process list
pm2 save

# Enable on system boot
pm2 startup systemd -u ubuntu --hp /home/ubuntu

# Copy and run the output command with sudo
# This creates a systemd service that auto-starts PM2 on reboot
```

### 5. Verify Logs

```bash
# View real-time logs from both processes
pm2 logs

# Should see:
# [HH:MM:SS] Cron jobs service started
# [HH:MM:SS] Server running on port 3000

# Check for errors
pm2 logs sabiguy-cron --err

# View specific time window
pm2 logs --lines 50
```

---

## Redis Connection Setup

### 1. Verify Redis is Running

```bash
# Connect to Redis
redis-cli

# Inside Redis CLI:
ping
# Response: PONG

exit
```

### 2. Test Connection from Node.js

```bash
# Create a test file
cat > test-redis.js << 'EOF'
const redis = require("redis");
const client = redis.createClient({
  socket: {
    host: process.env.REDIS_HOST || "localhost",
    port: Number(process.env.REDIS_PORT || 6379),
  },
});

client.on("error", (err) => console.log("Redis Client Error", err));
client.on("connect", () => console.log("✅ Redis connected"));

client.connect().then(() => {
  client.set("test-key", "test-value").then(() => {
    client.get("test-key").then((val) => {
      console.log("Retrieved:", val);
      client.quit();
      process.exit(0);
    });
  });
});
EOF

node test-redis.js
# Should output: ✅ Redis connected

rm test-redis.js
```

### 3. Configure Cache in App (if needed)

```bash
# In your index.js or app initialization:
# Make sure Redis is connected before starting server
# Handle Redis connection failures gracefully
```

---

## Health Checks & Monitoring

### 1. API Health Endpoint

```bash
# Test API is responding
curl https://your-domain.com/api/health

# Should return: { status: "ok" }
```

### 2. Database Health

```bash
# Test MongoDB connection
curl https://your-domain.com/api/db-status

# Verify bookings can be queried
curl https://your-domain.com/api/v1/bookings \
  -H "Authorization: Bearer your-token" \
  -H "Content-Type: application/json"
```

### 3. Monitor PM2 Processes

```bash
# Real-time monitoring
pm2 monit

# Check memory usage
pm2 status

# Alert if memory exceeds threshold
pm2 set max_memory_restart 1G  # API
pm2 set max_memory_restart 512M  # Cron
```

### 4. View Logs

```bash
# Follow logs in real-time
pm2 logs sabiguy-api
pm2 logs sabiguy-cron

# View specific number of lines
pm2 logs sabiguy-cron --lines 100

# Tail error logs only
tail -f logs/cron-error.log
tail -f logs/api-error.log
```

---

## DevOps Tasks AFTER Deployment

### 1. Smoke Tests

```bash
# Test key endpoints
curl -X GET https://your-domain.com/api/v1/bookings?limit=1 \
  -H "Authorization: Bearer test-token"

# Should not return 500 errors

# Test cron job notifications (manual trigger for testing)
# Create a test booking with status="completed"
# Wait for next 1-minute interval
# Verify notification was sent
```

### 2. Monitor for 24-48 Hours

```bash
# Set up alerts for:
# - API response time > 2 seconds
# - Memory usage > 80%
# - Error rate > 1%
# - Database connection failures
# - Redis connection failures

# Use PM2+ for cloud monitoring
pm2 link <secret-key> <public-key>
```

### 3. Verify Cron Jobs Running

```bash
# In MongoDB, check for bookings with recent status changes
db.bookings.find({
  status: "user_accepted_completion",
  updatedAt: { $gte: new Date(Date.now() - 24*60*60*1000) }
}).count()

# Should show auto-completed bookings after 10 hours

# Check cron logs for execution records
pm2 logs sabiguy-cron | grep "Send booking completion notifications"
pm2 logs sabiguy-cron | grep "Auto-complete bookings"
```

### 4. Set Up Log Rotation

```bash
# Install PM2 log rotation
pm2 install pm2-logrotate

# Configure rotation
pm2 set pm2-logrotate:max_size 100M
pm2 set pm2-logrotate:retain 14  # Keep 14 days of logs

pm2 save
```

### 5. Backup & Disaster Recovery

```bash
# Backup MongoDB
mongodump --uri="$MONGODB_URI" --out=/backups/mongo-backup-$(date +%Y%m%d)

# Backup Redis
redis-cli --rdb /backups/redis-backup-$(date +%Y%m%d).rdb

# Schedule daily backups via cron
# Edit crontab: crontab -e
# Add: 0 2 * * * /scripts/backup.sh
```

---

## Rollback Procedure (If Something Breaks)

### Quick Rollback

```bash
# Stop current deployment
pm2 stop all

# Checkout previous version
git checkout HEAD~1

# Install dependencies
npm install --production

# Restart
pm2 start ecosystem.config.js

# Verify
pm2 logs
```

### Full Rollback with Database

```bash
# If data corruption occurred:

# 1. Restore MongoDB from backup
mongorestore --uri="$MONGODB_URI" /backups/mongo-backup-<date>

# 2. Restore Redis from backup
redis-cli shutdown
cp /backups/redis-backup-<date>.rdb /var/lib/redis/dump.rdb
redis-server

# 3. Restart application
pm2 restart all

# 4. Verify health
curl https://your-domain.com/api/health
```

---

## Production Checklist

```
BEFORE DEPLOYMENT:
  ☐ All tests passing locally
  ☐ Code reviewed and approved
  ☐ Environment variables set on EC2
  ☐ Database backups taken
  ☐ Redis running and accessible
  ☐ Firewall rules configured
  ☐ SSL certificate installed
  ☐ Nginx reverse proxy configured

DURING DEPLOYMENT:
  ☐ Pull latest code
  ☐ Install dependencies
  ☐ Start with PM2
  ☐ Verify both processes online
  ☐ Save PM2 configuration
  ☐ Check logs for errors

AFTER DEPLOYMENT:
  ☐ Health checks passing
  ☐ API responding normally
  ☐ Cron jobs executing
  ☐ Notifications sending
  ☐ Database queries working
  ☐ Redis connected
  ☐ No error spikes
  ☐ Monitor for 24 hours
  ☐ Set up alerts
  ☐ Document any issues

ONGOING:
  ☐ Daily log review
  ☐ Weekly backups
  ☐ Monitor PM2 metrics
  ☐ Check cron job execution
  ☐ Update dependencies monthly
```

---

## Important Notes

### PM2 + Cron Jobs

- ✅ **autorestart: false** - Cron process won't auto-restart on graceful exit
- ✅ **process.exit(0)** - Cron properly shuts down on SIGTERM/SIGINT
- ✅ **pm2 save** - Required after ANY changes to persist on reboot
- ⚠️ **Watch:** If API restarts, cron stays running (separate process)

### Redis Considerations

- Ensure Redis has **persistence enabled** (`appendonly yes` in redis.conf)
- Monitor Redis memory usage
- Set **maxmemory-policy** to avoid evictions: `maxmemory-policy allkeys-lru`
- Test Redis failover procedures

### Database Connection

- Use **connection pooling** (Mongoose default: 100 connections)
- Monitor MongoDB connection count
- Enable **retryWrites** in connection string
- Set reasonable timeouts

### Notifications

- Verify Firebase credentials are base64-encoded
- Test with a real booking to ensure notifications send
- Monitor failed notification attempts
- Have fallback notification method if Firebase fails

### Monitoring & Alerts

```bash
# Set up PM2 alerts via PM2+
pm2 link <secret> <public>

# Monitor via PM2 dashboard at: https://app.pm2.io

# Alternative: Use CloudWatch if on AWS
aws cloudwatch put-metric-alarm \
  --alarm-name sabiguy-api-high-memory \
  --alarm-actions arn:aws:sns:region:account:topic \
  --threshold 800 \
  --comparison-operator GreaterThanThreshold
```

---

## Support & Troubleshooting

### Common Issues

**Cron job not running:**

```bash
# Check if process is alive
pm2 status

# Check logs
pm2 logs sabiguy-cron

# Restart
pm2 restart sabiguy-cron
```

**Notifications not sending:**

```bash
# Verify Firebase
echo $FIREBASE_SERVICE_ACCOUNT_KEY | base64 -d | jq .

# Check device tokens in DB
db.serviceusers.findOne({ _id: ObjectId("user-id") }).deviceTokens
```

**Redis connection failed:**

```bash
# Check Redis status
redis-cli ping

# Restart Redis
sudo systemctl restart redis-server

# Check connection settings
echo $REDIS_HOST
echo $REDIS_PORT
```

**High memory usage:**

```bash
# Increase memory restart threshold
pm2 set max_memory_restart 2G

# Or restart on schedule
pm2 restart --cron "0 3 * * *"  # Restart at 3 AM daily
```

---

## Next Steps

1. **Before Deployment:**
   - Run full test suite locally
   - Get approval from team
   - Take database backups

2. **During Deployment:**
   - Follow deployment steps exactly
   - Monitor logs in real-time
   - Have rollback plan ready

3. **After Deployment:**
   - Run smoke tests
   - Monitor for 24-48 hours
   - Document any issues
   - Update team on status

---

**Questions? Issues?**

- Check logs: `pm2 logs`
- Verify health: `curl https://your-domain.com/api/health`
- Test notifications: Create test booking, wait for notification
- Check cron: `pm2 logs sabiguy-cron | grep "Running:"`
