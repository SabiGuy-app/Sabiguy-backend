const express = require('express');
const router = express.Router();
const WalletController = require('../controllers/wallet');
const authMiddleware = require ('../middleware/authMiddleware');
 /** 
 * @swagger
 * /api/v1/wallet/balance:
 *   get:
 *     summary: Get wallet balance
 *     tags: [Wallet]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Balance retrieved successfully
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
 *                     available:
 *                       type: number
 *                       example: 15000
 *                     pending:
 *                       type: number
 *                       example: 5000
 *                     total:
 *                       type: number
 *                       example: 20000
 *                     totalEarnings:
 *                       type: number
 *                       example: 50000
 *                     totalWithdrawals:
 *                       type: number
 *                       example: 30000
 */
router.get('/balance', authMiddleware, WalletController.getBalance);

/** 
 * @swagger
 * /api/v1/wallet/fund:
 *   post:
 *     summary: Fund wallet (initiate payment)
 *     tags: [Wallet]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               amount:
 *                 type: number
 *                 example: 10000
 *     responses:
 *       200:
 *         description: Wallet funding initiated
 */
router.post('/fund', authMiddleware, WalletController.fundWallet);

/**
 * @swagger
 * /api/v1/wallet/fund/verify/{reference}:
 *   get:
 *     summary: Verify wallet funding payment
 *     tags: [Wallet]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: reference
 *         required: true
 *         schema:
 *           type: string
 *         description: Paystack transaction reference
 *     responses:
 *       200:
 *         description: Wallet funded successfully
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
 *                   example: Wallet funded successfully
 *                 data:
 *                   type: object
 *                   properties:
 *                     balance:
 *                       type: object
 *                       properties:
 *                         total:
 *                           type: number
 *                           example: 15000
 *                         available:
 *                           type: number
 *                           example: 15000
 *                     transaction:
 *                       type: object
 *                       properties:
 *                         reference:
 *                           type: string
 *                         amount:
 *                           type: number
 *                         status:
 *                           type: string
 *                           example: success
 *       400:
 *         description: Invalid or failed transaction
 *       404:
 *         description: Transaction not found
 *       500:
 *         description: Server error
 */

router.get('/fund/verify/:reference', authMiddleware, WalletController.verifyWalletFunding);
/**
 * @swagger
 * /api/v1/wallet/pay:
 *   post:
 *     summary: Pay for a booking using wallet balance
 *     tags: [Wallet]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - bookingId
 *             properties:
 *               bookingId:
 *                 type: string
 *                 description: Booking ID to pay for
 *                 example: 6970e9663c21790077bd6464
 *     responses:
 *       200:
 *         description: Wallet payment successful
 *       400:
 *         description: Insufficient wallet balance or invalid booking
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server error
 */
router.post('/pay', authMiddleware, WalletController.payFromWallet);

/**
 * @swagger
 * /api/v1/wallet/transactions:
 *   get:
 *     summary: Get wallet transaction history
 *     tags: [Wallet]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           example: 1
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           example: 10
 *         description: Number of records per page
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *           enum: [credit, debit, escrow_hold, escrow_release, withdrawal, refund]
 *         description: Filter by transaction type
 *     responses:
 *       200:
 *         description: Transaction history retrieved successfully
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
 *                     transactions:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           _id:
 *                             type: string
 *                           type:
 *                             type: string
 *                             example: credit
 *                           amount:
 *                             type: number
 *                             example: 5000
 *                           status:
 *                             type: string
 *                             example: success
 *                           reference:
 *                             type: string
 *                           createdAt:
 *                             type: string
 *                             format: date-time
 *                     pagination:
 *                       type: object
 *                       properties:
 *                         page:
 *                           type: integer
 *                           example: 1
 *                         limit:
 *                           type: integer
 *                           example: 10
 *                         total:
 *                           type: integer
 *                           example: 42
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server error
 */

router.get('/transactions', authMiddleware, WalletController.getTransactions);


module.exports = router;