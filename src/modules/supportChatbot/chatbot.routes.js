const express = require("express");
const router = express.Router();
const authMiddleware = require ('../../../middleware/authMiddleware')
const supportChatbotController = require ('./chatbot.controller')

/**
 * @swagger
 * tags:
 *   name: Support Chatbot
 *   description: AI support assistant endpoints
 */

/**
 * @swagger
 * /api/v1/support-chatbot/chat:
 *   post:
 *     summary: Chat with support bot
 *     tags: [Support Chatbot]
 *     security:
 *       - bearerAuth: []
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
 *                 example: "I want to cancel my booking"
 *               bookingId:
 *                 type: string
 *                 example: "67a1234567890abcdef12345"
 *               conversationHistory:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     role:
 *                       type: string
 *                       enum: [user, assistant]
 *                     content:
 *                       type: string
 *     responses:
 *       200:
 *         description: Chatbot response generated
 *       400:
 *         description: Message is required
 *       401:
 *         description: Authentication required
 *       500:
 *         description: Server error
 */
router.post("/chat", authMiddleware, supportChatbotController.chat);

/**
 * @swagger
 * /api/v1/support-chatbot/public-chat:
 *   post:
 *     summary: Chat with support bot without authentication
 *     tags: [Support Chatbot]
 *     security: []
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
 *                 example: "What services do you offer?"
 *               visitorName:
 *                 type: string
 *                 example: "Amina"
 *               conversationHistory:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     role:
 *                       type: string
 *                       enum: [user, assistant]
 *                     content:
 *                       type: string
 *     responses:
 *       200:
 *         description: Public chatbot response generated
 *       400:
 *         description: Message is required
 *       500:
 *         description: Server error
 */
router.post("/public-chat", supportChatbotController.publicChat);

/**
 * @swagger
 * /api/v1/support-chatbot/history:
 *   get:
 *     summary: Get support chatbot conversation history
 *     tags: [Support Chatbot]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: ticketId
 *         required: false
 *         schema:
 *           type: string
 *         description: Optional support ticket ID to fetch one conversation thread
 *       - in: query
 *         name: status
 *         required: false
 *         schema:
 *           type: string
 *           enum: [open, in-progress, resolved, closed]
 *         description: Optional ticket status filter
 *       - in: query
 *         name: userId
 *         required: false
 *         schema:
 *           type: string
 *         description: Admin-only filter to fetch one user's chatbot history
 *       - in: query
 *         name: page
 *         required: false
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         required: false
 *         schema:
 *           type: integer
 *           default: 20
 *     responses:
 *       200:
 *         description: Conversation history returned successfully
 *       400:
 *         description: Invalid ticket ID
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Access denied
 *       500:
 *         description: Server error
 */
router.get(
  "/history",
  authMiddleware,
  supportChatbotController.getConversationHistory,
);

/**
 * @swagger
 * /api/v1/support-chatbot/faqs:
 *   get:
 *     summary: Get support FAQs
 *     tags: [Support Chatbot]
 *     security: []
 *     parameters:
 *       - in: query
 *         name: ids
 *         schema:
 *           type: string
 *         description: Comma-separated FAQ IDs (e.g. 1,2,5)
 *     responses:
 *       200:
 *         description: FAQs returned successfully
 *       500:
 *         description: Server error
 */
router.get("/faqs", supportChatbotController.getFAQ);

/**
 * @swagger
 * /api/v1/support-chatbot/booking/{bookingId}:
 *   get:
 *     summary: Get booking context for support
 *     tags: [Support Chatbot]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: bookingId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Booking context returned
 *       404:
 *         description: Booking not found
 *       500:
 *         description: Server error
 */
router.get(
  "/booking/:bookingId",
  authMiddleware,
  supportChatbotController.getBookingInfo,
);

module.exports = router;
