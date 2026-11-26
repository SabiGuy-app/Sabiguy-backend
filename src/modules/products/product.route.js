const express = require('express');
const authMiddleware = require('../../../middleware/authMiddleware');
const {
  createProduct,
  reviewProduct,
  getProducts,
  getProductById,
  getAllProducts,
  updateProduct,
} = require('./product.controller');
const {
  getCatalog,
  createDeliveryQuote,
  createCheckout,
  verifyCheckout,
  payProductOrderFromWallet,
  getMyOrders,
  updateFulfillment,
  disputeDelivery,
  confirmDelivery,
} = require('./productOrder.controller');

const router = express.Router();

/**
 * @swagger
 * /api/v1/products/catalog:
 *   get:
 *     summary: Browse approved products
 *     tags: [Products]
 *     parameters:
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *       - in: query
 *         name: ownerType
 *         schema: { type: string, enum: [provider, business] }
 *       - in: query
 *         name: page
 *         schema: { type: integer, minimum: 1, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, minimum: 1, maximum: 100, default: 20 }
 *     responses:
 *       200:
 *         description: Paginated approved products with seller display details
 */
router.get('/catalog', getCatalog);

/**
 * @swagger
 * /api/v1/products/delivery/quote:
 *   post:
 *     summary: Calculate delivery fare for an approved product
 *     description: >-
 *       Uses the seller's saved pickup coordinates and the supplied destination
 *       coordinates with the existing transport pricing rules. The returned
 *       deliveryFee is the transport fare subtotal and excludes the 5% user
 *       platform fee and transport tax.
 *     tags: [Products]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [productId, destination]
 *             properties:
 *               productId:
 *                 type: string
 *                 example: 507f1f77bcf86cd799439011
 *               modeOfDelivery:
 *                 type: string
 *                 enum: [Bike, Car]
 *                 default: Bike
 *               destination:
 *                 type: object
 *                 required: [latitude, longitude]
 *                 properties:
 *                   latitude: { type: number, example: 6.5244 }
 *                   longitude: { type: number, example: 3.3792 }
 *                   address: { type: string, example: Ikeja, Lagos }
 *     responses:
 *       200:
 *         description: Delivery quote with pickup and delivery coordinates, available addresses, fee, route distance, and duration
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     quoteId: { type: string }
 *                     pickup:
 *                       type: object
 *                       properties:
 *                         coordinates:
 *                           type: array
 *                           description: Longitude, latitude
 *                           items: { type: number }
 *                         address: { type: string, nullable: true }
 *                     deliveryAddress:
 *                       type: object
 *                       properties:
 *                         coordinates:
 *                           type: array
 *                           description: Longitude, latitude
 *                           items: { type: number }
 *                         address: { type: string, nullable: true }
 *                     deliveryFee: { type: number, example: 6000 }
 *                     currency: { type: string, example: NGN }
 *       400:
 *         description: Invalid product, delivery mode, or destination coordinates
 *       401:
 *         description: Authentication required
 *       404:
 *         description: Approved product not found
 *       409:
 *         description: Seller pickup coordinates are not available
 */
router.post('/delivery/quote', authMiddleware, (req, res, next) => {
  if (req.user.role !== 'buyer') return res.status(403).json({ success: false, message: 'Buyer access only' });
  return next();
}, createDeliveryQuote);

