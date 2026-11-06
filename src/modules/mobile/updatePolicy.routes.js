const express = require("express");
const authMiddleware = require("../../../middleware/authMiddleware");
const controller = require("./updatePolicy.controller");

const mobileRouter = express.Router();

/**
 * @swagger
 * tags:
 *   - name: Mobile Update Policy
 *     description: Mobile app update policy
 */

/**
 * @swagger
 * /api/mobile/update-policy:
 *   get:
 *     summary: Get the active update policy for a mobile app
 *     description: Public endpoint. Returns the active policy for the requested platform and trigger, preferring an exact platform match and falling back to `both`.
 *     tags: [Mobile Update Policy]
 *     parameters:
 *       - in: query
 *         name: platform
 *         required: true
 *         schema:
 *           type: string
 *           enum: [ios, android]
 *       - in: query
 *         name: trigger_timing
 *         required: true
 *         schema:
 *           type: string
 *           enum: [app_launch, after_login, on_home_screen]
 *     responses:
 *       200:
 *         description: Matching policy, or null when no active policy matches
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: OK }
 *                 data:
 *                   oneOf:
 *                     - $ref: '#/components/schemas/MobileUpdatePolicy'
 *                     - type: object
 *                       nullable: true
 *       400:
 *         description: Missing or invalid query parameters
 *       500:
 *         description: Failed to fetch update policy
 */
mobileRouter.get("/update-policy", controller.getPublicPolicy);

const adminRouter = express.Router();
adminRouter.use(authMiddleware, (req, res, next) => {
  if (req.user?.role !== "admin") return res.status(403).json({ success: false, message: "Admin access only" });
  next();
});

/**
 * @swagger
 * /api/admin/mobile/update-policy:
 *   get:
 *     summary: List mobile update policies
 *     description: Requires an authenticated admin. Optional filters can select a platform and/or trigger timing.
 *     tags: [Mobile Update Policy]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: platform
 *         schema:
 *           type: string
 *           enum: [ios, android, both]
 *       - in: query
 *         name: trigger_timing
 *         schema:
 *           type: string
 *           enum: [app_launch, after_login, on_home_screen]
 *     responses:
 *       200:
 *         description: Policies matching the optional filters
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: OK }
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/MobileUpdatePolicy'
 *       400:
 *         description: Invalid filter
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Admin access required
 */
adminRouter.get("/update-policy", controller.getAdminPolicies);

/**
 * @swagger
 * /api/admin/mobile/update-policy:
 *   put:
 *     summary: Create or update a mobile update policy
 *     description: Requires an authenticated admin. One policy is stored per platform and trigger timing. Force updates must be non-dismissible and minimum_required_version cannot exceed latest_version.
 *     tags: [Mobile Update Policy]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             allOf:
 *               - $ref: '#/components/schemas/MobileUpdatePolicyInput'
 *     responses:
 *       200:
 *         description: Policy saved
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: Update policy saved }
 *                 data:
 *                   $ref: '#/components/schemas/MobileUpdatePolicy'
 *       400:
 *         description: Invalid or incomplete policy
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Admin access required
 *       500:
 *         description: Failed to save update policy
 */
adminRouter.put("/update-policy", controller.upsertPolicy);

module.exports = { mobileRouter, adminRouter };
