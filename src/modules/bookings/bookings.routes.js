const express = require("express");
const router = express.Router();
const BookingController = require("./bookings.controller");
const authMiddleware = require("../../../middleware/authMiddleware.js");
const onlyRole = require("../../../middleware/roleMiddleware.js");

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
 *               modeOfDelivery:
 *                 type: string
 *                 description: Mode of delivery or pickup
 *                 example: Car delivery or Car pickup
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
 *               packageImage:
 *                 type: string
 *                 format: uri
 *                 description: Optional URL of the package image
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
router.post(
  "/",
  authMiddleware,
  onlyRole("buyer"),
  BookingController.createBooking,
);

/**
 * @swagger
 * /api/v1/bookings/service:
 *   post:
 *     summary: Create a scheduled service booking with a provider or business
 *     tags: [Bookings]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [category, service, date, time, location]
 *             oneOf:
 *               - required: [providerId]
 *               - required: [businessId]
 *             properties:
 *               category:
 *                 type: string
 *                 description: Must match the provider's category or the business's businessCategory
 *               service:
 *                 type: array
 *                 minItems: 1
 *                 items:
 *                   type: object
 *                   required: [serviceName]
 *                   properties:
 *                     serviceName:
 *                       type: string
 *                     pricingOption:
 *                       type: string
 *                       enum: [walk_in, provider_address, customer_address, fixedPrice]
 *                       description: Optional per-service override; defaults to the top-level pricingOption
 *               pricingOption:
 *                 type: string
 *                 enum: [walk_in, provider_address, customer_address, fixedPrice]
 *                 description: Applied to each service unless overridden on that service
 *               date:
 *                 type: string
 *                 format: date
 *               time:
 *                 type: string
 *                 example: 10:30 AM
 *               location:
 *                 oneOf:
 *                   - type: string
 *                   - type: object
 *                     properties:
 *                       address:
 *                         type: string
 *                       latitude:
 *                         type: number
 *                       longitude:
 *                         type: number
 *                       coordinates:
 *                         type: array
 *                         description: GeoJSON coordinate order [longitude, latitude]
 *                         items:
 *                           type: number
 *                         minItems: 2
 *                         maxItems: 2
 *               providerId:
 *                 type: string
 *                 description: Provider account ID. Use this for direct provider bookings; mutually exclusive with businessId.
 *               businessId:
 *                 type: string
 *                 description: Business account ID. The booking is sent to the business owner for staff assignment; mutually exclusive with providerId.
 *               staffCode:
 *                 type: string
 *                 description: Optional requested staff preference for a business booking. The business owner still assigns staff.
 *     responses:
 *       201:
 *         description: Booking created and sent to the provider or business owner. Business bookings remain unassigned until the owner assigns staff.
 *       400:
 *         description: Invalid booking details, target, requested staff code, or pricing option
 *       409:
 *         description: Provider or business is currently unavailable
 *       404:
 *         description: Provider or business not found
 */
router.post(
  "/service",
  authMiddleware,
  onlyRole("buyer"),
  BookingController.createServiceBooking,
);

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
 *           enum: [pending_providers, awaiting_provider_acceptance, provider_selected, provider_accepted, payment_pending, paid_escrow, paid_escrow_scheduled, in_progress, completed, cancelled, user_accepted_completion, funds_released]
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
 *         name: serviceType
 *         schema:
 *           type: string
 *         description: Filter by service type
 *         example: Transport
 *       - in: query
 *         name: subCategory
 *         schema:
 *           type: string
 *         description: Filter by sub-category
 *         example: Ride Sharing
 *       - in: query
 *         name: modeOfDelivery
 *         schema:
 *           type: string
 *         description: Filter by mode of delivery or pickup
 *         example: Car delivery or Car pickup
 *       - in: query
 *         name: includeZeroAmount
 *         schema:
 *           type: boolean
 *           default: true
 *         description: Include bookings with a zero naira amount. Set to false to exclude them.
 *         example: true
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
 *                         enum: [pending_providers, awaiting_provider_acceptance, provider_selected, provider_accepted, payment_pending, paid_escrow, paid_escrow_scheduled, in_progress, completed, cancelled, user_accepted_completion, funds_released]
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
router.get("/", authMiddleware, BookingController.getAllBookings);

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
 *           enum: [pending_providers, provider_selected, payment_pending, paid_escrow, paid_escrow_scheduled, in_progress, completed, cancelled, funds_released]
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
router.get(
  "/user",
  authMiddleware,
  onlyRole("buyer"),
  BookingController.getUserBookings,
);

