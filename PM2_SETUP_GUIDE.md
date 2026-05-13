# PM2 Cron Jobs Setup Guide for AWS EC2

## Installation & Setup

### Step 1: Install PM2 and node-cron

```bash
npm install pm2 node-cron --save
npm install pm2 -g  # Install PM2 globally
```

### Step 2: Update package.json scripts

Add these scripts to your `package.json`:

```json
"scripts": {
  "start": "node index.js",
  "dev": "nodemon index.js",
  "test": "echo \"Error: no test specified\" && exit 1",
  "pm2:start": "pm2 start ecosystem.config.js",
  "pm2:stop": "pm2 stop all",
  "pm2:restart": "pm2 restart all",
  "pm2:kill": "pm2 kill",
  "pm2:logs": "pm2 logs",
  "pm2:status": "pm2 status"
}
```

### Step 3: Files Created

I've created two new files:

1. **ecosystem.config.js** - PM2 configuration file that runs:
   - Main API server with clustering
   - Separate cron jobs process

2. **cron/cronJobs.js** - Your cron jobs handler with example tasks

### Step 4: Local Testing

```bash
# Start PM2 with your configuration
pm2 start ecosystem.config.js

# View logs
pm2 logs

# Monitor processes
pm2 monit

# View status
pm2 status

# Stop all
pm2 stop all

# Delete all processes
pm2 kill
```

## Deployment on AWS EC2

### Step 1: Connect to your EC2 instance

```bash
ssh -i your-key.pem ubuntu@your-ec2-public-ip
```

### Step 2: Install Node.js and PM2 (if not already installed)

```bash
# Install Node.js
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install PM2 globally
sudo npm install -g pm2

# Install PM2 startup hook (runs PM2 on system reboot)
pm2 startup

# Copy the output command and run it with sudo
```

### Step 3: Deploy your application

```bash
# Clone/pull your repository
git clone <your-repo-url>
cd Sabiguy-backend

# Install dependencies
npm install

# Start with PM2
pm2 start ecosystem.config.js

# Save PM2 configuration so it restarts on reboot
pm2 save
```

### Step 4: Enable PM2 auto-restart on system reboot

```bash
# This creates a startup script
pm2 startup systemd -u ubuntu --hp /home/ubuntu

# Run the command output from above, then save
pm2 save
```

## Useful PM2 Commands

```bash
# View all running processes
pm2 status

# View logs in real-time
pm2 logs

# View logs for a specific app
pm2 logs sabiguy-api
pm2 logs sabiguy-cron

# Monitor CPU and memory usage
pm2 monit

# Restart a specific app
pm2 restart sabiguy-api

# Stop a specific app
pm2 stop sabiguy-cron

# Delete a process
pm2 delete sabiguy-api

# Restart all
pm2 restart all

# Kill all PM2 processes
pm2 kill
```

## Viewing Logs

Logs are saved in the `logs/` directory as specified in `ecosystem.config.js`:

- API logs: `logs/api-out.log` and `logs/api-error.log`
- Cron logs: `logs/cron-out.log` and `logs/cron-error.log`

```bash
# View all logs
tail -f logs/*.log

# View only cron logs
tail -f logs/cron-out.log
```

## Monitoring and Alerts

Install PM2+ for advanced monitoring and email alerts:

```bash
# Create a free PM2+ account at app.pm2.io
# Then link your account
pm2 link <secret-key> <public-key>

# Now all your processes are monitored in the cloud
```

## Cron Job Patterns Reference

Used in `cron/cronJobs.js`:

```
Minute  Hour   Day   Month  Day of Week
0-59    0-23   1-31  1-12   0-6 (0=Sunday)

Examples:
*/15 * * * *     - Every 15 minutes
0 2 * * *        - Every day at 2 AM
0 */6 * * *      - Every 6 hours
0 3 * * 1        - Monday at 3 AM
*/30 9-17 * * 1-5 - Every 30 min, 9 AM-5 PM, Mon-Fri
0 0 1 * *        - First day of month at midnight
```

## Adding New Cron Jobs

Edit `cron/cronJobs.js` and add a new cron schedule:

```javascript
cron.schedule("0 9 * * *", async () => {
  try {
    console.log(`[${new Date().toISOString()}] Running: Your job name`);
    // Your logic here
  } catch (error) {
    console.error("Error in your job:", error);
  }
});
```

Then restart the cron service:

```bash
pm2 restart sabiguy-cron
```

## Troubleshooting

### PM2 not starting on boot

```bash
pm2 startup systemd -u ubuntu --hp /home/ubuntu
pm2 save
```

### Check if PM2 is running

```bash
pm2 list
pm2 status
```

### Clear PM2 cache

```bash
pm2 kill
pm2 start ecosystem.config.js
```

### Check system logs (if PM2 processes crash)

```bash
sudo journalctl -u pm2-ubuntu -n 100 -f
```

### Restart cron jobs only

```bash
pm2 restart sabiguy-cron
```

## Deployment Checklist

- [ ] Install PM2 globally on EC2
- [ ] Clone/pull repository to EC2
- [ ] Run `npm install`
- [ ] Configure environment variables in `.env`
- [ ] Start with `pm2 start ecosystem.config.js`
- [ ] Run `pm2 save` and `pm2 startup`
- [ ] Verify processes are running: `pm2 status`
- [ ] Check logs: `pm2 logs`
- [ ] Test reboot: `sudo reboot`
- [ ] Verify processes restarted after reboot

## Important Notes

1. **Database Connection**: Make sure your database connection string is in your `.env` file
2. **Error Handling**: Always wrap cron jobs in try-catch blocks
3. **Resource Usage**: Monitor memory with `pm2 monit` to avoid crashes
4. **Log Rotation**: Consider using `pm2-logrotate` for large log files
5. **Separate Cron Process**: Cron jobs run in a separate process to avoid blocking your API
