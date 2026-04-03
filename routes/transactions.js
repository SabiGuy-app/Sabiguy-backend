const express = require("express");
const router = express.Router();
const transactionController = require("../controllers/transactions");
const authMiddleware = require("../middleware/authMiddleware");
const onlyRole = require("../middleware/roleMiddleware.js");
const { transactionsLimiter } = require("../middleware/rateLimiter");

/**
 * @swagger
 * /api/v1/transactions:
 *   get:
 *     summary: Get all transactions with pagination, filtering, and sorting
 *     description: Retrieve transactions with support for multiple filters including type, status, userModel, date range, and search. Results are paginated and include comprehensive statistics.
 *     tags: [Transactions]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *         description: Filter by transaction type (payment, payout, refund, escrow_hold, escrow_release, withdrawal, credit, debit, platform_fee, bonus, commission, tip)
 *         example: payment
 *       - in: query
 *         name: fromUserModel
 *         schema:
 *           type: string
 *           enum: [Buyer, Provider, Platform]
 *         description: Filter by 'from' user model
 *         example: Buyer
 *       - in: query
 *         name: toUserModel
 *         schema:
 *           type: string
 *           enum: [Buyer, Provider, Platform]
 *         description: Filter by 'to' user model
 *         example: Provider
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [pending, processing, completed, failed, reversed]
 *         description: Filter by transaction status
 *         example: completed
 *       - in: query
 *         name: bookingId
 *         schema:
 *           type: string
 *         description: Filter by booking ID (MongoDB ObjectId)
 *         example: 507f1f77bcf86cd799439011
 *       - in: query
 *         name: userId
 *         schema:
 *           type: string
 *         description: Filter by user ID (either as from or to user)
 *         example: 507f1f77bcf86cd799439012
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search by transaction reference or description (regex search)
 *         example: PAY_12345
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date-time
 *         description: Filter transactions from this date onwards (ISO 8601 format)
 *         example: 2026-01-01T00:00:00Z
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date-time
 *         description: Filter transactions up to this date (ISO 8601 format)
 *         example: 2026-03-31T23:59:59Z
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *           minimum: 1
 *         description: Page number for pagination
 *         example: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *           minimum: 1
 *           maximum: 100
 *         description: Number of transactions per page
 *         example: 10
 *       - in: query
 *         name: sortBy
 *         schema:
 *           type: string
 *           default: createdAt
 *           enum: [createdAt, amount, status, type, reference]
 *         description: Sort field
 *         example: createdAt
 *       - in: query
 *         name: sortOrder
 *         schema:
 *           type: string
 *           default: desc
 *           enum: [asc, desc]
 *         description: Sort order (ascending or descending)
 *         example: desc
 *     responses:
 *       200:
 *         description: Transactions retrieved successfully with pagination and statistics
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
 *                     type: object
 *                     properties:
 *                       _id:
 *                         type: string
 *                         example: 507f1f77bcf86cd799439013
 *                       reference:
 *                         type: string
 *                         example: PAY_1234567890_ABC123
 *                       type:
 *                         type: string
 *                         example: payment
 *                       from:
 *                         type: object
 *                         properties:
 *                           userId:
 *                             type: string
 *                           userModel:
 *                             type: string
 *                             example: Buyer
 *                           walletId:
 *                             type: string
 *                       to:
 *                         type: object
 *                         properties:
 *                           userId:
 *                             type: string
 *                           userModel:
 *                             type: string
 *                             example: Provider
 *                           walletId:
 *                             type: string
 *                       amount:
 *                         type: number
 *                         example: 5000
 *                       status:
 *                         type: string
 *                         example: completed
 *                       breakdown:
 *                         type: object
 *                         properties:
 *                           agreedPrice:
 *                             type: number
 *                           serviceFee:
 *                             type: number
 *                           totalAmount:
 *                             type: number
 *                       description:
 *                         type: string
 *                       bookingId:
 *                         type: string
 *                       gateway:
 *                         type: object
 *                         properties:
 *                           name:
 *                             type: string
 *                             example: paystack
 *                           reference:
 *                             type: string
 *                       metadata:
 *                         type: object
 *                       createdAt:
 *                         type: string
 *                         format: date-time
 *                       completedAt:
 *                         type: string
 *                         format: date-time
 *                 pagination:
 *                   type: object
 *                   properties:
 *                     total:
 *                       type: integer
 *                       example: 150
 *                     totalPages:
 *                       type: integer
 *                       example: 15
 *                     currentPage:
 *                       type: integer
 *                       example: 1
 *                     perPage:
 *                       type: integer
 *                       example: 10
 *                 stats:
 *                   type: object
 *                   properties:
 *                     byType:
 *                       type: object
 *                       additionalProperties:
 *                         type: object
 *                         properties:
 *                           count:
 *                             type: integer
 *                           totalAmount:
 *                             type: number
 *                       example:
 *                         payment:
 *                           count: 50
 *                           totalAmount: 250000
 *                         payout:
 *                           count: 40
 *                           totalAmount: 200000
 *                     byStatus:
 *                       type: object
 *                       additionalProperties:
 *                         type: object
 *                         properties:
 *                           count:
 *                             type: integer
 *                           totalAmount:
 *                             type: number
 *                       example:
 *                         completed:
 *                           count: 80
 *                           totalAmount: 400000
 *                         pending:
 *                           count: 10
 *                           totalAmount: 50000
 *                     amount:
 *                       type: object
 *                       properties:
 *                         totalAmount:
 *                           type: number
 *                           example: 450000
 *                         averageAmount:
 *                           type: number
 *                           example: 5625
 *                         minAmount:
 *                           type: number
 *                           example: 500
 *                         maxAmount:
 *                           type: number
 *                           example: 50000
 *       400:
 *         description: Invalid query parameters (e.g., invalid ID format)
 *       401:
 *         description: Unauthorized - Missing or invalid authentication token
 *       500:
 *         description: Server error while fetching transactions
 */
router.get(
  "/",
  transactionsLimiter,
  authMiddleware,
  onlyRole("admin"),
  transactionController.getAllTransactions,
);

/**
 * @swagger
 * /api/v1/transactions/{id}:
 *   get:
 *     summary: Get a specific transaction by ID
 *     description: Retrieve detailed information about a single transaction including all related entities
 *     tags: [Transactions]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Transaction ID (MongoDB ObjectId)
 *         example: 507f1f77bcf86cd799439013
 *     responses:
 *       200:
 *         description: Transaction details retrieved successfully
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
 *                     _id:
 *                       type: string
 *                     reference:
 *                       type: string
 *                     type:
 *                       type: string
 *                     from:
 *                       type: object
 *                     to:
 *                       type: object
 *                     amount:
 *                       type: number
 *                     status:
 *                       type: string
 *                     breakdown:
 *                       type: object
 *                     description:
 *                       type: string
 *                     bookingId:
 *                       type: object
 *                     gateway:
 *                       type: object
 *                     balances:
 *                       type: object
 *                     bankDetails:
 *                       type: object
 *                     error:
 *                       type: object
 *                     createdAt:
 *                       type: string
 *                       format: date-time
 *                     updatedAt:
 *                       type: string
 *                       format: date-time
 *       400:
 *         description: Invalid transaction ID format
 *       401:
 *         description: Unauthorized - Missing or invalid authentication token
 *       404:
 *         description: Transaction not found
 *       500:
 *         description: Server error while fetching transaction
 */
router.get(
  "/:id",
  transactionsLimiter,
  authMiddleware,
  onlyRole("admin"),
  transactionController.getTransactionById,
);

module.exports = router;
