const express = require('express');
const router = express.Router();
const paymentController = require('../controllers/payment');
const authMiddleware = require ('../middleware/authMiddleware');
const onlyRole = require ('../middleware/roleMiddleware.js')


/**
 * @swagger
 * /api/v1/payment/initialize:
 *   post:
 *     summary: Initialize payment for a booking (Escrow)
 *     description: Creates a Paystack payment link. Money goes to escrow (platform holds it).
 *     tags: [Payment]
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
 *                 example: 507f1f77bcf86cd799439011
 *                 description: ID of the booking to pay for
 *     responses:
 *       200:
 *         description: Payment initialized successfully
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
 *                   example: Payment initialized successfully
 *                 data:
 *                   type: object
 *                   properties:
 *                     authorizationUrl:
 *                       type: string
 *                       example: https://checkout.paystack.com/abc123xyz
 *                       description: Redirect user to this URL to complete payment
 *                     accessCode:
 *                       type: string
 *                       example: abc123xyz
 *                     reference:
 *                       type: string
 *                       example: PAY_1234567890_ABC123
 *                       description: Payment reference for verification
 *                     totalAmount:
 *                       type: number
 *                       example: 5500
 *                       description: Total amount to pay (including platform fee)
 *                     agreedPrice:
 *                       type: number
 *                       example: 5000
 *                       description: Amount that goes to provider
 *                     serviceFee:
 *                       type: number
 *                       example: 500
 *                       description: Platform fee (10%)
 *       400:
 *         description: Booking ID required or booking not ready for payment
 *       500:
 *         description: Payment initialization failed
 */
router.post('/initialize', authMiddleware, paymentController.initializePayment);

/**
 * @swagger
 * /api/v1/payment/verify/{reference}:
 *   get:
 *     summary: Verify payment after Paystack redirect
 *     description: Confirms payment was successful and moves money to escrow
 *     tags: [Payment]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: reference
 *         required: true
 *         schema:
 *           type: string
 *         description: Payment reference from initialize endpoint
 *         example: PAY_1234567890_ABC123
 *     responses:
 *       200:
 *         description: Payment verified successfully
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
 *                   example: Payment verified and funds secured in escrow
 *                 booking:
 *                   type: object
 *                   properties:
 *                     _id:
 *                       type: string
 *                     status:
 *                       type: string
 *                       example: paid_escrow
 *                     payment:
 *                       type: object
 *                       properties:
 *                         escrowStatus:
 *                           type: string
 *                           example: held
 *                         escrowAmount:
 *                           type: number
 *                           example: 5000
 *                         paidAt:
 *                           type: string
 *                           format: date-time
 *                 transaction:
 *                   type: object
 *       400:
 *         description: Invalid reference or payment failed
 *       500:
 *         description: Verification failed
 */
router.get('/verify/:reference', authMiddleware, paymentController.verifyPayment);

/**
 * @swagger
 * /api/v1/payment/release-escrow:
 *   post:
 *     summary: Release payment to provider
 *     description: Transfers money from escrow to provider's bank account (after service completion)
 *     tags: [Payment]
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
 *                 example: 507f1f77bcf86cd799439011
 *     responses:
 *       200:
 *         description: Payment released successfully
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
 *                   example: Payment released to provider
 *                 amount:
 *                   type: number
 *                   example: 5000
 *                 reference:
 *                   type: string
 *                   example: TRF_1234567890_XYZ789
 *       400:
 *         description: Booking not completed or no funds in escrow
 *       500:
 *         description: Failed to release payment
 */
router.post('/release-escrow', authMiddleware, onlyRole('buyer'), paymentController.releaseEscrow);

/**
 * @swagger
 * /api/v1/payment/withdraw-fund:
 *   post:
 *     summary: Withdraw available wallet balance to bank account
 *     tags: [Payment]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - amount
 *             properties:
 *               amount:
 *                 type: number
 *                 description: Amount to withdraw (in Naira)
 *                 example: 10000
 *     responses:
 *       200:
 *         description: Withdrawal initiated successfully
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
 *                   example: Withdrawal initiated successfully
 *                 data:
 *                   type: object
 *       400:
 *         description: Invalid request (amount missing or insufficient balance)
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server error
 */
router.post('/withdraw-fund', authMiddleware, paymentController.withdrawToBank);

/**
 * @swagger
 * /api/v1/payment/refund:
 *   post:
 *     summary: Refund payment to user
 *     description: Returns money from escrow to user (when booking is cancelled before completion)
 *     tags: [Payment]
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
 *                 example: 507f1f77bcf86cd799439011
 *               reason:
 *                 type: string
 *                 example: Service cancelled by user
 *     responses:
 *       200:
 *         description: Refund processed successfully
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
 *                   example: Refund processed successfully
 *                 amount:
 *                   type: number
 *                   example: 5000
 *                 reference:
 *                   type: string
 *                   example: RFD_1234567890_ABC456
 *       400:
 *         description: No funds to refund
 *       500:
 *         description: Refund failed
 */
router.post('/refund', authMiddleware, paymentController.refundPayment);

/**
 * @swagger
 * /api/v1/payment/webhook:
 *   post:
 *     summary: Paystack webhook endpoint
 *     description: Receives payment notifications from Paystack (automatically called by Paystack)
 *     tags: [Payment]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               event:
 *                 type: string
 *                 example: charge.success
 *               data:
 *                 type: object
 *     responses:
 *       200:
 *         description: Webhook processed
 *       400:
 *         description: Invalid signature
 */
router.post('/webhook', paymentController.handleWebhook);

/**
 * @swagger
 * /api/v1/payment/banks:
 *   get:
 *     summary: Get list of Nigerian banks
 *     description: Returns all available banks for bank account setup
 *     tags: [Payment]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Banks retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       name:
 *                         type: string
 *                         example: Guaranty Trust Bank
 *                       code:
 *                         type: string
 *                         example: "058"
 *                       slug:
 *                         type: string
 *                         example: guaranty-trust-bank
 *       500:
 *         description: Failed to fetch banks
 */
router.get('/banks', authMiddleware, paymentController.getBanks);

/**
 * @swagger
 * /api/v1/payment/verify-bank:
 *   post:
 *     summary: Verify bank account details
 *     description: Confirms account number and gets account name
 *     tags: [Payment]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - accountNumber
 *               - bankCode
 *             properties:
 *               accountNumber:
 *                 type: string
 *                 example: "0123456789"
 *               bankCode:
 *                 type: string
 *                 example: "058"
 *                 description: Bank code from /payment/banks endpoint
 *     responses:
 *       200:
 *         description: Account verified successfully
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
 *                     accountName:
 *                       type: string
 *                       example: John Doe
 *                     accountNumber:
 *                       type: string
 *                       example: "0123456789"
 *       400:
 *         description: Invalid account details
 *       500:
 *         description: Verification failed
 */
router.post('/verify-bank', authMiddleware, paymentController.verifyBankAccount);

module.exports = router;

