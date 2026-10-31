const express = require('express');
const authMiddleware = require('../../../middleware/authMiddleware');
const {
  createProduct,
  reviewProduct,
  getProducts,
  getAllProducts,
  updateProduct,
} = require('./product.controller');

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Products
 *   description: Product submission and approval
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
 *             required: [name, price]
 *             properties:
 *               name:
 *                 type: string
 *                 example: Handmade leather wallet
 *               price:
 *                 type: number
 *                 minimum: 0
 *                 example: 25000
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
