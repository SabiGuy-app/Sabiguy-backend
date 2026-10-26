const express = require("express");
const {
  registerBuyer,
  registerProvider,
  login,
  verifyEmail,
  forgotPassword,
  resendForgotPasswordOtp,
  verifyResetOtp,
  resetPassword,
  googleSignUp,
  googleSignUpBuyer,
  googleLogIn,
  resendOTP,
  changePassword,
  confirmPassword,
  refreshAuthToken,
  initiateAccountDeletion,
  verifyAccountDeletionOtp,
  confirmAccountDeletion,
  me,
  getProfiles,
  switchProfile,
  switchToBuyer,
} = require("./auth.controller.js");
const authMiddleware = require("../../../middleware/authMiddleware.js");
const {
  changePasswordLimiter,
  authMeLimiter,
} = require("../../../middleware/rateLimiter.js");
const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Auth
 *   description: Authentication and user management routes
 */

/**
 * @swagger
 * /api/v1/auth/buyer:
 *   post:
 *     summary: Register a new buyer account
 *     tags: [Auth]
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password, phoneNumber, city, fullName]
 *             properties:
 *               fullName:
 *                 type: string
 *                 example: "John Doe"
 *               email:
 *                 type: string
 *                 example: "johndoe@example.com"
 *               password:
 *                 type: string
 *                 example: "strongpassword123"
 *               phoneNumber:
 *                 type: string
 *                 example: "+2348012345678"
 *               city:
 *                 type: string
 *                 example: "Ibadan"
 *     responses:
 *       201:
 *         description: Buyer registered successfully
 *       400:
 *         description: Invalid request
 */
router.post("/buyer", registerBuyer);

/**
 * @swagger
 * /api/v1/auth/provider:
 *   post:
 *     summary: Register a new service provider account
 *     tags: [Auth]
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [fullName, email, password, phoneNumber]
 *             properties:
 *               fullName:
 *                 type: string
 *                 example: "Queen"
 *               email:
 *                 type: string
 *                 example: "studio@example.com"
 *               password:
 *                 type: string
 *                 example: "password123"
 *               phoneNumber:
 *                 type: string
 *                 example: "12345678"
 *     responses:
 *       201:
 *         description: Provider registered successfully
 *       400:
 *         description: Invalid request
 */
router.post("/provider", registerProvider);

/**
 * @swagger
 * /api/v1/auth/email:
 *   post:
 *     summary: Verify user email after registration
 *     tags: [Auth]
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [otp]
 *             properties:
 *               otp:
 *                 type: string
 *                 example: "309875"
 *     responses:
 *       200:
 *         description: Email verified successfully
 *       400:
 *         description: Invalid or expired token
 */
router.post("/email", verifyEmail);

/**
 * @swagger
 * /api/v1/auth:
 *   post:
 *     summary: Log in a user
 *     tags: [Auth]
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
 *                 example: "user@example.com"
 *               password:
 *                 type: string
 *                 example: "password123"
 *               role:
 *                 type: string
 *                 enum: [buyer, provider, admin, businessOwner]
 *                 description: Optional role to disambiguate accounts
 *     responses:
 *       200:
 *         description: User logged in successfully
 *       401:
 *         description: Invalid credentials
 */
router.post("/", login);

/**
 * @swagger
 * /api/v1/auth/google-provider:
 *   post:
 *     summary: Register a provider with Google OAuth
 *     tags: [Auth]
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
 *                 example: "google-oauth-id-token"
 *     responses:
 *       201:
 *         description: Provider registered via Google
 *       400:
 *         description: Invalid token or user exists
 */
router.post("/google-provider", googleSignUp);

/**
 * @swagger
 * /api/v1/auth/google:
 *   post:
 *     summary: Register a buyer with Google OAuth
 *     tags: [Auth]
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
 *     responses:
 *       201:
 *         description: Buyer registered via Google
 *       400:
 *         description: Invalid token
 */
