#!/bin/bash

# QUICK DEPLOYMENT CHECKLIST
# Run this script to verify your deployment is ready

echo "🚀 SABIGUY PRODUCTION DEPLOYMENT CHECKLIST"
echo "==========================================="
echo ""

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

check_mark() {
    echo -e "${GREEN}✓${NC} $1"
}

cross_mark() {
    echo -e "${RED}✗${NC} $1"
}

warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

echo "PRE-DEPLOYMENT CHECKS"
echo "====================="

# 1. Check Node modules
if [ -d "node_modules" ]; then
    check_mark "node_modules directory exists"
else
    cross_mark "node_modules missing - run: npm install"
fi

# 2. Check ecosystem.config.js
if [ -f "ecosystem.config.js" ]; then
    if grep -q "autorestart: false" ecosystem.config.js; then
        check_mark "ecosystem.config.js has autorestart: false for cron"
    else
        warning "ecosystem.config.js - check autorestart setting for cron"
    fi
else
    cross_mark "ecosystem.config.js not found"
fi

# 3. Check .env file exists
if [ -f ".env" ]; then
    check_mark ".env file exists"
    if grep -q "MONGODB_URI" .env; then
        check_mark "MONGODB_URI set in .env"
    else
        cross_mark "MONGODB_URI missing in .env"
    fi
    if grep -q "FIREBASE_SERVICE_ACCOUNT_KEY" .env; then
        check_mark "FIREBASE_SERVICE_ACCOUNT_KEY set in .env"
    else
        cross_mark "FIREBASE_SERVICE_ACCOUNT_KEY missing in .env"
    fi
else
    cross_mark ".env file not found - create it before deployment"
fi

# 4. Check cron jobs file
if [ -f "cron/cronJobs.js" ]; then
    check_mark "cron/cronJobs.js exists"
    if grep -q "process.exit(0)" cron/cronJobs.js; then
        check_mark "Graceful shutdown handlers present"
    else
        cross_mark "Graceful shutdown handlers missing"
    fi
else
    cross_mark "cron/cronJobs.js not found"
fi

# 5. Check package.json has pm2 scripts
if grep -q "pm2:start" package.json; then
    check_mark "PM2 scripts configured in package.json"
else
    warning "PM2 scripts not in package.json - add them manually"
fi

echo ""
echo "DEPLOYMENT REQUIREMENTS"
echo "======================="

# 6. Check if PM2 is available globally
if command -v pm2 &> /dev/null; then
    check_mark "PM2 installed globally"
    pm2 --version
else
    cross_mark "PM2 not installed - run: sudo npm install -g pm2"
fi

# 7. Check if Node.js is available
if command -v node &> /dev/null; then
    check_mark "Node.js installed"
    node --version
else
    cross_mark "Node.js not installed"
fi

# 8. Check if git is available
if command -v git &> /dev/null; then
    check_mark "Git installed"
    check_mark "Latest commit: $(git log -1 --pretty=%B)"
else
    warning "Git not available"
fi

echo ""
echo "LOCAL TEST RESULTS"
echo "=================="

# 9. Check if logs directory exists
if [ -d "logs" ]; then
    check_mark "logs directory exists"
else
    warning "logs directory doesn't exist - will be created by PM2"
fi

echo ""
echo "PRODUCTION REQUIREMENTS (On EC2)"
echo "================================"

echo ""
echo "✓ Database:"
echo "  - MONGODB_URI should point to production database"
echo "  - Ensure backups are enabled"
echo ""

echo "✓ Redis:"
echo "  - REDIS_HOST and REDIS_PORT should point to production Redis"
echo "  - Redis is required for multi-instance Socket.io sync, optional for one server"
echo "  - Verify Redis is running: redis-cli ping"
echo ""

echo "✓ Firebase:"
echo "  - FIREBASE_SERVICE_ACCOUNT_KEY must be base64-encoded"
echo "  - Test: echo \$FIREBASE_SERVICE_ACCOUNT_KEY | base64 -d | jq ."
echo ""

echo "✓ Environment:"
echo "  - NODE_ENV=production"
echo "  - PORT configured (default 3000)"
echo ""

echo "✓ Security:"
echo "  - SSL certificate installed"
echo "  - Firewall rules configured"
echo "  - .env file has 600 permissions (chmod 600 .env)"
echo ""

echo "DEPLOYMENT STEPS"
echo "================"
echo ""
echo "1. LOCAL TESTING:"
echo "   npm install"
echo "   npm run pm2:start"
echo "   npm run pm2:logs    # Wait 2-5 min for cron messages"
echo "   pm2 kill"
echo ""

echo "2. GIT COMMIT:"
echo "   git add ."
echo "   git commit -m 'Deploy cron jobs to production'"
echo "   git push origin main"
echo ""

echo "3. ON EC2:"
echo "   cd /opt/sabiguy-backend"
echo "   git pull origin main"
echo "   npm install --production"
echo "   pm2 start ecosystem.config.js"
echo "   pm2 status          # Verify both processes online"
echo "   pm2 save            # CRITICAL: Save process list"
echo "   pm2 logs            # Monitor for 5 minutes"
echo ""

echo "4. VERIFY DEPLOYMENT:"
echo "   curl https://your-domain.com/api/health"
echo "   pm2 logs sabiguy-cron | grep 'Running:'"
echo ""

echo "5. MONITORING (24-48h):"
echo "   pm2 monit"
echo "   pm2 logs sabiguy-api"
echo "   pm2 logs sabiguy-cron"
echo ""

echo "==========================================="
echo "Review PRODUCTION_DEPLOYMENT_GUIDE.md for detailed steps"
echo "==========================================="
