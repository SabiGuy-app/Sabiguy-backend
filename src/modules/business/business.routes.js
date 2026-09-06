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
 *               - cacRegistrationNumber
 *               - businessAddress
 *               - cityOfOperation
 *               - cacCertificateUrl
 *               - nin
 *             properties:
 *               businessName:
 *                 type: string
 *                 example: "ABC Logistics"
 *               cacRegistrationNumber:
 *                 type: string
 *                 example: "RC123456"
 *               businessAddress:
 *                 type: string
 *                 example: "12 Allen Avenue"
 *               cityOfOperation:
 *                 type: string
 *                 example: "Lagos"
 *               cacCertificateUrl:
 *                 type: string
 *                 example: "https://res.cloudinary.com/demo/image/upload/v123456/cac-certificate.pdf"
 *               nin:
 *                 type: string
 *                 example: "12345678901"
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

router.post("/kyc-level", authMiddleware, getKycLevel);

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
