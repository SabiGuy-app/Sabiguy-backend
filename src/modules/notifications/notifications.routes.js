const express = require("express");
const router = express.Router();
const authMiddleware = require("../../../middleware/authMiddleware");
const notificationController = require("./notifications.controller");

/**
 * @swagger
 * tags:
 *   name: Notifications
 *   description: Push and in-app notification endpoints
 */

/**
 * @swagger
 * /api/v1/notifications:
 *   get:
 *     summary: Get user/provider notifications
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *         description: Number of items per page
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *           enum:
 *             - _request
 *             - provider_accepted
 *             - booking_selected
 *             - booking_taken
 *             - booking_cancelled
 *             - job_started
 *             - payment_received
 *             - booking_completed
 *             - message_received
 *             - test
 *             - counter_offer
 *             - job_completed_confirmed
 *             - new_message
 *         description: Filter by notification type
 *     responses:
 *       200:
 *         description: Notifications retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     notifications:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/Notification'
 *                     pagination:
 *                       type: object
 *                       properties:
 *                         page:
 *                           type: integer
 *                         limit:
 *                           type: integer
 *                         total:
 *                           type: integer
 *                         pages:
 *                           type: integer
 *                     unreadCount:
 *                       type: integer
 *       500:
 *         description: Server error
 */
router.get("/", authMiddleware, notificationController.getNotifications);

/**
 * @swagger
 * /api/v1/notifications/{id}/read:
 *   patch:
 *     summary: Mark notification as read
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Notification ID
 *     responses:
 *       200:
 *         description: Notification marked as read
 *       404:
 *         description: Notification not found
 *       500:
 *         description: Server error
 */
router.patch("/:id/read", authMiddleware, notificationController.markAsRead);

/**
 * @swagger
 * /api/v1/notifications/read-all:
 *   patch:
 *     summary: Mark all notifications as read
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: All notifications marked as read
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: All notifications marked as read
 *                 data:
 *                   type: object
 *                   properties:
 *                     updatedCount:
 *                       type: integer
 *       500:
 *         description: Server error
 */
router.patch("/read-all", authMiddleware, notificationController.markAllAsRead);

/**
 * @swagger
 * /api/v1/notifications/{id}:
 *   delete:
 *     summary: Delete notification
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Notification ID
 *     responses:
 *       200:
 *         description: Notification deleted
 *       404:
 *         description: Notification not found
 *       500:
 *         description: Server error
 */
router.delete(
  "/:id",
  authMiddleware,
  notificationController.deleteNotification,
);

/**
 * @swagger
 * /api/v1/notifications/unread-count:
 *   get:
 *     summary: Get unread notification count
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Unread count retrieved
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     unreadCount:
 *                       type: integer
 *                       example: 5
 *       500:
 *         description: Server error
 */
router.get(
  "/unread-count",
  authMiddleware,
  notificationController.getUnreadCount,
);

/**
 * @swagger
 * /api/v1/notifications/preferences:
 *   get:
 *     summary: Get notification preferences
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Preferences retrieved successfully
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
 *                     notificationPreferences:
 *                       type: object
 *                       example:
 *                         bookings:
 *                           push: true
 *                           email: true
 *                           types:
 *                             - new_booking_request
 *                             - provider_accepted
 *                             - booking_selected
 *                             - booking_cancelled
 *                             - booking_status_updated
 *                             - booking_taken
 *                             - counter_offer
 *                         jobCompleted:
 *                           push: true
 *                           email: true
 *                           types:
 *                             - job_started
 *                             - booking_completed
 *                             - job_completed_confirmed
 *                         chatMessages:
 *                           push: true
 *                           email: false
 *                           types:
 *                             - new_message
 *                             - message_received
 *                         walletPayments:
 *                           push: true
 *                           email: true
 *                           types:
 *                             - wallet_funded
 *                             - wallet_payment
 *                             - payment_received
 *                             - payment_sent
 *                         promotions:
 *                           push: false
 *                           email: false
 *                           types:
 *                             - test
 *       500:
 *         description: Server error
 */
router.get(
  "/preferences",
  authMiddleware,
  notificationController.getNotificationPreferences,
);

/**
 * @swagger
 * /api/v1/notifications/preferences:
 *   patch:
 *     summary: Update notification preferences
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               notificationPreferences:
 *                 type: object
 *                 example:
 *                   bookings:
 *                     push: true
 *                     email: true
 *                     types:
 *                       - new_booking_request
 *                       - provider_accepted
 *                   promotions:
 *                     push: false
 *                     email: false
 *                     types:
 *                       - test
 *     responses:
 *       200:
 *         description: Preferences updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   type: object
 *                   properties:
 *                     notificationPreferences:
 *                       type: object
 *       400:
 *         description: Validation error
 *       500:
 *         description: Server error
 */
router.patch(
  "/preferences",
  authMiddleware,
  notificationController.updateNotificationPreferences,
);

/**
 * @swagger
 * /api/v1/notifications/broadcast:
 *   post:
 *     summary: Broadcast a notification to a Socket.io room
 *     description: Internal endpoint used by the cron service to push a notification to connected clients in a specific room.
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - room
 *               - notification
 *             properties:
 *               room:
 *                 type: string
 *                 example: booking_507f1f77bcf86cd799439011
 *               notification:
 *                 type: object
 *                 description: Notification payload to emit to the room
 *     responses:
 *       200:
 *         description: Notification broadcasted successfully
 *       400:
 *         description: Missing room or notification payload
 *       401:
 *         description: Unauthorized internal request
 *       500:
 *         description: Socket.io unavailable or broadcast failed
 */
router.post("/broadcast", (req, res) => {
  try {
    // Security: Verify the request is from an internal process
    const authHeader = req.headers.authorization;
    const internalSecret = process.env.INTERNAL_API_SECRET || "internal-secret";

    if (
      authHeader !== `Bearer ${internalSecret}` &&
      process.env.NODE_ENV === "production"
    ) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    const { room, notification } = req.body;

    if (!room || !notification) {
      return res.status(400).json({
        success: false,
        message: "room and notification are required",
      });
    }

    // Access Socket.io instance from app locals (set in index.js)
    const io = req.app.get("io");

    if (!io) {
      return res.status(500).json({
        success: false,
        message: "Socket.io not available",
      });
    }

    // Emit notification to the specified room
    io.to(room).emit("new_notification", notification);
    console.log(`✅ Notification broadcasted to room: ${room}`);

    res.json({
      success: true,
      message: "Notification broadcasted",
    });
  } catch (error) {
    console.error("Broadcast error:", error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

module.exports = router;
