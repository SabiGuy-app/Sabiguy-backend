const express = require("express");
const router = express.Router();
const authMiddleware = require("../middleware/authMiddleware");
const AdminController = require("../controllers/admin");
const rateLimit = require("express-rate-limit");
const onlyRole = require("../middleware/roleMiddleware");

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
  message: { message: "Too many authentication requests, please try again later." },
});

const adminVerifyKycLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 50,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { message: "Too many KYC verification requests, please try again later." },
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
 *     tags: [Admin]
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
router.post("/create",  AdminController.createAdmin);

/**
 * @swagger
 * /api/v1/admin/login:
 *   post:
 *     summary: Admin login
 *     tags: [Admin]
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
 *     tags: [Admin]
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
 * /api/v1/admin/users/{userType}/{userId}/deactivate:
 *   patch:
 *     summary: Deactivate or activate a user
 *     tags: [Admin]
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
 *     tags: [Admin]
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
 *     tags: [Admin]
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

module.exports = router;