router.post("/google", googleSignUpBuyer);

/**
 * @swagger
 * /api/v1/auth/google-login:
 *   post:
 *     summary: Log in user with Google
 *     tags: [Auth]
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
 *                 example: "google-oauth-id-token"
 *     responses:
 *       200:
 *         description: Logged in via Google successfully
 *       401:
 *         description: Invalid Google credentials
 */
router.post("/google-login", googleLogIn);

/**
 * @swagger
 * /api/v1/auth/refresh:
 *   post:
 *     summary: Refresh access token
 *     tags: [Auth]
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
 *         description: Access token refreshed successfully
 *       401:
 *         description: Invalid or expired refresh token
 */
router.post("/refresh", refreshAuthToken);

/**
 * @swagger
 * /api/v1/auth/password:
 *   post:
 *     summary: Request password reset link
 *     tags: [Auth]
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
 *                 example: "user@example.com"
 *     responses:
 *       200:
 *         description: Password reset link sent
 *       404:
 *         description: User not found
 */
router.post("/password", forgotPassword);

/**
 * @swagger
 * /api/v1/auth/resend-forgot-password-otp:
 *   post:
 *     summary: Resend forgot password OTP
 *     tags: [Auth]
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
 *                 example: "user@example.com"
 *     responses:
 *       200:
 *         description: Forgot password OTP resent successfully
 *       400:
 *         description: User not found
 *       429:
 *         description: Please wait before requesting another OTP
 */
router.post("/resend-forgot-password-otp", resendForgotPasswordOtp);

/**
 * @swagger
 * /api/v1/auth/verify-reset-otp:
 *   post:
 *     summary: Validate password reset OTP
 *     tags: [Auth]
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
 *                 example: "user@example.com"
 *               otp:
 *                 type: string
 *                 example: "44576"
 *     responses:
 *       200:
 *         description: OTP verified successfully
 *       400:
 *         description: Invalid or expired OTP
 */
router.post("/verify-reset-otp", verifyResetOtp);

/**
 * @swagger
 * /api/v1/auth/reset:
 *   post:
 *     summary: Reset password using token
 *     tags: [Auth]
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, otp, newPassword]
 *             properties:
 *               email:
 *                 type: string
 *                 example: "JohnDoe@gmail.com"
 *               otp:
 *                 type: string
 *                 example: "44576"
 *               newPassword:
 *                 type: string
 *                 example: "newStrongPassword123"
 *     responses:
 *       200:
 *         description: Password reset successful
 *       400:
 *         description: Invalid or expired token
 */
router.post("/reset", resetPassword);

/**
 * @swagger
 * /api/v1/auth/resend-otp:
 *   post:
 *     summary: Resend email verification OTP
 *     tags: [Auth]
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
 *                 example: "user@example.com"
 *     responses:
 *       200:
 *         description: OTP resent successfully
 *       404:
 *         description: User not found
 *       429:
 *         description: Please wait before requesting another OTP
 */
router.post("/resend-otp", resendOTP);

/**
 * @swagger
 * /api/v1/auth/change-password:
 *   put:
 *     summary: Change password for authenticated user
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [oldPassword, newPassword]
 *             properties:
 *               oldPassword:
 *                 type: string
 *                 example: "OldPassword@123"
 *               newPassword:
 *                 type: string
 *                 example: "NewPassword@123"
 *     responses:
 *       200:
 *         description: Password changed successfully
 *       400:
 *         description: Old password/new password missing or weak new password
 *       401:
 *         description: Old password is incorrect
 *       404:
 *         description: User not found
 */
router.put(
  "/change-password",
  authMiddleware,
  changePasswordLimiter,
  changePassword,
);

