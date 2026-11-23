const express = require("express");
const router = express.Router();
const authMiddleware = require("../../../middleware/authMiddleware");
const onlyRole = require("../../../middleware/roleMiddleware");
const controller = require("./campaign.controller");

/**
 * @swagger
 * tags:
 *   - name: Campaigns
 *     description: Promotional campaigns, spin rewards, and promotional credits
 */

/**
 * @swagger
 * /api/v1/campaigns/scans/{slug}:
 *   post:
 *     summary: Record a campaign QR scan
 *     tags: [Campaigns]
 *     parameters:
 *       - in: path
 *         name: slug
 *         required: true
 *         schema:
 *           type: string
 *         example: shift-hcc-stageplay
 *     responses:
 *       200:
 *         description: QR scan recorded
 *       404:
 *         description: Campaign not found
 */
router.post("/scans/:slug", controller.recordScan);

/**
 * @swagger
 * /api/v1/campaigns/{slug}/metrics/{metric}:
 *   post:
 *     summary: Record a campaign success metric
 *     description: Requires authentication. Supported metrics are registrations, providerRegistrations, and bookingsGenerated.
 *     tags: [Campaigns]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: slug
 *         required: true
 *         schema:
 *           type: string
 *         example: shift-hcc-stageplay
 *       - in: path
 *         name: metric
 *         required: true
 *         schema:
 *           type: string
 *           enum: [registrations, providerRegistrations, bookingsGenerated]
 *     responses:
 *       200:
 *         description: Metric recorded
 *       400:
 *         description: Invalid metric
 *       401:
 *         description: Authentication required
 *       404:
 *         description: Campaign not found
 */
router.post("/:slug/metrics/:metric", authMiddleware, controller.recordMetric);

/**
 * @swagger
 * /api/v1/campaigns/{slug}:
 *   get:
 *     summary: Get campaign details
 *     tags: [Campaigns]
 *     parameters:
 *       - in: path
 *         name: slug
 *         required: true
 *         schema:
 *           type: string
 *         example: shift-hcc-stageplay
 *     responses:
 *       200:
 *         description: Campaign details
 *       404:
 *         description: Campaign not found
 */
router.get("/:slug", controller.getCampaign);

/**
 * @swagger
 * /api/v1/campaigns/{slug}/participation:
 *   get:
 *     summary: Get a user's campaign participation and spins
 *     tags: [Campaigns]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: slug
 *         required: true
 *         schema:
 *           type: string
 *         example: shift-hcc-stageplay
 *     responses:
 *       200:
 *         description: Participation details, available spins, spin history, and active promotional credits
 *       401:
 *         description: Authentication required
 *       404:
 *         description: Campaign not found
 */
router.get("/:slug/participation", authMiddleware, controller.getParticipation);

/**
 * @swagger
 * /api/v1/campaigns/{slug}/spin:
 *   post:
 *     summary: Use the user's next campaign spin
 *     description: |
 *       The first spin is an engagement-only spin. The second spin determines the reward.
 *       The request is idempotent when the same Idempotency-Key or idempotencyKey value is reused.
 *     tags: [Campaigns]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: header
 *         name: Idempotency-Key
 *         required: true
 *         schema:
 *           type: string
 *         description: Unique key for this spin request
 *         example: shift-012345-spin-2
 *       - in: path
 *         name: slug
 *         required: true
 *         schema:
 *           type: string
 *         example: shift-hcc-stageplay
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               idempotencyKey:
 *                 type: string
 *                 example: shift-012345-spin-2
 *     responses:
 *       200:
 *         description: Spin outcome and remaining spin count
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     spinNumber: { type: integer, enum: [1, 2], example: 2 }
 *                     outcome:
 *                       type: object
 *                       properties:
 *                         code: { type: string, enum: [ENGAGEMENT, NGN5000, NGN2500, NGN1000, NGN500, NGN200, NGN100, TRY_AGAIN], example: NGN500 }
 *                         label: { type: string, example: NGN 500 }
 *                         amount: { type: number, example: 500 }
 *                     availableSpins: { type: integer, example: 0 }
 *                     credit:
 *                       type: object
 *                       nullable: true
 *                       properties:
 *                         amount: { type: number, example: 500 }
 *                         expiresAt: { type: string, format: date-time }
 *       400:
 *         description: Invalid or reused spin state, inactive campaign, or exhausted reward inventory
 *       401:
 *         description: Authentication required
 *       404:
 *         description: Campaign not found
 */
router.post("/:slug/spin", authMiddleware, onlyRole("buyer"), controller.spin);

/**
 * @swagger
 * /api/v1/campaigns/credits/mine:
 *   get:
 *     summary: Get the user's active promotional campaign credits
 *     tags: [Campaigns]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Active credits ordered by earliest expiry
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       originalAmount: { type: number, example: 500 }
 *                       remainingAmount: { type: number, example: 500 }
 *                       usedAmount: { type: number, example: 0 }
 *                       expiresAt: { type: string, format: date-time }
 *                       status: { type: string, enum: [active, used, expired], example: active }
 *       401:
 *         description: Authentication required
 */
router.get("/credits/mine", authMiddleware, controller.getCredits);

/**
 * @swagger
 * /api/v1/campaigns:
 *   post:
 *     summary: Create a promotional campaign
 *     description: Requires super admin access through the existing admin role middleware.
 *     tags: [Campaigns]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [slug, name]
 *             properties:
 *               slug: { type: string, example: shift-hcc-stageplay }
 *               name: { type: string, example: SHIFT HCC Annual Stageplay }
 *               status: { type: string, enum: [draft, active, paused, closed], example: draft }
 *               startsAt: { type: string, format: date-time }
 *               endsAt: { type: string, format: date-time }
 *               maxRewardSpins: { type: integer, default: 350, example: 350 }
 *               maxPayout: { type: number, default: 50000, example: 50000 }
 *               spinsPerUser: { type: integer, default: 2, example: 2 }
 *               creditValidityDays: { type: integer, default: 30, example: 30 }
 *               prizes:
 *                 type: array
 *                 description: Optional custom prize inventory. SHIFT defaults are used when omitted.
 *                 items:
 *                   type: object
 *                   required: [code, label, amount, remaining]
 *                   properties:
 *                     code: { type: string, example: NGN500 }
 *                     label: { type: string, example: NGN 500 }
 *                     amount: { type: number, example: 500 }
 *                     remaining: { type: integer, example: 20 }
 *     responses:
 *       201:
 *         description: Campaign created
 *       400:
 *         description: Invalid payload or inventory/payout mismatch
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Admin access required
 */
router.post("/", authMiddleware, onlyRole("admin"), controller.createCampaign);

/**
 * @swagger
 * /api/v1/campaigns/{campaignId}/status:
 *   patch:
 *     summary: Activate, pause, or close a campaign
 *     description: Requires super admin access through the existing admin role middleware.
 *     tags: [Campaigns]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: campaignId
 *         required: true
 *         schema:
 *           type: string
 *         example: 672a1b2c3d4e5f6789012345
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [status]
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [draft, active, paused, closed]
 *                 example: active
 *     responses:
 *       200:
 *         description: Campaign status updated
 *       400:
 *         description: Invalid status
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Admin access required
 *       404:
 *         description: Campaign not found
 */
router.patch("/:campaignId/status", authMiddleware, onlyRole("admin"), controller.setStatus);

module.exports = router;
