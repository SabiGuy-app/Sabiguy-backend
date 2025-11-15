const express = require ('express');
const router = express.Router();
const authMiddleware = require ('../middleware/authMiddleware');
const {ProfileInfo, BusinessInfo, JobAndService, setProfilePicture, workVisuals, BankInfo} = require ('../controllers/provider');

/**
 * @swagger
 * tags:
 *   name: Provider
 *   description: Endpoints for provider profile and business setup
 */

/**
 * @swagger
 * /api/v1/provider:
 *   post:
 *     summary: Update provider personal profile information
 *     tags: [Provider]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               gender:
 *                 type: string
 *                 example: "female"
 *               city:
 *                 type: string
 *                 example: "Lagos"
 *               address:
 *                 type: string
 *                 example: "12 Opebi Street, Ikeja"
 *               accountType:
 *                 type: string
 *                 example: "Personal"
 *               ninSlip:
 *                 type: string
 *                 example: "https://cloudstorage.com/ninslip.jpg"
 *     responses:
 *       200:
 *         description: Profile info updated successfully
 *       404:
 *         description: Provider not found
 */
router.post("/", authMiddleware, ProfileInfo);

/**
 * @swagger
 * /api/v1/provider/business:
 *   post:
 *     summary: Update provider business information
 *     tags: [Provider]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               BusinessName:
 *                 type: string
 *                 example: "Queen’s Glam Studio"
 *               regNumber:
 *                 type: string
 *                 example: "RC-1234567"
 *               BusinessAddress:
 *                 type: string
 *                 example: "123 Allen Avenue, Ikeja, Lagos"
 *               cacFile:
 *                 type: string
 *                 example: "https://cloudstorage.com/cacfile.pdf"
 *     responses:
 *       200:
 *         description: Business info updated successfully
 *       404:
 *         description: Provider not found
 */
router.post("/business", authMiddleware, BusinessInfo);

/**
 * @swagger
 * /api/v1/provider/job-service:
 *   post:
 *     summary: Add or update provider jobs and services
 *     tags: [Provider]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               job:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     service:
 *                       type: string
 *                       example: "Makeup"
 *                     title:
 *                       type: string
 *                       example: "Bridal Makeup"
 *                     tagLine:
 *                       type: string
 *                       example: "Flawless beauty for your special day"
 *               service:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     serviceName:
 *                       type: string
 *                       example: "Home Service Makeup"
 *                     pricingModel:
 *                       type: string
 *                       example: "fixed"
 *                     price:
 *                       type: number
 *                       example: 25000
 *     responses:
 *       200:
 *         description: Job/service info updated successfully
 *       404:
 *         description: Provider not found
 */
router.post("/job-service", authMiddleware, JobAndService);

/**
 * @swagger
 * /api/v1/provider/work-visuals:
 *   put:
 *     summary: Upload or update provider work visuals (images and videos)
 *     tags: [Provider]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               workVisuals:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     pictures:
 *                       type: array
 *                       items:
 *                         type: string
 *                       example: ["https://cdn.com/work1.jpg", "https://cdn.com/work2.jpg"]
 *                     videos:
 *                       type: array
 *                       items:
 *                         type: string
 *                       example: ["https://cdn.com/demo1.mp4"]
 *     responses:
 *       200:
 *         description: Work visuals updated successfully
 *       404:
 *         description: Provider not found
 */
router.put("/work-visuals", authMiddleware, workVisuals);

/**
 * @swagger
 * /api/v1/provider/bank-info:
 *   put:
 *     summary: Update provider bank details
 *     tags: [Provider]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               accountName:
 *                 type: string
 *                 example: "Queen Samuel"
 *               accountNumber:
 *                 type: string
 *                 example: "0123456789"
 *               bankName:
 *                 type: string
 *                 example: "Access Bank"
 *     responses:
 *       200:
 *         description: Bank info updated successfully
 *       404:
 *         description: Provider not found
 */
router.put("/bank-info", authMiddleware, BankInfo);

/**
 * @swagger
 * /api/v1/provider/profile-pic:
 *   put:
 *     summary: Update provider profile picture
 *     tags: [Provider]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               imageUrl:
 *                 type: string
 *                 example: "https://cdn.com/profile/queen.jpg"
 *     responses:
 *       200:
 *         description: Profile picture updated successfully
 *       400:
 *         description: Image URL missing
 *       404:
 *         description: Provider not found
 */
router.put("/profile-pic", authMiddleware, setProfilePicture);




module.exports = router;