/**
 * @swagger
 * /api/v1/products/orders/checkout:
 *   post:
 *     summary: Create and pay for a product order without creating a service booking
 *     description: quoteId is required for delivery and omitted for pickup. The quote supplies pickup and destination details; deliveryDetails supplies only recipient contact and instructions. Checkout adds a flat NGN 200 buyer platform fee. The 10% product commission is withheld from the item subtotal; the seller payout (held until delivery or pickup is confirmed) is item subtotal minus commission plus the full delivery fee, if applicable. paymentMethod defaults to paystack; choose wallet to create the order without a Paystack authorization, then call the pay-from-wallet endpoint with the returned orderId.
 *     tags: [Products]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [items, fulfillmentType]
 *             properties:
 *               items:
 *                 type: array
 *                 minItems: 1
 *                 maxItems: 30
 *                 items:
 *                   type: object
 *                   required: [productId, quantity]
 *                   properties:
 *                     productId: { type: string }
 *                     quantity: { type: integer, minimum: 1, maximum: 100 }
 *               fulfillmentType:
 *                 type: string
 *                 enum: [delivery, pickup]
 *               paymentMethod:
 *                 type: string
 *                 enum: [paystack, wallet]
 *                 default: paystack
 *                 description: Choose wallet to pay using the buyer wallet in a follow-up request
 *               quoteId:
 *                 type: string
 *                 description: Required for delivery. Omit for pickup.
 *                 example: 68f0a31f8bc15387b034abcd
 *               deliveryDetails:
 *                 type: object
 *                 description: Required for delivery. The destination address and coordinates are taken from quoteId.
 *                 properties:
 *                   recipientName: { type: string }
 *                   phone: { type: string }
 *                   instructions: { type: string }
 *               pickupNote: { type: string }
 *     responses:
 *       201:
 *         description: Order ID (orderId), order details, fees, seller payout, and delivery quote details. Paystack orders include an authorization URL; wallet orders return null for it and should be paid through the wallet endpoint.
 *       400:
 *         description: Invalid items, seller mix, delivery details, expired/mismatched quote, or unavailable product
 *       409:
 *         description: Delivery quote expired or was already used
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Buyer account required
 */
router.post('/orders/checkout', authMiddleware, (req, res, next) => {
  if (req.user.role !== 'buyer') return res.status(403).json({ success: false, message: 'Buyer access only' });
  return next();
}, createCheckout);

/**
 * @swagger
 * /api/v1/products/orders/{id}/pay-from-wallet:
 *   post:
 *     summary: Pay for a product order using the buyer's wallet
 *     description: Applies active campaign promotional credits first, then pays any remainder from the buyer's available wallet balance. Reduces product stock, records platform fees, and holds the seller payout until the buyer confirms delivery or pickup. If the combined promotional credit and wallet balance do not cover the total, payment fails and credits remain unused.
 *     tags: [Products]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *         description: Product order ID returned by checkout
 *     responses:
 *       200:
 *         description: Wallet payment recorded and seller payout held in escrow
 *       400:
 *         description: Insufficient wallet balance after promotional credits or invalid order amount
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: false }
 *                 code: { type: string, example: INSUFFICIENT_WALLET_BALANCE }
 *                 message: { type: string, example: Your NGN2,000 promotional credit will remain available. Add NGN500 to your wallet to complete this order. }
 *                 data:
 *                   type: object
 *                   properties:
 *                     totalAmount: { type: number, example: 5000 }
 *                     amountDueAfterPromo: { type: number, example: 3000 }
 *                     walletAvailable: { type: number, example: 2500 }
 *                     shortfallAmount: { type: number, example: 500 }
 *                     promotionalCreditApplied: { type: number, example: 2000 }
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Buyer account required or wallet unavailable
 *       404:
 *         description: Order not found
 *       409:
 *         description: Order is no longer awaiting payment, wallet balance changed, or product stock is unavailable
 */
router.post('/orders/:id/pay-from-wallet', authMiddleware, (req, res, next) => {
  if (req.user.role !== 'buyer') return res.status(403).json({ success: false, message: 'Buyer access only' });
  return next();
}, payProductOrderFromWallet);

/**
 * @swagger
 * /api/v1/products/orders/{id}/verify:
 *   post:
 *     summary: Verify Paystack payment for a product order
 *     tags: [Products]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Payment verified and seller escrow funded
 *       400:
 *         description: Payment is incomplete or does not match the order
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Buyer account required
 *       404:
 *         description: Order not found
 */
router.post('/orders/:id/verify', authMiddleware, (req, res, next) => {
  if (req.user.role !== 'buyer') return res.status(403).json({ success: false, message: 'Buyer access only' });
  return next();
}, verifyCheckout);

/**
 * @swagger
 * /api/v1/products/orders:
 *   get:
 *     summary: List the authenticated buyer's orders or seller's received orders
 *     tags: [Products]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, minimum: 1, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, minimum: 1, maximum: 100, default: 20 }
 *       - in: query
 *         name: status
 *         description: Filter orders by lifecycle status
 *         schema:
 *           type: string
 *           enum: [pending_payment, paid, processing, shipped, ready_for_pickup, delivered, disputed, completed]
 *     responses:
 *       200:
 *         description: Paginated orders for the authenticated account
 *       401:
 *         description: Authentication required
 */
