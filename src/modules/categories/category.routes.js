const express = require("express");
const authMiddleware = require("../../../middleware/authMiddleware");
const {
  createCategory,
  getCategories,
  updateCategory,
  deleteCategory,
} = require("./category.controller");

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Categories
 *   description: Service categories and their services
 */

/**
 * @swagger
 * /api/v1/categories:
 *   post:
 *     summary: Create or seed service categories
 *     description: Admin only. Send no body to seed all categories from the shared constants, or send a category object/array to create or update categories.
 *     tags: [Categories]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             oneOf:
 *               - type: object
 *                 properties:
 *                   name: { type: string, example: Automotive }
 *                   slug: { type: string, example: automotive }
 *                   services:
 *                     type: array
 *                     items:
 *                       type: object
 *                       properties:
 *                         id: { type: string }
 *                         name: { type: string }
 *               - type: object
 *                 properties:
 *                   categories: { type: array }
 *     responses:
 *       200: { description: Shared constants seeded }
 *       201: { description: Category created or updated }
 *       400: { description: Invalid payload }
 *       409: { description: Duplicate category }
 */
const adminOnly = (req, res, next) => {
  if (req.user?.role !== "admin") {
    return res.status(403).json({ success: false, message: "Admin access only" });
  }
  return next();
};

router.post("/", authMiddleware, adminOnly, createCategory);

/**
 * @swagger
 * /api/v1/categories:
 *   get:
 *     summary: Get all service categories
 *     tags: [Categories]
 *     responses:
 *       200:
 *         description: List of categories and services
 */
/**
 * @swagger
 * /api/v1/categories/{id}:
 *   patch:
 *     summary: Update a category by MongoDB ID (admin only)
 *     tags: [Categories]
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
 *             properties:
 *               name: { type: string }
 *               slug: { type: string }
 *               services:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     id: { type: string }
 *                     name: { type: string }
 *     responses:
 *       200: { description: Category updated }
 *       404: { description: Category not found }
 *       403: { description: Admin access only }
 */
router.patch("/:id", authMiddleware, adminOnly, updateCategory);

/**
 * @swagger
 * /api/v1/categories/{id}:
 *   delete:
 *     summary: Delete a category by MongoDB ID (admin only)
 *     tags: [Categories]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Category deleted }
 *       404: { description: Category not found }
 *       403: { description: Admin access only }
 */
router.delete("/:id", authMiddleware, adminOnly, deleteCategory);

router.get("/", getCategories);

module.exports = router;
