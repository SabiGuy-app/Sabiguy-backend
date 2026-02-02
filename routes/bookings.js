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
router.get('/:id', authMiddleware, BookingController.getBooking);

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


module.exports = router;