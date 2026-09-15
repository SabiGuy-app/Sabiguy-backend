const express = require("express");
const router = express.Router();
const {
  getAllBusinesses,
  inviteDriver,
  getBusinessDrivers,
  getBusinessVehicles,
  getBusinessByEmail,
  respondToInvitation,
  addBusinessDetails,
  addBusinessVerification,
  addVehicleDetails,
  getKycLevel,
} = require("./business.controller");
const authMiddleware = require("../../../middleware/authMiddleware");
const onlyRole = require("../../../middleware/roleMiddleware");

/**
 * @swagger
 * tags:
 *   name: Business
 *   description: Business profile and vehicle management routes
 */

/**
 * @swagger
 * /api/v1/businesses/getAllBusinesses:
 *   get:
 *     summary: Retrieve a list of all businesses
 *     tags: [Business]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of businesses retrieved successfully
 *       401:
 *         description: Invalid or missing token
 *       403:
 *         description: Access denied
 *       500:
 *         description: Server error
 */
router.get("/getAllBusinesses", authMiddleware, getAllBusinesses);

/**
 * @swagger
 * /api/v1/businesses/business-details:
 *   post:
 *     summary: Create the authenticated business owner's business profile
 *     tags: [Business]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - businessName
 *               - businessAddress
 *               - cityOfOperation
 *               - ninUrl
 *               - businessCategory
 *             properties:
 *               businessName:
 *                 type: string
 *                 example: "ABC Logistics"
 *               businessAddress:
 *                 type: string
 *                 example: "12 Allen Avenue"
 *               cityOfOperation:
 *                 type: string
 *                 example: "Lagos"
 *               ninUrl:
 *                 type: string
 *                 description: URL of the NIN slip/document
 *                 example: "https://res.cloudinary.com/demo/image/upload/v123456/nin-slip.jpg"
 *               businessCategory:
 *                 type: string
 *                 description: Category of the business
 *                 example: "Transport & Logistics"
 *     responses:
 *       201:
 *         description: Business details created successfully
 *       400:
 *         description: Missing or invalid fields
 *       401:
 *         description: Invalid or missing token
 *       403:
 *         description: Business access only
 *       404:
 *         description: Business not found
 *       409:
 *         description: Business profile already exists for this user
 */
router.post(
  "/business-details",
  authMiddleware,
  onlyRole("businessOwner"),
  addBusinessDetails,
);

/**
 * @swagger
 * /api/v1/businesses/business-verification:
 *   post:
 *     summary: Submit business verification documents and photos
 *     tags: [Business]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - cacCertificateUrl
 *               - profilePhotoUrl
 *               - businessPhotos
 *             properties:
 *               cacCertificateUrl:
 *                 type: string
 *                 description: URL of the business CAC certificate
 *                 example: "https://res.cloudinary.com/demo/image/upload/v123456/cac-certificate.pdf"
 *               profilePhotoUrl:
 *                 type: string
 *                 description: URL of the business profile photo
 *                 example: "https://res.cloudinary.com/demo/image/upload/v123456/profile.jpg"
 *               businessPhotos:
 *                 type: array
 *                 description: URLs of business/store photos
 *                 items:
 *                   type: string
 *                   example: "https://res.cloudinary.com/demo/image/upload/v123456/store-1.jpg"
 *     responses:
 *       201:
 *         description: Business verification details saved successfully
 *       400:
 *         description: Missing or invalid fields
 *       401:
 *         description: Invalid or missing token
 *       403:
 *         description: Business access only
 *       404:
 *         description: Business not found
 */
router.post(
  "/business-verification",
  authMiddleware,
  onlyRole("businessOwner"),
  addBusinessVerification,
);

/**
 * @swagger
 * /api/v1/businesses/by-email:
 *   get:
 *     summary: Get a business profile by email
 *     tags: [Business]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: email
 *         required: true
 *         schema:
 *           type: string
 *         example: owner@example.com
 *     responses:
 *       200:
 *         description: Business fetched successfully
 *       400:
 *         description: Missing email
 *       401:
 *         description: Invalid or missing token
 *       403:
 *         description: Business access only
 *       404:
 *         description: Business not found
 */
router.get(
  "/by-email",
  authMiddleware,
  onlyRole("businessOwner"),
  getBusinessByEmail,
);

