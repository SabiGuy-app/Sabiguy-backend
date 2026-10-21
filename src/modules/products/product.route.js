const express = require("express");
const authMiddleware = require("../../../middleware/authMiddleware");
const { createProduct, getPendingProducts, reviewProduct } = require("./product.controller");

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
router.post("/", authMiddleware, (req, res, next) => {
  if (!["provider", "businessOwner", "business"].includes(req.user.role)) {
    return res.status(403).json({ success: false, message: "Provider or business access only" });
  }
  return next();
}, createProduct);

/**
 * @swagger
 * /api/v1/products/pending:
 *   get:
 *     summary: List products awaiting approval
 *     tags: [Products]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Pending products with their owner details
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Super admin or verification admin access required
 */
router.get("/pending", authMiddleware, (req, res, next) => {
  if (req.user.role !== "admin") return res.status(403).json({ success: false, message: "Admin access only" });
  return next();
}, getPendingProducts);

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
router.patch("/:id/review", authMiddleware, (req, res, next) => {
  if (req.user.role !== "admin") return res.status(403).json({ success: false, message: "Admin access only" });
  return next();
}, reviewProduct);

module.exports = router;