/**
 * @swagger
 * /api/v1/bookings/user/{userId}:
 *   get:
 *     summary: Get bookings by user ID
 *     tags: [Bookings]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *         description: The MongoDB user ID
 *       - in: query
 *         name: status
 *         required: false
 *         schema:
 *           type: string
 *         description: Optional booking status filter
 *       - in: query
 *         name: page
 *         required: false
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         required: false
 *         schema:
 *           type: integer
 *           default: 10
 *     responses:
 *       200:
 *         description: Bookings retrieved successfully
 *       400:
 *         description: Invalid user ID format
 *       403:
 *         description: Admin access only
 *       500:
 *         description: Server error
 */
router.get(
  "/user/:userId",
  authMiddleware,
  onlyRole("admin"),
  BookingController.getBookingsByUserId,
);

/**
 * @swagger
 * /api/v1/bookings/provider/{providerId}:
 *   get:
 *     summary: Get bookings by provider ID
 *     tags: [Bookings]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: providerId
 *         required: true
 *         schema:
 *           type: string
 *         description: The MongoDB provider ID
 *       - in: query
 *         name: status
 *         required: false
 *         schema:
 *           type: string
 *         description: Optional booking status filter
 *       - in: query
 *         name: page
 *         required: false
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         required: false
 *         schema:
 *           type: integer
 *           default: 10
 *     responses:
 *       200:
 *         description: Bookings retrieved successfully
 *       400:
 *         description: Invalid provider ID format
 *       403:
 *         description: Admin access only
 *       500:
 *         description: Server error
 */