router.get('/orders', authMiddleware, (req, res, next) => {
  if (!['buyer', 'provider', 'businessOwner', 'business'].includes(req.user.role)) return res.status(403).json({ success: false, message: 'Buyer, provider, or business access only' });
  return next();
}, getMyOrders);

/**
 * @swagger
 * /api/v1/products/orders/{id}/fulfillment:
 *   patch:
 *     summary: Update fulfillment for an order received by the authenticated seller
 *     description: >-
 *       The seller moves delivery orders through processing, shipped, and delivered.
 *       For pickup orders, the seller moves them through processing and
 *       ready_for_pickup. The buyer can confirm delivery only after the seller
 *       marks a delivery order delivered; pickup can be confirmed once ready.
 *       Buyer confirmation moves the order to completed and releases the
 *       seller's escrowed payout.
 *     tags: [Products]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [status]
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [processing, shipped, delivered, ready_for_pickup]
 *                 description: Seller-managed fulfillment statuses accepted by this endpoint
 *               trackingNumber: { type: string }
 *               note: { type: string }
 *     responses:
 *       200:
 *         description: Fulfillment updated and buyer notified
 *       403:
 *         description: Provider or business account required
 *       404:
 *         description: Seller order not found
 *       409:
 *         description: Invalid fulfillment transition
 */
router.patch('/orders/:id/fulfillment', authMiddleware, (req, res, next) => {
  if (!['provider', 'businessOwner', 'business'].includes(req.user.role)) return res.status(403).json({ success: false, message: 'Provider or business access only' });
  return next();
}, updateFulfillment);

/**
 * @swagger
 * /api/v1/products/orders/{id}/dispute-delivery:
 *   post:
 *     summary: Dispute a seller-reported product delivery
 *     description: Buyer-only. Available after the seller marks a delivery order delivered and before the buyer confirms it. The order remains disputed and seller escrow stays on hold while active super admins are emailed the order details and reason.
 *     tags: [Products]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [reason]
 *             properties:
 *               reason:
 *                 type: string
 *                 minLength: 1
 *                 maxLength: 2000
 *                 example: The package arrived damaged and one item is missing.
 *     responses:
 *       201:
 *         description: Dispute submitted; super admins are notified by email
 *       400:
 *         description: Invalid order ID or missing/too-long reason
 *       403:
 *         description: Buyer account required
 *       404:
 *         description: Order not found
 *       409:
 *         description: Order is not eligible for a delivery dispute
 */
router.post('/orders/:id/dispute-delivery', authMiddleware, (req, res, next) => {
  if (req.user.role !== 'buyer') return res.status(403).json({ success: false, message: 'Buyer access only' });
  return next();
}, disputeDelivery);

/**
 * @swagger
 * /api/v1/products/orders/{id}/confirm-delivery:
 *   post:
 *     summary: Confirm seller-reported delivery or pickup and release escrowed funds
 *     description: For delivery orders, the seller must first set fulfillment status to delivered. For pickup orders, the seller must set status to ready_for_pickup.
 *     tags: [Products]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Buyer confirmation recorded and funds released to the seller wallet
 *       403:
 *         description: Buyer account required
 *       404:
 *         description: Order not found
 *       409:
 *         description: Seller has not marked a delivery order delivered, or a pickup order is not ready
 */
router.post('/orders/:id/confirm-delivery', authMiddleware, (req, res, next) => {
  if (req.user.role !== 'buyer') return res.status(403).json({ success: false, message: 'Buyer access only' });
  return next();
}, confirmDelivery);

/**
 * @swagger
 * tags:
 *   name: Products
 *   description: Product catalog, product orders, seller fulfillment, and admin approval
 */

/**
 * @swagger
 * /api/v1/products:
 *   post:
 *     summary: Submit a product for approval
 *     tags: [Products]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, price, quantity]
 *             properties:
 *               name:
 *                 type: string
 *                 example: Handmade leather wallet
 *               price:
 *                 type: number
 *                 minimum: 0
 *                 example: 25000
 *               quantity:
 *                 type: integer
 *                 minimum: 0
 *                 description: Number of units currently available
 *                 example: 12
 *               description:
 *                 type: string
 *                 example: Full-grain leather wallet, handcrafted in Lagos.
 *               productImage:
 *                 type: string
 *                 description: Optional URL for the product image
 *                 example: https://res.cloudinary.com/demo/image/upload/product.jpg
 *               currency:
 *                 type: string
 *                 default: NGN
 *                 example: NGN
 *     responses:
 *       201:
 *         description: Product submitted and awaiting approval
 *       400:
 *         description: Product name or price is invalid
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Provider or business account required
 */
