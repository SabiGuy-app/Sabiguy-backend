const express = require ('express');
const router = express.Router();
const authMiddleware = require ('../middleware/authMiddleware');
const ProviderController = require ('../controllers/provider');

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
router.post("/", authMiddleware, ProviderController.ProfileInfo);

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
router.post("/business", authMiddleware, ProviderController.BusinessInfo);

/**
 * @swagger
 * /api/v1/provider/job-service:
 *   post:
 *     summary: Add or update provider jobs and services
 *     description: |
 *       Updates the provider's `job` and/or `service` arrays. You can send either field or both.
 *       Optionally updates transport profile fields (license/vehicle details) in the same request.
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
 *                 description: List of jobs the provider offers
 *                 items:
 *                   type: object
 *                   required:
 *                     - service
 *                     - title
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
 *                     startingPrice:
 *                       type: string
 *                       example: "20000"
 *               service:
 *                 type: array
 *                 description: Additional service packages
 *                 items:
 *                   type: object
 *                   required:
 *                     - serviceName
 *                     - pricingModel
 *                     - price
 *                   properties:
 *                     serviceName:
 *                       type: string
 *                       example: "Home Service Makeup"
 *                     pricingModel:
 *                       type: string
 *                       example: "fixed"
 *                     price:
 *                       type: string
 *                       example: "25000"
 *               driverLicenseNumber:
 *                 type: string
 *                 example: "LAG-DRV-123456"
 *               vehicleProductionYear:
 *                 type: string
 *                 example: "2022"
 *               vehicleColor:
 *                 type: string
 *                 example: "Blue"
 *               vehicleRegNo:
 *                 type: string
 *                 example: "LND-482XY"
 *               vehicleName:
 *                 type: string
 *                 example: "Toyota Corolla"
 *     responses:
 *       200:
 *         description: Job/service info updated successfully
 *       400:
 *         description: Invalid payload (e.g., missing both job and service, or wrong array types)
 *       404:
 *         description: Provider not found
 *       500:
 *         description: Server error
 */
router.post("/job-service", authMiddleware, ProviderController.JobAndService);

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
router.put("/work-visuals", authMiddleware, ProviderController.workVisuals);

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
 *               bankCode:
 *                 type: string
 *                 example: "4444"
 *     responses:
 *       200:
 *         description: Bank info updated successfully
 *       404:
 *         description: Provider not found
 */
router.put("/bank-info", authMiddleware, ProviderController.BankInfo);

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
router.put("/profile-pic", authMiddleware, ProviderController.setProfilePicture);

/**
 * @swagger
 * /api/v1/provider/kyc-level:
 *   post:
 *     summary: Get provider KYC level
 *     tags: [Provider]
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
 *             properties:
 *               email:
 *                 type: string
 *                 example: "provider@example.com"
 *     responses:
 *       200:
 *         description: KYC level fetched successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     kycLevel:
 *                       type: number
 *                       example: 2
 *                     kycCompleted:
 *                       type: boolean
 *                       example: false
 *       404:
 *         description: Provider not found
 *       500:
 *         description: Server error
 */
router.post("/kyc-level", ProviderController.getKycLevel);

/**
 * @swagger
 * /api/v1/provider/dashboard/stats:
 *   get:
 *     summary: Get provider dashboard statistics
 *     tags: [Provider]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Dashboard statistics retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     totalBookings:
 *                       type: integer
 *                       example: 50
 *                     activeBookings:
 *                       type: integer
 *                       example: 5
 *                     completedBookings:
 *                       type: integer
 *                       example: 45
 *                     totalEarnings:
 *                       type: number
 *                       example: 450000
 *                     pendingEarnings:
 *                       type: number
 *                       example: 50000
 *       500:
 *         description: Server error
 */
router.get('/dashboard/stats', authMiddleware, ProviderController.getDashboardStats);

/**
 * @swagger
 * /api/v1/provider/location:
 *   put:
 *     summary: Update provider location
 *     tags: [Provider]
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
 *               - address
 *             properties:
 *               address:
 *                 type: text
 *                 example: Ikeja, Lagos
 *               latitude:
 *                 type: number
 *                 example: 6.5244
 *               longitude:
 *                 type: number
 *                 example: 3.3792
 *     responses:
 *       200:
 *         description: Location updated successfully
 *       400:
 *         description: Latitude and longitude required
 *       500:
 *         description: Server error
 */
