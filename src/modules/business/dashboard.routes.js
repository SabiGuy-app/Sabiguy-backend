const express = require("express");
const router = express.Router({ mergeParams: true });
const { getDashboardStats, getDashboardActivity } = require("./dashboard.controller");
const authMiddleware = require("../../../middleware/authMiddleware");
const onlyRole = require("../../../middleware/roleMiddleware");

/**
 * @swagger
 * tags:
 *   name: Business Dashboard
 *   description: Business owner dashboard routes
 */

/**
 * @swagger
 * /api/v1/business/{businessId}/dashboard/stats:
 *   get:
 *     summary: Dashboard KPI stats
 *     description: Returns the overview KPI cards (bookings today, active bookings, active staff breakdown and rating). Earned-today and the earnings chart are omitted until a business payment source exists.
 *     tags: [Business Dashboard]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: businessId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Dashboard stats fetched successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     earnedToday:
 *                       type: number
 *                       nullable: true
 *                       description: Null until a business payment/escrow source exists.
 *                     bookingsToday:
 *                       type: object
 *                       properties:
 *                         total: { type: number }
 *                         completed: { type: number }
 *                         scheduled: { type: number }
 *                     activeBookings:
 *                       type: object
 *                       properties:
 *                         total: { type: number }
 *                     activeStaff:
 *                       type: object
 *                       properties:
 *                         total: { type: number }
 *                         onRoad: { type: number }
 *                         onSite: { type: number }
 *                     rating:
 *                       type: object
 *                       properties:
 *                         average: { type: number }
 *                         count: { type: number }
 *       400:
 *         description: Invalid business ID
 *       401:
 *         description: Invalid or missing token
 *       403:
 *         description: Business owner access only, or not your business
 *       500:
 *         description: Server error
 */
router.get(
  "/:businessId/dashboard/stats",
  authMiddleware,
  onlyRole("businessOwner"),
  getDashboardStats,
);

/**
 * @swagger
 * /api/v1/business/{businessId}/dashboard/activity:
 *   get:
 *     summary: Dashboard live activity feed
 *     description: Returns the business's recent notifications as a live activity feed, newest first.
 *     tags: [Business Dashboard]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: businessId
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: limit
 *         required: false
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 50
 *           default: 10
 *     responses:
 *       200:
 *         description: Dashboard activity fetched successfully
 *       400:
 *         description: Invalid business ID
 *       401:
 *         description: Invalid or missing token
 *       403:
 *         description: Business owner access only, or not your business
 *       500:
 *         description: Server error
 */
router.get(
  "/:businessId/dashboard/activity",
  authMiddleware,
  onlyRole("businessOwner"),
  getDashboardActivity,
);

module.exports = router;
