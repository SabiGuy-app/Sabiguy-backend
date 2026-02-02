const express = require('express');
const router = express.Router();
const FCMController = require ('../controllers/fcm');
const authMiddleware = require ('../middleware/authMiddleware');

/** 
 *  @swagger
 * /api/v1/fcm/register:
 *   post:
 *     summary: Register FCM token for user
 *     tags: [FCM]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - fcmToken
 *             properties:
 *               fcmToken:
 *                 type: string
 *                 description: Firebase Cloud Messaging token
 *                 example: dF7xKjH9Qk2...
 *               deviceType:
 *                 type: string
 *                 enum: [ios, android, web]
 *                 description: Device type
 *                 example: android
 *               deviceId:
 *                 type: string
 *                 description: Unique device identifier
 *                 example: abc123def456
 *     responses:
 *       200:
 *         description: FCM token registered successfully
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
 *                   example: FCM token registered successfully
 *       400:
 *         description: FCM token is required
 *       500:
 *         description: Server error
 */
router.post('/register', authMiddleware, FCMController.registerFCMDevice);

/**
 * @swagger
 * /api/v1/fcm/token:
 *   delete:
 *     summary: Remove FCM token (logout)
 *     tags: [FCM]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: FCM token removed successfully
 *       500:
 *         description: Server error
 */
router.delete('/token', authMiddleware, FCMController.removeToken);

/**
 * @swagger
 * /api/v1/fcm/test:
 *   post:
 *     summary: Send test notification (Development only)
 *     tags: [FCM]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               title:
 *                 type: string
 *                 example: Test Notification
 *               message:
 *                 type: string
 *                 example: This is a test notification
 *     responses:
 *       200:
 *         description: Test notification sent
 *       500:
 *         description: Server error
 */
router.post('/test', authMiddleware, FCMController.testNotification);

module.exports = router;