/**
 * @swagger
 * /api/v1/auth/confirm-password:
 *   post:
 *     summary: Confirm the authenticated user's password
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [password]
 *             properties:
 *               password:
 *                 type: string
 *                 format: password
 *                 example: "CurrentPassword@123"
 *     responses:
 *       200:
 *         description: Password confirmed successfully
 *       400:
 *         description: Password missing or not set for this account
 *       401:
 *         description: Password is incorrect
 *       404:
 *         description: User not found
 */
router.post(
  "/confirm-password",
  authMiddleware,
  changePasswordLimiter,
  confirmPassword,
);

/**
 * @swagger
 * /api/v1/auth/initiate-account-deletion:
 *   post:
 *     summary: Send an OTP to the authenticated user to start account deletion
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Account deletion OTP sent successfully
 *       400:
 *         description: Account already deleted
 *       401:
 *         description: Invalid or missing token
 */
router.post(
  "/initiate-account-deletion",
  authMiddleware,
  initiateAccountDeletion,
);

/**
 * @swagger
 * /api/v1/auth/verify-account-deletion-otp:
 *   post:
 *     summary: Verify the OTP sent for account deletion
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [otp]
 *             properties:
 *               otp:
 *                 type: string
 *                 example: "123456"
 *     responses:
 *       200:
 *         description: OTP verified successfully
 *       400:
 *         description: Invalid or expired OTP
 */
router.post(
  "/verify-account-deletion-otp",
  authMiddleware,
  verifyAccountDeletionOtp,
);

/**
 * @swagger
 * /api/v1/auth/confirm-account-deletion:
 *   post:
 *     summary: Confirm account deletion after OTP verification
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [otp]
 *             properties:
 *               otp:
 *                 type: string
 *                 example: "123456"
 *     responses:
 *       200:
 *         description: Account deleted successfully
 *       400:
 *         description: Invalid, expired, or unverified OTP
 */
router.post(
  "/confirm-account-deletion",
  authMiddleware,
  confirmAccountDeletion,
);

/**
 * @swagger
 * /api/v1/auth/me:
 *   get:
 *     summary: Get authenticated user profile
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Authenticated user profile
 *       401:
 *         description: Invalid or missing token
 *       404:
 *         description: User not found
 */
router.get("/me", authMeLimiter, authMiddleware, me);

/**
 * @swagger
 * /api/v1/auth/profiles:
 *   get:
 *     summary: List profiles linked to the authenticated account
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Linked profiles and the active profile
 */
router.get("/profiles", authMiddleware, getProfiles);

/**
 * @swagger
 * /api/v1/auth/switch-profile:
 *   post:
 *     summary: Switch to a linked profile or securely link a new profile
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [targetRole, targetProfileId]
 *             properties:
 *               targetRole:
 *                 type: string
 *                 enum: [buyer, provider, businessOwner]
 *               targetProfileId:
 *                 type: string
 *               targetPassword:
 *                 type: string
 *                 description: Required the first time profiles are linked unless using targetGoogleToken
 *               targetGoogleToken:
 *                 type: string
 *                 description: Use instead of targetPassword for a Google-authenticated target profile
 *     responses:
 *       200:
 *         description: Profile switched; response contains new access and refresh tokens
 *       401:
 *         description: Target credentials required or invalid when linking
 *       409:
 *         description: Target profile is linked to another account group
 */
router.post("/switch-profile", authMiddleware, switchProfile);

/**
 * @swagger
 * /api/v1/auth/switch-to-buyer:
 *   post:
 *     summary: Create or reuse a linked buyer profile and switch to it
 *     description: For an authenticated provider or business owner. When no buyer profile exists for the verified email, creates one from the account's shared identity details and authentication credentials.
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Buyer profile returned with buyer-scoped access and refresh tokens
 *       403:
 *         description: Source profile is not a provider/business or its email is not verified
 *       409:
 *         description: An unlinked buyer profile or conflicting phone number already exists
 */
router.post("/switch-to-buyer", authMiddleware, switchToBuyer);

module.exports = router;