router.put('/location', authMiddleware, ProviderController.updateLocation);

/**
 * @swagger
 * /api/v1/provider/availability/toggle:
 *   put:
 *     summary: Toggle provider availability
 *     tags: [Provider]
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
 *                 example: true
 *     responses:
 *       200:
 *         description: Availability updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Availability set to available
 *                 data:
 *                   type: object
 *                   properties:
 *                     isAvailable:
 *                       type: boolean
 *                       example: true
 *       500:
 *         description: Server error
 */
router.put('/availability/toggle', authMiddleware, ProviderController.toggleAvailability);

/**
 * @swagger
 * /api/v1/provider/bookings:
 *   get:
 *     summary: Get provider bookings
 *     tags: [Provider]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [pending_providers, provider_selected, payment_pending, paid_escrow, in_progress, completed, cancelled, funds_released]
 *         description: Filter by booking status
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *         description: Items per page
 *     responses:
 *       200:
 *         description: Bookings retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Booking'
 *                 totalPages:
 *                   type: integer
 *                 currentPage:
 *                   type: integer
 *                 total:
 *                   type: integer
 *       500:
 *         description: Server error
 */
router.get('/bookings', authMiddleware, ProviderController.getBookings);

// /**
//  * @swagger
//  * /api/v1/provider/bookings/{bookingId}:
//  *   get:
//  *     summary: Get booking details
//  *     tags: [Provider]
//  *     security:
//  *       - bearerAuth: []
//  *     parameters:
//  *       - in: path
//  *         name: bookingId
//  *         required: true
//  *         schema:
//  *           type: string
//  *         description: Booking ID
//  *     responses:
//  *       200:
//  *         description: Booking details retrieved
//  *       404:
//  *         description: Booking not found
//  *       500:
//  *         description: Server error
//  */
// router.get('/bookings/:bookingId', authMiddleware, ProviderController.getBookingDetails);

/**
 * @swagger
 * /api/v1/provider/{id}/accept:
 *   patch:
 *     summary: Accept a booking (Provider - Fastest Finger)
 *     tags: [Provider]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Booking ID
 *     responses:
 *       200:
 *         description: Booking accepted successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Booking accepted successfully
 *                 data:
 *                   $ref: '#/components/schemas/Booking'
 *       409:
 *         description: Booking already taken by another provider
 *       500:
 *         description: Server error
 */
router.patch('/:id/accept', authMiddleware, ProviderController.acceptBooking);
/**
 * @swagger
 * /api/v1/provider/bookings/{bookingId}/cancel:
 *   patch:
 *     summary: Decline a booking
 *     tags: [Provider]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: bookingId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - reason
 *             properties:
 *               reason:
 *                 type: string
 *                 example: Not available at this time
 *     responses:
 *       200:
 *         description: Booking declined successfully
 *       404:
 *         description: Booking not found
 *       500:
 *         description: Server error
 */
router.patch('/bookings/:bookingId/cancel', authMiddleware, ProviderController.cancelBooking);

/**
 * @swagger
 * /api/v1/provider/bookings/{bookingId}/counter-offer:
 *   patch:
 *     summary: Send counter offer to user
 *     tags: [Provider]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: bookingId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - offerAmount
 *             properties:
 *               offerAmount:
 *                 type: number
 *                 example: 7000
 *                 description: Counter offer amount
 *     responses:
 *       200:
 *         description: Counter offer sent successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   type: object
 *                   properties:
 *                     originalBudget:
 *                       type: number
 *                     counterOffer:
 *                       type: number
 *       404:
 *         description: Booking not found
 *       500:
 *         description: Server error
 */
router.patch('/bookings/:bookingId/counter-offer', authMiddleware, ProviderController.sendCounterOffer);

/**
 * @swagger
 * /api/v1/provider/bookings/{bookingId}/start:
 *   patch:
 *     summary: Start a job
 *     tags: [Provider]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: bookingId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Job started successfully
 *       400:
 *         description: Payment must be completed before starting
 *       404:
 *         description: Booking not found
 *       500:
 *         description: Server error
 */
router.patch('/bookings/:bookingId/start', authMiddleware, ProviderController.startJob);

