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

exports.readLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  message: {
    success: false,
    message: "Too many requests, please try again later.",
  },
  standardHeaders: true,
  legacyHeaders: false,
});

exports.authMeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 120,
  message: {
    success: false,
    message: "Too many profile requests, please try again later.",
  },
  standardHeaders: true,
  legacyHeaders: false,
});

exports.transactionsLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 120,
  message: {
    success: false,
    message: "Too many transaction requests, please try again later.",
  },
  standardHeaders: true,
  legacyHeaders: false,
});