router.post(
  '/',
  authMiddleware,
  (req, res, next) => {
    if (!['provider', 'businessOwner', 'business'].includes(req.user.role)) {
      return res
        .status(403)
        .json({ success: false, message: 'Provider or business access only' });
    }
    return next();
  },
  createProduct,
);

/**
 * @swagger
 * /api/v1/products:
 *   get:
 *     summary: List products for the authenticated account or admin
 *     tags: [Products]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         required: false
 *         schema:
 *           type: string
 *           enum: [pending, approved, rejected]
 *         description: Filter by status; omitted or empty returns all statuses
 *       - in: query
 *         name: page
 *         required: false
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 1
 *         description: Page number
 *       - in: query
 *         name: limit
 *         required: false
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 20
 *         description: Products per page
 *     responses:
 *       200:
 *         description: Paginated products for the authenticated account
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Provider or business account required
 */
router.get(
  '/',
  authMiddleware,
  (req, res, next) => {
    if (req.user.role === 'admin') return next();
    if (!['provider', 'businessOwner', 'business'].includes(req.user.role)) {
      return res
        .status(403)
        .json({ success: false, message: 'Provider or business access only' });
    }
    return next();
  },
  getProducts,
);

/**
 * @swagger
 * /api/v1/products/all-products:
 *   get:
 *     summary: List all products for admins
 *     tags: [Products]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [pending, approved, rejected]
 *         description: Optional product status filter
 *       - in: query
 *         name: ownerType
 *         schema:
 *           type: string
 *           enum: [provider, business]
 *         description: Optional owner type filter
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 20
 *     responses:
 *       200:
 *         description: Products with owner details and pagination metadata
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Admin access only
 */
router.get('/all-products', authMiddleware, (req, res, next) => {
  if (req.user.role !== 'admin') {
    return res
      .status(403)
      .json({ success: false, message: 'Admin access only' });
  }
  return next();
}, getAllProducts);

/**
 * @swagger
 * /api/v1/products/{id}:
 *   get:
 *     summary: Get an approved product by ID
 *     tags: [Products]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Product ID
 *     responses:
 *       200:
 *         description: Approved product details with seller display details
 *       400:
 *         description: Invalid product ID
 *       404:
 *         description: Approved product not found
 *
 *   patch:
 *     summary: Edit a product owned by the authenticated provider or business
 *     tags: [Products]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Product ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               price:
 *                 type: number
 *                 minimum: 0
 *               quantity:
 *                 type: integer
 *                 minimum: 0
 *                 description: Update the number of units available
 *               description:
 *                 type: string
 *               currency:
 *                 type: string
 *               productImage:
 *                 type: string
 *     responses:
 *       200:
 *         description: Product updated and submitted for approval
 *       400:
 *         description: Invalid product ID or update fields
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Provider or business account required
 *       404:
 *         description: Product not found for this owner
 */
router.get('/:id', getProductById);

router.patch(
  '/:id',
  authMiddleware,
  (req, res, next) => {
    if (!['provider', 'businessOwner', 'business'].includes(req.user.role)) {
      return res
        .status(403)
        .json({ success: false, message: 'Provider or business access only' });
    }
    return next();
  },
  updateProduct,
);

/**
 * @swagger
 * /api/v1/products/{id}/review:
 *   patch:
 *     summary: Approve or reject a pending product
 *     tags: [Products]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Product ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [status]
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [approved, rejected]
 *               note:
 *                 type: string
 *                 description: Optional note included in the owner's rejection email
 *     responses:
 *       200:
 *         description: Product reviewed; owner is emailed the outcome
 *       400:
 *         description: Invalid product ID or review status
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Super admin or verification admin access required
 *       404:
 *         description: Pending product not found
 */
router.patch(
  '/:id/review',
  authMiddleware,
  (req, res, next) => {
    if (req.user.role !== 'admin')
      return res
        .status(403)
        .json({ success: false, message: 'Admin access only' });
    return next();
  },
  reviewProduct,
);

module.exports = router;
