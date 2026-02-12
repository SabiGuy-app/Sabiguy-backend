const express = require('express');
const router = express.Router();
const BookingController = require ('../controllers/bookings')
const authMiddleware = require ('../middleware/authMiddleware');
const onlyRole = require ('../middleware/roleMiddleware.js')

/** 
 *  @swagger
 * /api/v1/bookings:
 *   post:
 *     summary: Create a new booking
 *     tags: [Bookings]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - serviceType
 *               - scheduleType
 *               - budget
 *             properties:
 *               serviceType:
 *                 type: string
 *                 description: Type of service (e.g., Transport, Plumbing, Cleaning)
 *                 example: Transport
 *               subCategory:
 *                 type: string
 *                 description: Sub-category of the service
 *                 example: Ride Sharing
 *               title:
 *                 type: string
 *                 description: Booking title
 *                 example: Airport Pickup
 *               description:
 *                 type: string
 *                 description: Detailed description of the service needed
 *                 example: Need pickup from Murtala Muhammed Airport
 *               address:
 *                 type: string
 *                 description: Service location (for non-transport services)
 *                 example: 123 Allen Avenue, Ikeja, Lagos
 *               pickupAddress:
 *                 type: string
 *                 description: Pickup location (for transport/logistics only)
 *                 example: Victoria Island, Lagos
 *               dropoffAddress:
 *                 type: string
 *                 description: Dropoff location (for transport/logistics only)
 *                 example: Lekki Phase 1, Lagos
 *               scheduleType:
 *                 type: string
 *                 enum: [immediate, scheduled]
 *                 description: When the service should be performed
 *                 example: immediate
 *               startDate:
 *                 type: string
 *                 format: date-time
 *                 description: Start date/time (for scheduled bookings)
 *                 example: 2024-12-25T10:00:00Z
 *               endDate:
 *                 type: string
 *                 format: date-time
 *                 description: End date/time (for scheduled bookings)
 *                 example: 2024-12-25T12:00:00Z
 *               budget:
 *                 type: number
 *                 description: Budget for the service
 *                 example: 5000
 *               attachments:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: Attachments (images url, documents url)
 *     responses:
 *       201:
 *         description: Booking created successfully
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
 *                   example: Booking created. Nearby providers have been notified.
 *                 data:
 *                   type: object
 *                   properties:
 *                     booking:
 *                       $ref: '#/components/schemas/Booking'
 *                     providers:
 *                       type: array
 *                       items:
 *                         type: object
 *                     notifiedProvidersCount:
 *                       type: number
 *                     calculatedPrice:
 *                       type: number
 *                     distance:
 *                       type: object
 *       400:
 *         description: Validation error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post('/', authMiddleware, onlyRole('buyer'), BookingController.createBooking);

/**
 * @swagger
 * /api/v1/bookings:
 *   get:
 *     summary: Get all bookings
 *     description: Retrieve all bookings with optional filtering, searching, sorting, and pagination
 *     tags: [Bookings]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [pending_providers, awaiting_provider_acceptance, provider_selected, payment_pending, paid_escrow, in-progress, completed, cancelled, user_accepted_completion, funds_released]
 *         description: Filter by booking status
 *         example: pending_providers
 *       - in: query
 *         name: providerId
 *         schema:
 *           type: string
 *         description: Filter by provider ID
 *         example: 507f1f77bcf86cd799439011
 *       - in: query
 *         name: userId
 *         schema:
 *           type: string
 *         description: Filter by user ID
 *         example: 507f1f77bcf86cd799439012
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search by reference or booking ID
 *         example: BK12345
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date
 *         description: Filter bookings from this date
 *         example: 2024-01-01
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date
 *         description: Filter bookings until this date
 *         example: 2024-12-31
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *           minimum: 1
 *         description: Page number for pagination
 *         example: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *           minimum: 1
 *           maximum: 100
 *         description: Number of items per page
 *         example: 10
 *       - in: query
 *         name: sortBy
 *         schema:
 *           type: string
 *           default: createdAt
 *           enum: [createdAt, updatedAt, totalAmount, status]
 *         description: Field to sort by
 *         example: createdAt
 *       - in: query
 *         name: sortOrder
 *         schema:
 *           type: string
 *           default: desc
 *           enum: [asc, desc]
 *         description: Sort order (ascending or descending)
 *         example: desc
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
 *                     type: object
 *                     properties:
 *                       _id:
 *                         type: string
 *                         example: 507f1f77bcf86cd799439011
 *                       reference:
 *                         type: string
 *                         example: BK12345
 *                       bookingId:
 *                         type: string
 *                         example: BOOK-2024-001
 *                       userId:
 *                         type: object
 *                         properties:
 *                           _id:
 *                             type: string
 *                             example: 507f1f77bcf86cd799439012
 *                           firstName:
 *                             type: string
 *                             example: John
 *                           lastName:
 *                             type: string
 *                             example: Doe
 *                           email:
 *                             type: string
 *                             example: john@example.com
 *                           phoneNumber:
 *                             type: string
 *                             example: +2348012345678
 *                           avatar:
 *                             type: string
 *                             example: https://example.com/avatar.jpg
 *                       providerId:
 *                         type: object
 *                         properties:
 *                           _id:
 *                             type: string
 *                             example: 507f1f77bcf86cd799439013
 *                           fullName:
 *                             type: string
 *                             example: Jane Smith
 *                           email:
 *                             type: string
 *                             example: jane@example.com
 *                           phoneNumber:
 *                             type: string
 *                             example: +2348087654321
 *                           avatar:
 *                             type: string
 *                             example: https://example.com/avatar.jpg
 *                       status:
 *                         type: string
 *                         enum: [pending_providers, awaiting_provider_acceptance, provider_selected, payment_pending, paid_escrow, in-progress, completed, cancelled, user_accepted_completion, funds_released]
 *                         example: completed
 *                       totalAmount:
 *                         type: number
 *                         example: 5000
 *                       createdAt:
 *                         type: string
 *                         format: date-time
 *                         example: 2024-02-06T10:30:00.000Z
 *                       updatedAt:
 *                         type: string
 *                         format: date-time
 *                         example: 2024-02-06T12:00:00.000Z
 *                 pagination:
 *                   type: object
 *                   properties:
 *                     total:
 *                       type: integer
 *                       example: 150
 *                     totalPages:
 *                       type: integer
 *                       example: 15
 *                     currentPage:
 *                       type: integer
 *                       example: 1
 *                     perPage:
 *                       type: integer
 *                       example: 10
 *                 stats:
 *                   type: object
 *                   properties:
 *                     pending:
 *                       type: integer
 *                       example: 45
 *                     confirmed:
 *                       type: integer
 *                       example: 30
 *                     completed:
 *                       type: integer
 *                       example: 60
 *                     cancelled:
 *                       type: integer
 *                       example: 15
 *       400:
 *         description: Bad request - Invalid parameters
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: Invalid provider ID format
 *       401:
 *         description: Unauthorized - Authentication required
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: Authentication required
 *       403:
 *         description: Forbidden - Admin privileges required
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: Access denied. Admin privileges required.
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: Error fetching bookings
 *                 error:
 *                   type: string
 *                   example: Database connection failed
 */