/**
 * @swagger
 * /api/v1/businesses/vehicle-details:
 *   post:
 *     summary: Add one or more vehicles for the authenticated business owner
 *     tags: [Business]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [vehicles]
 *             properties:
 *               vehicles:
 *                 type: array
 *                 items:
 *                   type: object
 *                   required:
 *                     - vehicleName
 *                     - plateNumber
 *                     - vehicleType
 *                     - vehiclePictureUrl
 *                   properties:
 *                     vehicleName:
 *                       type: string
 *                       example: "Toyota Corolla"
 *                     plateNumber:
 *                       type: string
 *                       example: "ABC-123XY"
 *                     vehicleType:
 *                       type: string
 *                       example: "Sedan"
 *                     vehiclePictureUrl:
 *                       type: string
 *                       example: "https://res.cloudinary.com/demo/image/upload/v123456/car1.jpg"
 *     responses:
 *       201:
 *         description: Vehicles created successfully
 *       400:
 *         description: Missing or invalid fields in one or more vehicles
 *       401:
 *         description: Invalid or missing token
 *       403:
 *         description: Business access only
 *       404:
 *         description: Business not found
 *       409:
 *         description: Duplicate plate number
 */
router.post(
  "/vehicle-details",
  authMiddleware,
  onlyRole("businessOwner"),
  addVehicleDetails,
);

/**
 * @swagger
 * /api/v1/businesses/kyc-level:
 *   post:
 *     summary: Get business KYC level
 *     description: Checks a business account by email and returns its current KYC status. If the email belongs to a new customer, it returns a friendly message without a record.
 *     tags: [Business]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *             properties:
 *               email:
 *                 type: string
 *                 example: "business@example.com"
 *     responses:
 *       200:
 *         description: KYC level fetched successfully or business is new
 *         content:
 *           application/json:
 *             schema:
 *               oneOf:
 *                 - type: object
 *                   properties:
 *                     success:
 *                       type: boolean
 *                       example: true
 *                     data:
 *                       type: object
 *                       properties:
 *                         kycLevel:
 *                           type: number
 *                           example: 2
 *                         kycCompleted:
 *                           type: boolean
 *                           example: false
 *                         kycVerified:
 *                           type: boolean
 *                           example: false
 *                         token:
 *                           type: string
 *                           example: "eyJhbGciOi..."
 *                 - type: object
 *                   properties:
 *                     message:
 *                       type: string
 *                       example: "This is a new customer"
 *       400:
 *         description: Email is required
 *       403:
 *         description: Email does not match authenticated user
 *       500:
 *         description: Server error
 */
router.post("/kyc-level", getKycLevel);

// Business/Fleet management
/**
 * @swagger
 * /api/v1/businesses/invite-driver:
 *   post:
 *     summary: Invite a driver to join the business fleet
 *     tags: [Business]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - message
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 example: driver@example.com
 *               message:
 *                 type: string
 *                 example: "Please join our fleet to start accepting jobs."
 *     responses:
 *       200:
 *         description: Driver invitation sent successfully
 *       400:
 *         description: Missing or invalid invitation data
 *       401:
 *         description: Invalid or missing token
 *       403:
 *         description: Business access only
 *       404:
 *         description: Driver or business not found
 */
router.post(
  "/invite-driver",
  authMiddleware,
  onlyRole("business"),
  inviteDriver,
);

/**
 * @swagger
 * /api/v1/businesses/drivers:
 *   get:
 *     summary: Retrieve drivers for the authenticated business
 *     tags: [Business]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Business drivers retrieved successfully
 *       401:
 *         description: Invalid or missing token
 *       403:
 *         description: Business access only
 *       404:
 *         description: Business not found
 */
router.get(
  "/drivers",
  authMiddleware,
  onlyRole("business"),
  getBusinessDrivers,
);

/**
 * @swagger
 * /api/v1/businesses/vehicles:
 *   get:
 *     summary: Retrieve vehicles for the authenticated business
 *     tags: [Business]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Business vehicles retrieved successfully
 *       401:
 *         description: Invalid or missing token
 *       403:
 *         description: Business access only
 *       404:
 *         description: Business not found
 */
router.get(
  "/vehicles",
  authMiddleware,
  onlyRole("business"),
  getBusinessVehicles,
);

// Driver-facing: mounted here (rather than under /provider) to keep all
// fleet-invitation logic in one module.
/**
 * @swagger
 * /api/v1/businesses/driver/invitation/respond:
 *   post:
 *     summary: Respond to a fleet invitation as a provider
 *     tags: [Business]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - invitationId
 *               - response
 *             properties:
 *               invitationId:
 *                 type: string
 *                 example: "inv_123456"
 *               response:
 *                 type: string
 *                 enum: [accept, decline]
 *                 example: accept
 *     responses:
 *       200:
 *         description: Invitation response recorded successfully
 *       400:
 *         description: Missing or invalid response data
 *       401:
 *         description: Invalid or missing token
 *       403:
 *         description: Provider access only
 *       404:
 *         description: Invitation not found
 */
router.post(
  "/driver/invitation/respond",
  authMiddleware,
  onlyRole("provider"),
  respondToInvitation,
);

module.exports = router;
