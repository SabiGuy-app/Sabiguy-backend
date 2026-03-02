const rateLimit = require("express-rate-limit");

exports.changePasswordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // Max 5 attempts per window per IP
  message: {
    success: false,
    message: "Too many password change attempts. Try again in 15 minutes."
  },
  standardHeaders: true,
  legacyHeaders: false,
});