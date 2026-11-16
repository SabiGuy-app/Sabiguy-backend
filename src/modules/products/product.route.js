const express = require('express');
const authMiddleware = require('../../../middleware/authMiddleware');
const {
  createProduct,
  reviewProduct,
  getProducts,
  getAllProducts,
  updateProduct,
} = require('./product.controller');
const {
  getCatalog,
  createCheckout,
  verifyCheckout,
  getMyOrders,
  updateFulfillment,
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
 * /api/v1/products/orders/checkout:
 *   post:
 *     summary: Create and pay for a product order without creating a service booking
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
 *               deliveryAddress:
 *                 type: object
 *                 properties:
 *                   recipientName: { type: string }
 *                   phone: { type: string }
 *                   address: { type: string }
 *                   city: { type: string }
 *                   state: { type: string }
 *                   instructions: { type: string }
 *               pickupNote: { type: string }
 *     responses:
 *       201:
 *         description: Order created with a Paystack authorization URL
 *       400:
 *         description: Invalid items, seller mix, delivery details, or unavailable product
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
 *       Order lifecycle statuses are pending_payment, paid, processing, shipped,
 *       ready_for_pickup, and delivered. This seller endpoint accepts only the
 *       seller-managed transitions processing, shipped, and ready_for_pickup.
 *       Payment sets paid automatically; the buyer sets delivered through the
 *       confirm-delivery endpoint.
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
 *                 enum: [processing, shipped, ready_for_pickup]
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
 * /api/v1/products/orders/{id}/confirm-delivery:
 *   post:
 *     summary: Confirm delivery and release the seller's escrowed funds
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
 *         description: Delivery confirmed and funds released to the seller wallet
 *       403:
 *         description: Buyer account required
 *       404:
 *         description: Order not found
 *       409:
 *         description: Order is not ready for delivery confirmation
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
