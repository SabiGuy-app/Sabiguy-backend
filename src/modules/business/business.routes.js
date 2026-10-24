const express = require("express");
const router = express.Router();
const {
  getAllBusinesses,
  getBusinessById,
  inviteDriver,
  getBusinessDrivers,
  getBusinessVehicles,
  getBusinessByEmail,
  respondToInvitation,
  addBusinessDetails,
  addBusinessVerification,
  addVehicleDetails,
  getKycLevel,
  addServiceDetails,
  updateBusinessProfile,
  updateBusinessOperatingDefaults,
  updateBusinessPayoutAccount,
  updateBusinessPayoutSchedule,
  updateBusinessServices,
  updateBusinessAvailableDays,
  updateBusinessServicePlace,
  updateBusinessHours,
  updateBusinessStudioImages,
  setBusinessAvailability,
  updateBusinessLocation,
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
 *             properties:
 *               businessName:
 *                 type: string
 *                 example: "ABC Logistics"
 *               businessAddress:
 *                 type: string
 *               latitude:
 *                 type: number
 *                 minimum: -90
 *                 maximum: 90
 *                 description: Latitude for the business location
 *               longitude:
 *                 type: number
 *                 minimum: -180
 *                 maximum: 180
 *                 description: Longitude for the business location
 *                 example: "12 Allen Avenue"
 *               cityOfOperation:
 *                 type: string
 *                 example: "Lagos"
 *               ninUrl:
 *                 type: string
 *                 description: URL of the NIN slip/document
 *                 example: "https://res.cloudinary.com/demo/image/upload/v123456/nin-slip.jpg"
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
 *                 description: Optional URLs of business/store photos
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
 * /api/v1/businesses/service-details:
 *   post:
 *     summary: Add or update business service details
 *     description: Stores the business category, services, working days, business hours, service locations, and studio images for the authenticated business owner. All request properties are optional, so a partial update is supported.
 *     tags: [Business]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               businessCategory:
 *                 type: string
 *                 description: Category of the business
 *                 example: "Transport & Logistics"
 *               service:
 *                 type: array
 *                 description: Services offered by the business
 *                 items:
 *                   type: object
 *                   properties:
 *                     serviceName:
 *                       type: string
 *                       example: "Home Cleaning"
 *                     pricingModel:
 *                       type: object
 *                       properties:
 *                         walk_in:
 *                           type: number
 *                           example: 25000
 *                         provider_address:
 *                           type: number
 *                           example: 30000
 *                         customer_address:
 *                           type: number
 *                           example: 35000
 *                     fixedPrice:
 *                       type: number
 *                       example: 25000
 *               availableDays:
 *                 type: array
 *                 description: Days on which the business is available
 *                 items:
 *                   type: string
 *                 example: ["Monday", "Wednesday", "Friday"]
 *               businessHours:
 *                 type: object
 *                 properties:
 *                   start:
 *                     type: string
 *                     example: "08:00"
 *                   end:
 *                     type: string
 *                     example: "18:00"
 *               servicePlace:
 *                 type: array
 *                 description: Places where the business provides services
 *                 items:
 *                   type: string
 *                 example: ["Walk in Salon", "Customer Address"]
 *               studioImages:
 *                 type: array
 *                 description: Business studio images and videos
 *                 items:
 *                   type: object
 *                   properties:
 *                     pictures:
 *                       type: array
 *                       items:
 *                         type: string
 *                       example: ["https://res.cloudinary.com/demo/image/upload/v123456/studio.jpg"]
 *                     videos:
 *                       type: array
 *                       items:
 *                         type: string
 *                       example: ["https://res.cloudinary.com/demo/video/upload/v123456/studio.mp4"]
 *     responses:
 *       200:
 *         description: Service details added successfully
 *       400:
 *         description: Invalid service details format
 *       401:
 *         description: Invalid or missing token
 *       403:
 *         description: Business access only
 *       404:
 *         description: Business not found
 *       500:
 *         description: Server error
 */
router.post(
  "/service-details",
  authMiddleware,
  onlyRole("businessOwner"),
  addServiceDetails,
);

/**
 * @swagger
 * /api/v1/businesses/profile:
 *   put:
 *     summary: Update business profile identity
 *     description: Partially updates the authenticated business owner's name, city, address, and nearby-search location.
 *     tags: [Business]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               businessName:
 *                 type: string
 *               cityOfOperation:
 *                 type: string
 *               businessAddress:
 *                 type: string
 *     responses:
 *       200:
 *         description: Business profile updated successfully
 *       400:
 *         description: Invalid or empty fields
 *       404:
 *         description: Business not found
 *       500:
 *         description: Server error
 */
router.put(
  "/profile",
  authMiddleware,
  onlyRole("businessOwner"),
  updateBusinessProfile,
);

/**
 * @swagger
 * /api/v1/businesses/operating-defaults:
 *   put:
 *     summary: Update business operating defaults
 *     description: Partially updates the authenticated business owner's currency, timezone and week start day.
 *     tags: [Business]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               currency:
 *                 type: string
 *               timezone:
 *                 type: string
 *               weekStarts:
 *                 type: string
 *     responses:
 *       200:
 *         description: Operating defaults updated successfully
 *       400:
 *         description: Invalid or empty fields
 *       404:
 *         description: Business not found
 *       500:
 *         description: Server error
 */
router.put(
  "/operating-defaults",
  authMiddleware,
  onlyRole("businessOwner"),
  updateBusinessOperatingDefaults,
);

/**
 * @swagger
 * /api/v1/businesses/payout-account:
 *   put:
 *     summary: Update business payout account
 *     description: Partially updates the authenticated business owner's company payout bank account details.
 *     tags: [Business]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               bankName:
 *                 type: string
 *               bankCode:
 *                 type: string
 *               accountNumber:
 *                 type: string
 *               accountName:
 *                 type: string
 *               taxId:
 *                 type: string
 *     responses:
 *       200:
 *         description: Payout account updated successfully
 *       400:
 *         description: Invalid or empty fields
 *       404:
 *         description: Business not found
 *       500:
 *         description: Server error
 */
router.put(
  "/payout-account",
  authMiddleware,
  onlyRole("businessOwner"),
  updateBusinessPayoutAccount,
);

/**
 * @swagger
 * /api/v1/businesses/payout-schedule:
 *   put:
 *     summary: Update business payout schedule
 *     description: Partially updates the authenticated business owner's default payout schedule.
 *     tags: [Business]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               automatic:
 *                 type: boolean
 *               day:
 *                 type: string
 *               minimumThreshold:
 *                 type: number
 *     responses:
 *       200:
 *         description: Payout schedule updated successfully
 *       400:
 *         description: Invalid or empty fields
 *       404:
 *         description: Business not found
 *       500:
 *         description: Server error
 */
router.put(
  "/payout-schedule",
  authMiddleware,
  onlyRole("businessOwner"),
  updateBusinessPayoutSchedule,
);

/**
 * @swagger
 * /api/v1/businesses/details/services:
 *   put:
 *     summary: Update business services
 *     description: Replaces the authenticated business owner's service catalog.
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
 *               - service
 *             properties:
 *               service:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     serviceName:
 *                       type: string
 *                     duration:
 *                       type: string
 *                     pricingModel:
 *                       type: object
 *                       properties:
 *                         walk_in:
 *                           type: number
 *                         provider_address:
 *                           type: number
 *                         customer_address:
 *                           type: number
 *                     fixedPrice:
 *                       type: number
 *     responses:
 *       200:
 *         description: Business services updated successfully
 *       400:
 *         description: Invalid or empty fields
 *       404:
 *         description: Business not found
 *       500:
 *         description: Server error
 */
router.put(
  "/details/services",
  authMiddleware,
  onlyRole("businessOwner"),
  updateBusinessServices,
);

/**
 * @swagger
 * /api/v1/businesses/details/available-days:
 *   put:
 *     summary: Update business available days
 *     description: Replaces the authenticated business owner's operating days.
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
 *               - availableDays
 *             properties:
 *               availableDays:
 *                 type: array
 *                 items:
 *                   type: string
 *     responses:
 *       200:
 *         description: Available days updated successfully
 *       400:
 *         description: Invalid or empty fields
 *       404:
 *         description: Business not found
 *       500:
 *         description: Server error
 */
router.put(
  "/details/available-days",
  authMiddleware,
  onlyRole("businessOwner"),
  updateBusinessAvailableDays,
);

/**
 * @swagger
 * /api/v1/businesses/details/service-place:
 *   put:
 *     summary: Update business service places
 *     description: Replaces the authenticated business owner's service places.
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
 *               - servicePlace
 *             properties:
 *               servicePlace:
 *                 type: array
 *                 items:
 *                   type: string
 *     responses:
 *       200:
 *         description: Service places updated successfully
 *       400:
 *         description: Invalid or empty fields
 *       404:
 *         description: Business not found
 *       500:
 *         description: Server error
 */
router.put(
  "/details/service-place",
  authMiddleware,
  onlyRole("businessOwner"),
  updateBusinessServicePlace,
);

/**
 * @swagger
 * /api/v1/businesses/details/hours:
 *   put:
 *     summary: Update business opening hours
 *     description: Partially updates the authenticated business owner's opening hours.
 *     tags: [Business]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               start:
 *                 type: string
 *               end:
 *                 type: string
 *     responses:
 *       200:
 *         description: Business hours updated successfully
 *       400:
 *         description: Invalid or empty fields
 *       404:
 *         description: Business not found
 *       500:
 *         description: Server error
 */
router.put(
  "/details/hours",
  authMiddleware,
  onlyRole("businessOwner"),
  updateBusinessHours,
);

/**
 * @swagger
 * /api/v1/businesses/details/studio-images:
 *   put:
 *     summary: Update business studio gallery
 *     description: Replaces the authenticated business owner's studio images and videos.
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
 *               - studioImages
 *             properties:
 *               studioImages:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     pictures:
 *                       type: array
 *                       items:
 *                         type: string
 *                     videos:
 *                       type: array
 *                       items:
 *                         type: string
 *     responses:
 *       200:
 *         description: Studio images updated successfully
 *       400:
 *         description: Invalid or empty fields
 *       404:
 *         description: Business not found
 *       500:
 *         description: Server error
 */
router.put(
  "/details/studio-images",
  authMiddleware,
  onlyRole("businessOwner"),
  updateBusinessStudioImages,
);

/**
 * @swagger
 * /api/v1/businesses/availability:
 *   put:
 *     summary: Toggle business availability
 *     description: Turns fast-booking availability on or off for the authenticated business owner. A business only appears in nearby search when it is available, online (recent location heartbeat), within business hours, and has at least the minimum number of staff on duty. The response reports the current on-duty staff count and whether the business is eligible.
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
 *               - isAvailable
 *             properties:
 *               isAvailable:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Availability updated successfully
 *       400:
 *         description: isAvailable must be a boolean
 *       404:
 *         description: Business not found
 *       500:
 *         description: Server error
 */
router.put(
  "/availability",
  authMiddleware,
  onlyRole("businessOwner"),
  setBusinessAvailability,
);

/**
 * @swagger
 * /api/v1/businesses/location:
 *   put:
 *     summary: Update business location (heartbeat)
 *     description: Updates the authenticated business owner's current location. Mirrors PUT /api/v1/provider/location. Requires verified KYC, and resolves currentLocation.address (an address sent by the app wins; otherwise the cached address is reused unless the business moved more than 500m, then it is reverse geocoded). The business app should call this regularly; it also marks the business as online for nearby search.
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
 *               - latitude
 *               - longitude
 *             properties:
 *               latitude:
 *                 type: number
 *               longitude:
 *                 type: number
 *               address:
 *                 type: string
 *                 description: Optional human-readable address from the device
 *     responses:
 *       200:
 *         description: Location updated successfully
 *       400:
 *         description: Invalid coordinates
 *       403:
 *         description: KYC verification required to update location
 *       404:
 *         description: Business not found
 *       500:
 *         description: Server error
 */
router.put(
  "/location",
  authMiddleware,
  onlyRole("businessOwner"),
  updateBusinessLocation,
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

/**
 * @swagger
 * /api/v1/businesses/{businessId}:
 *   get:
 *     summary: Get a business by ID
 *     tags: [Business]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: businessId
 *         required: true
 *         schema:
 *           type: string
 *         example: "507f191e810c19729de860ea"
 *     responses:
 *       200:
 *         description: Business fetched successfully
 *       400:
 *         description: Invalid business ID
 *       401:
 *         description: Invalid or missing token
 *       404:
 *         description: Business not found
 */
router.get("/:businessId", authMiddleware, getBusinessById);

module.exports = router;
