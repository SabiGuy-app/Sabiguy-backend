// routes/chat.js
const express = require('express');
const router = express.Router();
const chatController = require('../controllers/chat');
const authMiddleware = require('../middleware/authMiddleware');



/**
 * @swagger
 * components:
 *   schemas:
 *     Message:
 *       type: object
 *       properties:
 *         _id:
 *           type: string
 *           example: "507f1f77bcf86cd799439011"
 *         senderId:
 *           type: string
 *           example: "507f1f77bcf86cd799439012"
 *         senderModel:
 *           type: string
 *           enum: [User, Buyer, Provider]
 *           example: "Provider"
 *         message:
 *           type: string
 *           example: "Hello! I'm on my way"
 *         messageType:
 *           type: string
 *           enum: [text, image, file, location, system]
 *           example: "text"
 *         attachments:
 *           type: array
 *           items:
 *             type: object
 *             properties:
 *               url:
 *                 type: string
 *               type:
 *                 type: string
 *               size:
 *                 type: number
 *               name:
 *                 type: string
 *         readBy:
 *           type: array
 *           items:
 *             type: object
 *             properties:
 *               userId:
 *                 type: string
 *               readAt:
 *                 type: string
 *                 format: date-time
 *         createdAt:
 *           type: string
 *           format: date-time
 *     
 *     Chat:
 *       type: object
 *       properties:
 *         _id:
 *           type: string
 *         bookingId:
 *           type: object
 *           properties:
 *             _id:
 *               type: string
 *             serviceType:
 *               type: string
 *             status:
 *               type: string
 *         otherParticipant:
 *           type: object
 *           properties:
 *             userId:
 *               type: string
 *             userModel:
 *               type: string
 *             name:
 *               type: string
 *             avatar:
 *               type: string
 *         lastMessage:
 *           type: object
 *           properties:
 *             text:
 *               type: string
 *             timestamp:
 *               type: string
 *               format: date-time
 *         unreadCount:
 *           type: integer
 */

/**
 * @swagger
 * tags:
 *   name: Chat
 *   description: Real-time chat and messaging endpoints
 */

/**
 * @swagger
 * /api/v1/chats:
 *   get:
 *     summary: Get all user's chats
 *     description: Retrieve all active chat conversations for the authenticated user
 *     tags: [Chat]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Page number for pagination
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *         description: Number of chats per page
 *     responses:
 *       200:
 *         description: Chats retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Chat'
 *       401:
 *         description: Unauthorized - Invalid or missing token
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: "Unauthorized"
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: "Failed to fetch chats"
 */
router.get('/', authMiddleware, chatController.getUserChats);

/**
 * @swagger
 * /api/v1/chats/{bookingId}/messages:
 *   get:
 *     summary: Get messages for a specific booking
 *     description: Retrieve chat messages for a specific booking with pagination
 *     tags: [Chat]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: bookingId
 *         required: true
 *         schema:
 *           type: string
 *         description: The booking ID
 *         example: "507f191e810c19729de860ea"
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
 *           default: 50
 *         description: Messages per page
 *     responses:
 *       200:
 *         description: Messages retrieved successfully
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
 *                     messages:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/Message'
 *                     pagination:
 *                       type: object
 *                       properties:
 *                         page:
 *                           type: integer
 *                           example: 1
 *                         limit:
 *                           type: integer
 *                           example: 50
 *                         total:
 *                           type: integer
 *                           example: 15
 *                         pages:
 *                           type: integer
 *                           example: 1
 *                     participants:
 *                       type: array
 *                       items:
 *                         type: object
 *                     bookingId:
 *                       type: string
 *                       example: "507f191e810c19729de860ea"
 *                     chatAvailable:
 *                       type: boolean
 *                       example: true
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Access denied to this chat
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: "You are not authorized to access this chat"
 *       404:
 *         description: Booking not found
 *       500:
 *         description: Server error
 */
router.get('/:bookingId/messages', authMiddleware, chatController.getMessages);

/**
 * @swagger
 * /api/v1/chats/{bookingId}/messages:
 *   post:
 *     summary: Send a message (HTTP fallback)
 *     description: Send a chat message via HTTP (alternative to Socket.IO real-time messaging)
 *     tags: [Chat]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: bookingId
 *         required: true
 *         schema:
 *           type: string
 *         description: The booking ID
 *         example: "507f191e810c19729de860ea"
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - message
 *             properties:
 *               message:
 *                 type: string
 *                 example: "I'll arrive in 15 minutes"
 *                 minLength: 1
 *                 maxLength: 1000
 *                 description: The message text content
 *               messageType:
 *                 type: string
 *                 enum: [text, image, file, location, system]
 *                 default: text
 *                 description: Type of message being sent
 *               attachments:
 *                 type: array
 *                 description: Optional file attachments
 *                 items:
 *                   type: object
 *                   properties:
 *                     url:
 *                       type: string
 *                       example: "https://cloudinary.com/image.jpg"
 *                     type:
 *                       type: string
 *                       example: "image"
 *                     size:
 *                       type: number
 *                       example: 245678
 *                     name:
 *                       type: string
 *                       example: "photo.jpg"
 *           examples:
 *             textMessage:
 *               summary: Simple text message
 *               value:
 *                 message: "I'll arrive in 15 minutes"
 *                 messageType: "text"
 *             imageMessage:
 *               summary: Message with image attachment
 *               value:
 *                 message: "Here's the photo of the leak"
 *                 messageType: "image"
 *                 attachments:
 *                   - url: "https://cloudinary.com/leak.jpg"
 *                     type: "image"
 *                     size: 245678
 *                     name: "leak_photo.jpg"
 *     responses:
 *       200:
 *         description: Message sent successfully
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
 *                   example: "Message sent"
 *                 data:
 *                   $ref: '#/components/schemas/Message'
 *       400:
 *         description: Invalid request data
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: "Message cannot be empty"
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Cannot access this chat
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: "Chat not available for booking status: cancelled"
 *       404:
 *         description: Booking not found
 *       500:
 *         description: Server error
 */
router.post('/:bookingId/messages', authMiddleware, chatController.sendMessage);

/**
 * @swagger
 * /api/v1/chats/{bookingId}/read:
 *   patch:
 *     summary: Mark messages as read
 *     description: Mark all messages in a chat as read by the current user. Updates read receipts and last read timestamp.
 *     tags: [Chat]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: bookingId
 *         required: true
 *         schema:
 *           type: string
 *         description: The booking ID
 *         example: "507f191e810c19729de860ea"
 *     responses:
 *       200:
 *         description: Messages marked as read successfully
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
 *                   example: "Messages marked as read"
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Cannot access this chat
 *       404:
 *         description: Chat not found
 *       500:
 *         description: Server error
 */
router.patch('/:bookingId/read', authMiddleware, chatController.markAsRead);

module.exports = router;