router.get('/', authMiddleware, BookingController.getAllBookings);


/**
 * @swagger
 * /api/v1/bookings/user:
 *   get:
 *     summary: Get user bookings
 *     tags: [Bookings]
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
router.get('/user', authMiddleware, onlyRole('buyer'), BookingController.getUserBookings);

/**
 * @swagger
 * /api/v1/bookings/{id}:
 *   get:
 *     summary: Get booking details
 *     tags: [Bookings]
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
 *         description: Booking details retrieved successfully
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
 *                     booking:
 *                       $ref: '#/components/schemas/Booking'
 *       404:
 *         description: Booking not found
 *       500:
 *         description: Server error
 */
router.get('/:id', authMiddleware, BookingController.getBookingById);


/**
 * @swagger
 * /api/v1/bookings/{id}/select-provider:
 *   put:
 *     summary: Select a provider (User - Non-transport services)
 *     tags: [Bookings]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Booking ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - providerId
 *             properties:
 *               providerId:
 *                 type: string
 *                 description: Provider ID to select
 *                 example: 507f1f77bcf86cd799439011
 *     responses:
 *       200:
 *         description: Provider selected successfully
 *       400:
 *         description: Provider not in suggested list
 *       404:
 *         description: Booking not found
 *       500:
 *         description: Server error
 */
router.put('/:id/select-provider', authMiddleware, onlyRole('buyer'), BookingController.selectProvider);

/**
 * @swagger
 * /api/v1/bookings/{id}/cancel:
 *   patch:
 *     summary: Cancel a booking
 *     tags: [Bookings]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Booking ID
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
 *                 description: Reason for cancellation
 *                 example: Change of plans
 *     responses:
 *       200:
 *         description: Booking cancelled successfully
 *       404:
 *         description: Booking not found or cannot be cancelled
 *       500:
 *         description: Server error
 */
router.patch('/bookings/:id/cancel', authMiddleware, BookingController.cancelBooking);


/**
 * @swagger
 * /api/v1/bookings/{id}/accept-completion:
 *   patch:
 *     summary: Accept completed job and rate provider
 *     tags: [Bookings]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Booking ID
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               score:
 *                 type: number
 *                 minimum: 1
 *                 maximum: 5
 *                 description: Rating score for provider
 *                 example: 5
 *               review:
 *                 type: string
 *                 description: Review for provider
 *                 example: Very professional and punctual
 *     responses:
 *       200:
 *         description: Booking completion accepted successfully
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
 *       401:
 *         description: Unauthorized
 *       409:
 *         description: Booking not marked completed by provider
 *       500:
 *         description: Server error
 */

router.patch('/:id/accept-completion', authMiddleware, onlyRole('buyer'), BookingController.acceptJobCompleted);

/**
 * @swagger
 * /api/v1/bookings/allow-system:
 *   put:
 *     summary: Enable or disable system access for the logged-in user
 *     tags: [Bookings]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - allowSystem
 *             properties:
 *               allowSystem:
 *                 type: boolean
 *                 example: true
 *     responses:
 *       200:
 *         description: Allow system updated successfully
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
 *                   example: Allow system set to true
 *                 data:
 *                   type: object
 *                   properties:
 *                     allowSystem:
 *                       type: boolean
 *                       example: true
 *       400:
 *         description: Invalid input
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: User not found
 *       500:
 *         description: Server error
 */

router.put('/allow-system', authMiddleware, onlyRole('buyer'), BookingController.allowSystem);


module.exports = router;