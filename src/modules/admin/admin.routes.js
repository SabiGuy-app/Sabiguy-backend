const express = require("express");
const router = express.Router();
const rateLimit = require("express-rate-limit");
const authMiddleware = require("../../../middleware/authMiddleware");
const AdminController = require("./admin.controller");
const onlyRole = require("../../../middleware/roleMiddleware");

const adminCreateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { message: "Too many requests, please try again later." },
});

const adminAuthLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 100,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: {
    message: "Too many authentication requests, please try again later.",
  },
});

const adminVerifyKycLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 50,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: {
    message: "Too many KYC verification requests, please try again later.",
  },
});

const adminPaymentVerifyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 25,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: {
    message: "Too many payment verification requests, please try again later.",
  },
});

/**
 * @swagger
 * tags:
 *   name: Admin
 *   description: Admin endpoints
 */

/**
 * @swagger
 * /api/v1/admin/create:
 *   post:
 *     summary: Create admin account
 *     tags: [Admins]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *               - fullName
 *             properties:
 *               email:
 *                 type: string
 *                 example: "admin@example.com"
 *               password:
 *                 type: string
 *                 example: "StrongPassword123"
 *               fullName:
 *                 type: string
 *                 example: "Jane Admin"
 *     responses:
 *       201:
 *         description: Admin created successfully
 *       400:
 *         description: Invalid payload
 *       403:
 *         description: Admin access required
 */
router.post(
  "/create",
  adminCreateLimiter,
  adminAuthLimiter,
  AdminController.createAdmin,
);

/**
 * @swagger
 * /api/v1/admin/{bookingId}/delete-booking:
 *   delete:
 *     summary: Delete booking
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: bookingId
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *           example: "booking123"
 *     responses:
 *       200:
 *         description: Booking deleted successfully
 *       403:
 *         description: Admin access required
 *       404:
 *         description: Booking not found
 */

router.delete(
  "/:bookingId/delete-booking",
  authMiddleware,
  onlyRole("admin"),
  AdminController.deleteBooking,
);

/**
 * @swagger
 * /api/v1/admin/bookings/{bookingId}/payment/verify:
 *   patch:
 *     summary: Manually verify a booking payment
 *     description: Re-runs Paystack verification and moves the booking to paid_escrow when the charge is already successful in Paystack but the app did not reconcile it.
 *     tags: [Admins]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: bookingId
 *         required: true
 *         schema:
 *           type: string
 *         description: Booking ID
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               note:
 *                 type: string
 *                 example: "Customer paid on Paystack but callback never completed"
 *               reference:
 *                 type: string
 *                 example: "PAY_1784037255021_JDTLLA"
 *                 description: Optional Paystack transaction reference
 *               force:
 *                 type: boolean
 *                 example: false
 *                 description: Set to true only after you have confirmed the charge in Paystack dashboard and the verify API cannot resolve it
 *     responses:
 *       200:
 *         description: Payment verified successfully
 *       403:
 *         description: Admin access required
 *       404:
 *         description: Booking or payment reference not found
 */
router.patch(
  "/bookings/:bookingId/payment/verify",
  adminAuthLimiter,
  authMiddleware,
  onlyRole("admin"),
  adminPaymentVerifyLimiter,
  AdminController.verifyPayment,
);

/**
 * @swagger
 * /api/v1/admin/login:
 *   post:
 *     summary: Admin login
 *     tags: [Admins]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *             properties:
 *               email:
 *                 type: string
 *                 example: "admin@example.com"
 *               password:
 *                 type: string
 *                 example: "StrongPassword123"
 *     responses:
 *       200:
 *         description: Login successful
 *       400:
 *         description: Invalid credentials
 *       403:
 *         description: Email not verified
 */
router.post("/login", adminAuthLimiter, AdminController.loginAdmin);

/**
 * @swagger
 * /api/v1/admin/dashboard/stats:
 *   get:
 *     summary: Get admin dashboard statistics
 *     tags: [Admins]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Dashboard statistics retrieved successfully
 *       403:
 *         description: Admin access required
 */
router.get(
  "/dashboard/stats",
  adminAuthLimiter,
  authMiddleware,
  onlyRole("admin"),
  AdminController.getDashboardStats,
);

/**
 * @swagger
 * /api/v1/admin/online-providers:
 *   get:
 *     summary: Get online providers
 *     description: Returns providers whose location was updated within the configured freshness window and includes their latest current location.
 *     tags: [Admins]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: page
 *         in: query
 *         required: false
 *         schema:
 *           type: integer
 *           example: 1
 *         description: Page number
 *       - name: limit
 *         in: query
 *         required: false
 *         schema:
 *           type: integer
 *           example: 20
 *         description: Items per page
 *     responses:
 *       200:
 *         description: Online providers retrieved successfully
 *       500:
 *         description: Server error
 */
router.get(
  "/online-providers",
  authMiddleware,
  onlyRole("admin"),
  AdminController.getOnlineProviders,
);

/**
 * @swagger
 * /api/v1/admin/online-buyers:
 *   get:
 *     summary: Get online buyers
 *     description: Returns buyers whose location was updated within the configured freshness window and includes their latest current location.
 *     tags: [Admins]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: page
 *         in: query
 *         required: false
 *         schema:
 *           type: integer
 *           example: 1
 *         description: Page number
 *       - name: limit
 *         in: query
 *         required: false
 *         schema:
 *           type: integer
 *           example: 20
 *         description: Items per page
 *     responses:
 *       200:
 *         description: Online buyers retrieved successfully
 *       500:
 *         description: Server error
 */
