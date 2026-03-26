const express = require("express");
const router = express.Router();
const authMiddleware = require("../middleware/authMiddleware");
const AdminController = require("../controllers/admin");
const rateLimit = require("express-rate-limit");

const adminCreateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { message: "Too many requests, please try again later." },
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
router.post("/create", adminCreateLimiter, AdminController.createAdmin);

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
  authMiddleware,
  adminVerifyKycLimiter,
  AdminController.verifyKyc,
);

module.exports = router;