router.get(
  "/provider/:providerId",
  authMiddleware,
  onlyRole("admin"),
  BookingController.getBookingsByProviderId,
);

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
/**
 * @swagger
 * /api/v1/bookings/search:
 *   post:
 *     summary: Search nearby provider and business accounts
 *     description: |
 *       Returns up to 6 bookable provider and business accounts near a location, nearest first
 *       (accounts with a fresh location before stale ones, rating as tiebreak).
 *
 *       **Filters.** Send at least one of `search`, `serviceName`, `jobService` or `businessName`.
 *       All filters sent are combined with AND.
 *
 *       - `search` is the free-text box. It is partial and case-insensitive and matches provider
 *         `fullName`, `BusinessName` or service name, and business `BusinessName`, `fullName`,
 *         service name or `businessCategory`.
 *       - `serviceName` is an exact (case-insensitive) service name filter.
 *       - `businessName` is a partial, case-insensitive `BusinessName` filter.
 *
 *       **Who is returned.**
 *       - Providers who are active, toggled available, have sent a location in the last 10 minutes,
 *         and have no booking in progress that blocks a new one.
 *       - Businesses that are active, toggled available, online (location heartbeat in the last
 *         10 minutes), open now per their available days and business hours, and have at least the
 *         minimum number of online staff on duty.
 *
 *       The search radius is 7 km.
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
 *               - location
 *             properties:
 *               location:
 *                 oneOf:
 *                   - type: object
 *                     required: [latitude, longitude]
 *                     properties:
 *                       latitude:
 *                         type: number
 *                       longitude:
 *                         type: number
 *                   - type: string
 *                     description: Address to geocode
 *                 example:
 *                   latitude: 6.5244
 *                   longitude: 3.3792
 *               search:
 *                 type: string
 *                 minLength: 2
 *                 maxLength: 100
 *                 example: tunde
 *                 description: |
 *                   Free-text search, partial and case-insensitive (trimmed). Matches provider fullName,
 *                   BusinessName or service name, and business BusinessName, fullName, service name or
 *                   category. Combined (AND) with the other filters, and can be used alone.
 *               serviceName:
 *                 type: string
 *                 example: Hair Styling
 *                 description: Exact, case-insensitive match on service.serviceName
 *               jobService:
 *                 type: string
 *                 example: Beauty & Personal Care
 *                 description: Matches provider job.service, or business category or service name
 *               businessName:
 *                 type: string
 *                 example: Beauty Studio
 *                 description: Partial, case-insensitive BusinessName match for provider and business accounts; can be used alone
 *               fixedPrice:
 *                 type: number
 *                 minimum: 0
 *                 example: 0
 *                 description: Optional. Exact fixedPrice value for the matching service entry
 *               rating:
 *                 type: number
 *                 minimum: 0
 *                 maximum: 5
 *                 example: 5
 *                 description: Optional. Minimum account average rating
 *           examples:
 *             allFields:
 *               summary: All fields (only location is required)
 *               value:
 *                 search: tunde
 *                 serviceName: Hair Styling
 *                 jobService: Beauty & Personal Care
 *                 businessName: Beauty Studio
 *                 fixedPrice: 0
 *                 rating: 5
 *                 location:
 *                   latitude: 6.5244
 *                   longitude: 3.3792
 *             searchOnly:
 *               summary: Free-text search
 *               value:
 *                 search: tunde
 *                 location:
 *                   latitude: 6.5244
 *                   longitude: 3.3792
 *             searchWithFilters:
 *               summary: Search narrowed by rating
 *               value:
 *                 search: braids
 *                 rating: 4
 *                 location:
 *                   latitude: 6.5244
 *                   longitude: 3.3792
 *             serviceAtAddress:
 *               summary: Exact service near an address
 *               value:
 *                 serviceName: Hair Styling
 *                 location: Ikeja, Lagos
 *     responses:
 *       200:
 *         description: Nearby provider and business accounts returned successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 search:
 *                   type: string
 *                   description: Trimmed search term, when sent
 *                 serviceName:
 *                   type: string
 *                 jobService:
 *                   type: string
 *                 businessName:
 *                   type: string
 *                 fixedPrice:
 *                   type: number
 *                 rating:
 *                   type: number
 *                 location:
 *                   type: object
 *                   properties:
 *                     latitude:
 *                       type: number
 *                     longitude:
 *                       type: number
 *                 count:
 *                   type: integer
 *                   example: 2
 *                 nearbyProviders:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                       accountType:
 *                         type: string
 *                         enum: [provider, business]
 *                       providerAccountType:
 *                         type: string
 *                         description: Provider accounts only (individual or business provider)
 *                       fullName:
 *                         type: string
 *                       BusinessName:
 *                         type: string
 *                       email:
 *                         type: string
 *                       profilePicture:
 *                         type: string
 *                         nullable: true
 *                       rating:
 *                         type: object
 *                         properties:
 *                           average:
 *                             type: number
 *                           count:
 *                             type: integer
 *                       completedJobs:
 *                         type: integer
 *                         description: Provider accounts only
 *                       startingPrice:
 *                         type: number
 *                         description: Provider accounts only
 *                       onDutyStaffCount:
 *                         type: integer
 *                         description: Business accounts only. Online staff currently on duty
 *                       currentLocation:
 *                         type: object
 *                         properties:
 *                           type:
 *                             type: string
 *                             example: Point
 *                           coordinates:
 *                             type: array
 *                             items:
 *                               type: number
 *                             description: "[longitude, latitude]"
 *                           address:
 *                             type: string
 *                       lastLocationUpdate:
 *                         type: string
 *                         format: date-time
 *                       services:
 *                         type: array
 *                         description: Offered services, filtered to the requested serviceName when one is sent
 *                         items:
 *                           type: object
 *                       jobs:
 *                         type: array
 *                         description: Provider accounts only. Jobs matching jobService, when sent
 *                         items:
 *                           type: object
 *                       distanceFromPickup:
 *                         type: number
 *                         description: Distance in km
 *                       providerETA:
 *                         type: object
 *                         properties:
 *                           value:
 *                             type: integer
 *                           unit:
 *                             type: string
 *                             example: minutes
 *                       locationFresh:
 *                         type: boolean
 *       400:
 *         description: Invalid location, invalid fixedPrice or rating, search shorter than 2 or longer than 100 characters, or no search filter provided
 *       401:
 *         description: Missing or invalid token
 *       403:
 *         description: Buyer access only
 *       500:
 *         description: Server error
 */
