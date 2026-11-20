const express = require("express");
const rateLimit = require("express-rate-limit");
const authMiddleware = require("../../../middleware/authMiddleware");
const kycController = require("./kyc.controller");

const router = express.Router();
const ninVerificationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { message: "Too many NIN verification requests, please try again later." },
});

/**
 * @swagger
 * /api/v1/kyc/nin:
 *   post:
 *     summary: Verify the authenticated buyer, provider, or business owner's NIN with Dojah
 *     tags: [KYC]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [nin]
 *             properties:
 *               nin:
 *                 type: string
 *                 pattern: '^\\d{11}$'
 *                 example: '70123456789'
 *     responses:
 *       200:
 *         description: NIN verified successfully
 *       400:
 *         description: Invalid NIN format
 *       422:
 *         description: NIN could not be verified
 *       503:
 *         description: Dojah credentials are not configured
 */
router.post("/nin", authMiddleware, ninVerificationLimiter, kycController.verifyNin);

module.exports = router;