/**
 * @swagger
 * /api/v1/provider/bookings/{bookingId}/status:
 *   patch:
 *     summary: Update transport booking status
 *     tags: [Provider]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: bookingId
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: status
 *         required: true
 *         schema:
 *           type: string
 *           enum: [arrived_at_pickup, enroute_to_dropoff, arrived_at_dropoff]
 *         description: New booking status
 *     responses:
 *       200:
 *         description: Booking status updated successfully
 *       400:
 *         description: Invalid status or invalid current booking state
 *       404:
 *         description: Booking not found
 *       500:
 *         description: Server error
 */
router.patch('/bookings/:bookingId/status', authMiddleware, ProviderController.updateBookingStatus);

/**
 * @swagger
 * /api/v1/provider/bookings/{bookingId}/complete:
 *   patch:
 *     summary: Mark job as complete
 *     tags: [Provider]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: bookingId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Job marked as complete
 *       404:
 *         description: Booking not found or not in progress
 *       500:
 *         description: Server error
 */
router.patch('/bookings/:bookingId/complete', authMiddleware, ProviderController.markJobComplete);

/**
 * @swagger
 * /api/v1/provider/earnings:
 *   get:
 *     summary: Get provider earnings
 *     tags: [Provider]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date
 *         description: Start date for earnings calculation
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date
 *         description: End date for earnings calculation
 *     responses:
 *       200:
 *         description: Earnings retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     totalEarnings:
 *                       type: number
 *                       example: 500000
 *                     platformFees:
 *                       type: number
 *                       example: 50000
 *                     netEarnings:
 *                       type: number
 *                       example: 450000
 *                     count:
 *                       type: integer
 *                       example: 50
 *       500:
 *         description: Server error
 */
router.get('/earnings', authMiddleware, ProviderController.getEarnings);

/**
 * @swagger
 * /api/v1/provider/bank-account:
 *   post:
 *     summary: Add bank account for payouts
 *     tags: [Provider]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - accountNumber
 *               - bankCode
 *             properties:
 *               accountNumber:
 *                 type: string
 *                 example: "0123456789"
 *               bankCode:
 *                 type: string
 *                 example: "058"
 *                 description: Bank code (e.g., GTBank = 058)
 *     responses:
 *       200:
 *         description: Bank account added successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   type: object
 *                   properties:
 *                     accountNumber:
 *                       type: string
 *                     accountName:
 *                       type: string
 *                     bankCode:
 *                       type: string
 *                     bankName:
 *                       type: string
 *                     recipientCode:
 *                       type: string
 *       400:
 *         description: Invalid account details
 *       500:
 *         description: Server error
 */
router.post('/bank-account', authMiddleware, ProviderController.addBankAccount);

/**
 * @swagger
 * /api/v1/provider/bank-account/verify:
 *   post:
 *     summary: Verify bank account
 *     tags: [Provider]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - accountNumber
 *               - bankCode
 *             properties:
 *               accountNumber:
 *                 type: string
 *                 example: "0123456789"
 *               bankCode:
 *                 type: string
 *                 example: "058"
 *     responses:
 *       200:
 *         description: Bank account verified
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     account_name:
 *                       type: string
 *                       example: John Doe
 *                     account_number:
 *                       type: string
 *                     bank_name:
 *                       type: string
 *       400:
 *         description: Invalid account
 *       500:
 *         description: Server error
 */
router.post('/bank-account/verify', authMiddleware, ProviderController.verifyBankAccount);

/**
 * @swagger
 * /api/v1/provider/reviews:
 *   get:
 *     summary: Get provider reviews
 *     tags: [Provider]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *     responses:
 *       200:
 *         description: Reviews retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       rating:
 *                         type: object
 *                         properties:
 *                           score:
 *                             type: number
 *                           review:
 *                             type: string
 *                           ratedAt:
 *                             type: string
 *                             format: date-time
 *                       serviceType:
 *                         type: string
 *                       userId:
 *                         type: object
 *                         properties:
 *                           firstName:
 *                             type: string
 *                           lastName:
 *                             type: string
 *                           avatar:
 *                             type: string
 *                 totalPages:
 *                   type: integer
 *                 currentPage:
 *                   type: integer
 *                 total:
 *                   type: integer
 *       500:
 *         description: Server error
 */
router.get('/reviews', authMiddleware, ProviderController.getReviews);

module.exports = router;





module.exports = router;