router.post(
  "/search",
  authMiddleware,
  onlyRole("buyer"),
  BookingController.searchProviders,
);

router.get("/:id", authMiddleware, BookingController.getBookingById);

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
router.put(
  "/:id/select-provider",
  authMiddleware,
  onlyRole("buyer"),
  BookingController.selectProvider,
);

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
router.patch(
  "/:id/cancel",
  authMiddleware,
  onlyRole("buyer"),
  BookingController.cancelBooking,
);

/**
 * @swagger
 * /api/v1/bookings/{id}:
 *   delete:
 *     summary: Delete a booking and related records
 *     description: Permanently delete a booking owned by the authenticated buyer and remove related chat and booking notifications.
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
 *         description: Booking deleted successfully
 *       400:
 *         description: Invalid booking ID
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Booking not found
 *       409:
 *         description: Booking cannot be deleted in its current state
 *       500:
 *         description: Server error
 */
router.delete(
  "/:id",
  authMiddleware,
  onlyRole("buyer"),
  BookingController.deleteBooking,
);

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
 *               tipAmount:
 *                 type: number
 *                 description: Optional tip amount (wallet balance required)
 *                 example: 1000
 *     responses:
 *       200:
 *         description: Job completion accepted successfully
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
 *                   example: Job completed accepted successfully
 *                 data:
 *                   type: object
 *                   properties:
 *                     booking:
 *                       $ref: '#/components/schemas/Booking'
 *                     tip:
 *                       type: object
 *       400:
 *         description: Invalid rating score or tipAmount
 *       401:
 *         description: Unauthorized
 *       409:
 *         description: Booking not marked completed by provider
 *       500:
 *         description: Server error
 */

router.patch(
  "/:id/accept-completion",
  authMiddleware,
  onlyRole("buyer"),
  BookingController.acceptJobCompleted,
);

/**
 * @swagger
 * /api/v1/bookings/{id}/dispute:
 *   patch:
 *     summary: Raise a dispute for a completed booking
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
 *                 description: Reason for the dispute
 *                 example: "Service was not completed as agreed"
 *     responses:
 *       200:
 *         description: Dispute raised successfully
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
 *                   example: "Dispute raised successfully. Our team will review and contact both parties."
 *                 data:
 *                   type: object
 *                   properties:
 *                     bookingId:
 *                       type: string
 *                     status:
 *                       type: string
 *                       example: "disputed"
 *                     disputeRaisedAt:
 *                       type: string
 *                       format: date-time
 *                     reason:
 *                       type: string
 *       400:
 *         description: Invalid input or booking not eligible for dispute
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server error
 */
router.patch(
  "/:id/dispute",
  authMiddleware,
  onlyRole("buyer"),
  BookingController.disputeJobCompleted,
);

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
router.put(
  "/allow-system",
  authMiddleware,
  onlyRole("buyer"),
  BookingController.allowSystem,
);

module.exports = router;
