const express = require('express');
const router = express.Router();
const {
  registerBusiness,
  verifyEmail,
  resendOtp,
  login,
  googleSignUp,
  googleLogin,
  refreshAuthToken,
  me,
} = require('./business.auth.controller');
const {
  businessAuthRequestLimiter,
  businessAuthVerifyLimiter,
} = require('../../../middleware/rateLimiter');
const businessAuthMiddleware = require('../../../middleware/businessAuthMiddleware');

/**
 * @swagger
 * tags:
 *   name: Business-Auth
 *   description: Business authentication endpoints
 */

/**
 * @swagger
 * /api/v1/business/auth/signup:
 *   post:
 *     summary: Register a new business owner
 *     tags: [Business-Auth]
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email:
 *                 type: string
 *                 example: "owner@example.com"
 *               password:
 *                 type: string
 *                 example: "SecurePassword123!"
 *               fullName:
 *                 type: string
 *                 example: "John Doe"
 *               phoneNumber:
 *                 type: string
 *                 example: "+2348012345678"
 *               accountType:
 *                 type: string
 *                 example: "Sole Proprietorship"
 *               BusinessName:
 *                 type: string
 *                 example: "Sabi Guy Tech Solutions"
 *               regNumber:
 *                 type: string
 *                 example: "RC1234567"
 *               BusinessAddress:
 *                 type: string
 *                 example: "123 Main Street, Suite 4"
 *               cityOfOperation:
 *                 type: string
 *                 example: "Lagos"
 *     responses:
 *       200:
 *         description: OTP sent to email. Please verify to complete registration.
 *       400:
 *         description: Invalid request or missing required fields
 */
router.post('/signup', businessAuthRequestLimiter, registerBusiness);

/**
 * @swagger
 * /api/v1/business/auth/verify-email:
 *   post:
 *     summary: Verify business email with OTP
 *     tags: [Business-Auth]
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, otp]
 *             properties:
 *               email:
 *                 type: string
 *                 example: "owner@example.com"
 *               otp:
 *                 type: string
 *                 example: "482910"
 *     responses:
 *       200:
 *         description: Email verified successfully
 *       400:
 *         description: Invalid or expired OTP
 */
router.post('/verify-email', businessAuthVerifyLimiter, verifyEmail);

/**
 * @swagger
 * /api/v1/business/auth/resend-otp:
 *   post:
 *     summary: Resend verification OTP
 *     tags: [Business-Auth]
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email]
 *             properties:
 *               email:
 *                 type: string
 *                 example: "owner@example.com"
 *     responses:
 *       200:
 *         description: OTP resent successfully
 *       400:
 *         description: Email already verified or missing email
 *       404:
 *         description: Business not found
 */
router.post('/resend-otp', businessAuthRequestLimiter, resendOtp);

/**
 * @swagger
 * /api/v1/business/auth/login:
 *   post:
 *     summary: Login with email and password
 *     tags: [Business-Auth]
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email:
 *                 type: string
 *                 example: "owner@example.com"
 *               password:
 *                 type: string
 *                 example: "SecurePassword123!"
 *     responses:
 *       200:
 *         description: Login successful
 *       400:
 *         description: Invalid credentials
 *       403:
 *         description: Email unverified or account deactivated
 */
router.post('/login', businessAuthVerifyLimiter, login);

/**
 * @swagger
 * /api/v1/business/auth/google-signup:
 *   post:
 *     summary: Sign up with Google OAuth
 *     tags: [Business-Auth]
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [token]
 *             properties:
 *               token:
 *                 type: string
 *                 example: "eyJhbGciOiJSUzI1NiIsImtpZCI6I..."
 *     responses:
 *       200:
 *         description: Google signup successful
 *       400:
 *         description: Missing token or email already in use
 *       401:
 *         description: Invalid Google token
 */
router.post('/google-signup', businessAuthRequestLimiter, googleSignUp);

/**
 * @swagger
 * /api/v1/business/auth/google-login:
 *   post:
 *     summary: Log in with Google OAuth
 *     tags: [Business-Auth]
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [token]
 *             properties:
 *               token:
 *                 type: string
 *                 example: "eyJhbGciOiJSUzI1NiIsImtpZCI6I..."
 *     responses:
 *       200:
 *         description: Google login successful
 *       400:
 *         description: Account registered with password
 *       401:
 *         description: Google account mismatch or invalid token
 *       404:
 *         description: Business account not found
 */
router.post('/google-login', businessAuthVerifyLimiter, googleLogin);

/**
 * @swagger
 * /api/v1/business/auth/refresh:
 *   post:
 *     summary: Refresh JWT access token
 *     tags: [Business-Auth]
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [refreshToken]
 *             properties:
 *               refreshToken:
 *                 type: string
 *                 example: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
 *     responses:
 *       200:
 *         description: Token refreshed successfully
 *       400:
 *         description: Missing refresh token
 *       401:
 *         description: Expired or invalid refresh token
 */
router.post('/refresh', refreshAuthToken);

/**
 * @swagger
 * /api/v1/business/auth/me:
 *   get:
 *     summary: Get current authenticated business profile
 *     tags: [Business-Auth]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Business profile retrieved successfully
 *       401:
 *         description: Unauthorized - Missing or invalid token
 */
router.get('/me', businessAuthMiddleware, me);

module.exports = router;
