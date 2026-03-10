const express = require("express");
const router = express.Router();
const authMiddleware = require("../middleware/authMiddleware");
const supportChatbotController = require("../controllers/supportChatbot");

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
 * /api/v1/support-chatbot/faqs:
 *   get:
 *     summary: Get support FAQs
 *     tags: [Support Chatbot]
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