router.get(
  "/online-buyers",
  authMiddleware,
  onlyRole("admin"),
  AdminController.getOnlineBuyers,
);

/**
 * @swagger
 * /api/v1/admin/platform-fee-report:
 *   get:
 *     summary: Get platform fee report for dashboard
 *     tags: [Admins]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         required: false
 *         schema:
 *           type: string
 *         description: Optional booking status filter
 *       - in: query
 *         name: page
 *         required: false
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         required: false
 *         schema:
 *           type: integer
 *           default: 20
 *     responses:
 *       200:
 *         description: Platform fee report retrieved successfully
 *       403:
 *         description: Admin access required
 *       500:
 *         description: Server error
 */
router.get(
  "/platform-fee-report",
  adminAuthLimiter,
  authMiddleware,
  onlyRole("admin"),
  AdminController.getPlatformFeeReport,
);

/**
 * @swagger
 * /api/v1/admin/platform-balance:
 *   get:
 *     summary: Get platform wallet balance
 *     tags: [Admins]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Platform balance retrieved successfully
 *       403:
 *         description: Admin access required
 *       500:
 *         description: Server error
 */
router.get(
  "/platform-balance",
  adminAuthLimiter,
  authMiddleware,
  onlyRole("admin"),
  AdminController.getPlatformBalance,
);

/**
 * @swagger
 * /api/v1/admin/users/{userType}/{userId}/deactivate:
 *   patch:
 *     summary: Deactivate or activate a user
 *     tags: [Admins]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userType
 *         required: true
 *         schema:
 *           type: string
 *           enum: [buyer, provider, admin]
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               isActive:
 *                 type: boolean
 *                 example: false
 *     responses:
 *       200:
 *         description: User status updated
 *       403:
 *         description: Admin access required
 *       404:
 *         description: User not found
 */
router.patch(
  "/users/:userType/:userId/deactivate",
  adminAuthLimiter,
  authMiddleware,
  onlyRole("admin"),
  AdminController.deactivateUser,
);

/**
 * @swagger
 * /api/v1/admin/users/{userType}/{userId}:
 *   delete:
 *     summary: Soft or hard delete a user
 *     tags: [Admins]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userType
 *         required: true
 *         schema:
 *           type: string
 *           enum: [buyer, provider, admin]
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: mode
 *         required: false
 *         schema:
 *           type: string
 *           enum: [soft, hard]
 *         description: Deletion mode (default soft)
 *     responses:
 *       200:
 *         description: User deleted
 *       403:
 *         description: Admin access required
 *       404:
 *         description: User not found
 */
router.delete(
  "/users/:userType/:userId",
  adminAuthLimiter,
  authMiddleware,
  onlyRole("admin"),
  AdminController.deleteUser,
);

/**
 * @swagger
 * /api/v1/admin/providers/{providerId}/kyc/verify:
 *   patch:
 *     summary: Verify provider KYC
 *     tags: [Admins]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: providerId
 *         required: true
 *         schema:
 *           type: string
 *         description: Provider ID
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               note:
 *                 type: string
 *                 example: "Verified documents and identity"
 *     responses:
 *       200:
 *         description: KYC verified successfully
 *       403:
 *         description: Admin access required
 *       404:
 *         description: Provider not found
 */
router.patch(
  "/providers/:providerId/kyc/verify",
  adminAuthLimiter,
  authMiddleware,
  onlyRole("admin"),
  adminVerifyKycLimiter,
  AdminController.verifyKyc,
);

/**
 * @swagger
 * /api/v1/admin/buyers/{buyerId}/kyc/verify:
 *   patch:
 *     summary: Verify buyer KYC
 *     tags: [Admins]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: buyerId
 *         required: true
 *         schema:
 *           type: string
 *         description: Buyer ID
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               note:
 *                 type: string
 *                 example: "Verified buyer NIN details"
 *     responses:
 *       200:
 *         description: Buyer KYC verified successfully
 *       403:
 *         description: Admin access required
 *       404:
 *         description: Buyer not found
 */
router.patch(
  "/buyers/:buyerId/kyc/verify",
  adminAuthLimiter,
  authMiddleware,
  onlyRole("admin"),
  adminVerifyKycLimiter,
  AdminController.verifyBuyerKyc,
);

/**
 * @swagger
 * /api/v1/admin/providers/{providerId}/kyc/dispute:
 *   patch:
 *     summary: Reject/dispute provider KYC
 *     tags: [Admins]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: providerId
 *         required: true
 *         schema:
 *           type: string
 *         description: Provider ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - reason
 *             properties:
 *               reason:
 *                 type: string
 *                 example: "Documents do not match identity requirements"
 *               note:
 *                 type: string
 *                 example: "Please resubmit with clearer images"
 *     responses:
 *       200:
 *         description: KYC disputed successfully
 *       400:
 *         description: Missing required fields
 *       403:
 *         description: Admin access required
 *       404:
 *         description: Provider not found
 */
router.patch(
  "/providers/:providerId/kyc/dispute",
  adminAuthLimiter,
  authMiddleware,
  onlyRole("admin"),
  adminVerifyKycLimiter,
  AdminController.disputeKyc,
);

module.exports = router;
