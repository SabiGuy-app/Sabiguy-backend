const express = require("express");
const router = express.Router();
const authMiddleware = require("../middleware/authMiddleware");
const notificationController = require("../controllers/notifications");
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
 *         enum: [pending_providers, awaiting_provider_acceptance, provider_selected, provider_accepted, payment_pending, paid_escrow, in-progress, completed, cancelled, user_accepted_completion, funds_released]
 *         schema:
 *           type: integer
 *           default: 20
 *         description: Number of items per page
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *           enum:
 *             - new_booking_request
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
router.get(
  "/",
  authMiddleware,
  notificationController.getNotifications,
);

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

module.exports = router;
