const express = require ("express");
const {
  getAllBuyers,
  getAllProviders,
  getAllUsers,
  getUserByEmail,
  getUserById,
} = require ('../controllers/users')
const authMiddleware = require ('../middleware/authMiddleware');

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Users
 *   description: Admin or system-level routes for managing users
 */

/**
 * @swagger
 * /api/v1/users/buyers:
 *   get:
 *     summary: Get all buyers
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of all buyers
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 count:
 *                   type: number
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       _id:
 *                         type: string
 *                       name:
 *                         type: string
 *                       email:
 *                         type: string
 *                       createdAt:
 *                         type: string
 *                         format: date-time
 */
router.get("/buyers", getAllBuyers);

/**
 * @swagger
 * /api/v1/users/providers:
 *   get:
 *     summary: Get all providers with full details
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of all service providers with business details, jobs, and visuals
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 count:
 *                   type: number
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       _id:
 *                         type: string
 *                       BusinessName:
 *                         type: string
 *                       city:
 *                         type: string
 *                       address:
 *                         type: string
 *                       job:
 *                         type: array
 *                         items:
 *                           type: object
 *                           properties:
 *                             service:
 *                               type: string
 *                             title:
 *                               type: string
 *                             tagLine:
 *                               type: string
 *                       service:
 *                         type: array
 *                         items:
 *                           type: object
 *                           properties:
 *                             serviceName:
 *                               type: string
 *                             pricingModel:
 *                               type: string
 *                             price:
 *                               type: number
 *                       workVisuals:
 *                         type: array
 *                         items:
 *                           type: object
 *                           properties:
 *                             pictures:
 *                               type: array
 *                               items:
 *                                 type: string
 *                             videos:
 *                               type: array
 *                               items:
 *                                 type: string
 *                       bankName:
 *                         type: string
 *                       accountNumber:
 *                         type: string
 *                       accountName:
 *                         type: string
 */
router.get("/providers", getAllProviders);

/**
 * @swagger
 * /api/v1/users:
 *   get:
 *     summary: Get all users (buyers + providers)
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Combined list of all users
 */
router.get("/users", getAllUsers);

/**
 * @swagger
 * /api/v1/users/email/{email}:
 *   get:
 *     summary: Get user by email
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: email
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *         description: The email of the user
 *     responses:
 *       200:
 *         description: User found
 *       404:
 *         description: User not found
 */
router.get("/email/:email",  getUserByEmail);

/**
 * @swagger
 * /api/v1/users/{id}:
 *   get:
 *     summary: Get user by ID
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *         description: The MongoDB ID of the user
 *     responses:
 *       200:
 *         description: User found successfully
 *       404:
 *         description: User not found
 */
router.get("/:id",  getUserById);

module.exports = router