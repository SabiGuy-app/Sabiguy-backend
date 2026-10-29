const express = require("express");
const router = express.Router({ mergeParams: true });
const { inviteStaff, getStaffCandidates, assignStaffToBooking, updateStaffRole, getStaffOnDuty, getAllStaff, getStaffDetail, respondToStaffInvite, clockIn, clockOut, getPendingClockRequests, respondToClockRequest, businessClockOutStaff, removeStaff } = require("./staff.controller");
const authMiddleware = require("../../../middleware/authMiddleware");
const onlyRole = require("../../../middleware/roleMiddleware");

/**
 * @swagger
 * tags:
 *   name: Business Staff
 *   description: Business staff management routes
 */

/**
 * @swagger
 * /api/v1/business/{businessId}/invite:
 *   post:
 *     summary: Invite a staff member to the business by email
 *     tags: [Business Staff]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: businessId
 *         required: true
 *         schema:
 *           type: string
 *         example: "507f191e810c19729de860ea"
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - role
 *               - services
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 example: tunde@example.com
 *               role:
 *                 type: string
 *                 example: Barber
 *               services:
 *                 type: array
 *                 items:
 *                   type: string
 *                 example: ["Haircut", "Fade"]
 *               canDoHomeService:
 *                 type: boolean
 *                 default: false
 *     responses:
 *       201:
 *         description: Staff invitation created and email sent
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
 *                     staffId:
 *                       type: string
 *                     email:
 *                       type: string
 *                     role:
 *                       type: string
 *                     services:
 *                       type: array
 *                       items:
 *                         type: string
 *                     canDoHomeService:
 *                       type: boolean
 *                     status:
 *                       type: string
 *                       example: INVITED
 *                     expiresAt:
 *                       type: string
 *                       format: date-time
 *       400:
 *         description: Missing or invalid invitation data
 *       401:
 *         description: Invalid or missing token
 *       403:
 *         description: Business owner access only, or not your business
 *       404:
 *         description: Business not found
 *       409:
 *         description: Invitation or active staff member already exists
 */
router.post(
  "/:businessId/invite",
  authMiddleware,
  onlyRole("businessOwner"),
  inviteStaff,
);

/**
 * @swagger
 * /api/v1/business/{businessId}/bookings/{bookingId}/staff-candidates:
 *   get:
 *     summary: List staff candidates for assigning to a booking
 *     description: Returns the business's active staff annotated with eligibility, distance and ETA for assigning them to a booking.
 *     tags: [Business Staff]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: businessId
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: bookingId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Staff candidates fetched successfully
 *       400:
 *         description: Invalid booking ID
 *       403:
 *         description: Business owner access only, or not your business
 *       404:
 *         description: Business or booking not found
 *       500:
 *         description: Server error
 */
router.get(
  "/:businessId/bookings/:bookingId/staff-candidates",
  authMiddleware,
  onlyRole("businessOwner"),
  getStaffCandidates,
);

/**
 * @swagger
 * /api/v1/business/{businessId}/bookings/{bookingId}/assign-staff:
 *   put:
 *     summary: Assign a staff member to a booking
 *     description: Additively assigns one eligible staff member (active, on-duty, offers the booked service, not already assigned) to a booking.
 *     tags: [Business Staff]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: businessId
 *         required: true
 *         schema:
 *           type: string
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
 *               - staffId
 *             properties:
 *               staffId:
 *                 type: string
 *     responses:
 *       200:
 *         description: Staff assigned to booking successfully
 *       400:
 *         description: Invalid IDs or staff does not provide the service
 *       403:
 *         description: Business owner access only, or not your business
 *       404:
 *         description: Business, booking or staff not found
 *       409:
 *         description: Staff already assigned or off duty
 *       500:
 *         description: Server error
 */
router.put(
  "/:businessId/bookings/:bookingId/assign-staff",
  authMiddleware,
  onlyRole("businessOwner"),
  assignStaffToBooking,
);

/**
 * @swagger
 * /api/v1/business/{businessId}/staff/{staffId}/role:
 *   put:
 *     summary: Assign or update a staff member's role
 *     description: Partially updates an ACTIVE or INVITED staff member's role, services and home-service capability. Services are validated against the business's own catalog.
 *     tags: [Business Staff]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: businessId
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: staffId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               role:
 *                 type: string
 *                 example: Senior Barber
 *               services:
 *                 type: array
 *                 items:
 *                   type: string
 *                 example: ["Haircut", "Fade"]
 *               canDoHomeService:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Staff role updated successfully
 *       400:
 *         description: Invalid or empty fields
 *       403:
 *         description: Business owner access only, or not your business
 *       404:
 *         description: Staff or business not found
 *       409:
 *         description: Staff is in a status that cannot be updated
 *       500:
 *         description: Server error
 */
router.put(
  "/:businessId/staff/:staffId/role",
  authMiddleware,
  onlyRole("businessOwner"),
  updateStaffRole,
);

/**
 * @swagger
 * /api/v1/business/{businessId}/staff/on-duty:
 *   get:
 *     summary: List staff on duty
 *     description: Returns the business's active staff with a working status (in_service / en_route / available / offline) and their current job, for the staff-on-duty board.
 *     tags: [Business Staff]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: businessId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Staff on duty fetched successfully
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
 *                     count:
 *                       type: number
 *                     staff:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           staffId:
 *                             type: string
 *                           staffCode:
 *                             type: string
 *                           name:
 *                             type: string
 *                           avatar:
 *                             type: string
 *                           role:
 *                             type: string
 *                           services:
 *                             type: array
 *                             items:
 *                               type: string
 *                           workStatus:
 *                             type: string
 *                             enum: [offline, available, en_route, in_service]
 *                           currentJob:
 *                             nullable: true
 *                             type: object
 *                             properties:
 *                               bookingId:
 *                                 type: string
 *                               serviceName:
 *                                 type: string
 *                               customerName:
 *                                 type: string
 *       400:
 *         description: Invalid business ID
 *       401:
 *         description: Invalid or missing token
 *       403:
 *         description: Business owner access only, or not your business
 *       500:
 *         description: Server error
 */
router.get(
  "/:businessId/staff/on-duty",
  authMiddleware,
  onlyRole("businessOwner"),
  getStaffOnDuty,
);

/**
 * @swagger
 * /api/v1/business/{businessId}/staff:
 *   get:
 *     summary: List all staff
 *     description: Returns the business's staff across all account statuses with basic fields, an optional status filter and page/limit pagination.
 *     tags: [Business Staff]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: businessId
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: status
 *         required: false
 *         schema:
 *           type: string
 *           enum: [INVITED, ACTIVE, DECLINED, EXPIRED, REMOVED]
 *       - in: query
 *         name: page
 *         required: false
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 1
 *       - in: query
 *         name: limit
 *         required: false
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 20
 *     responses:
 *       200:
 *         description: Staff list fetched successfully
 *       400:
 *         description: Invalid business ID or status
 *       401:
 *         description: Invalid or missing token
 *       403:
 *         description: Business owner access only, or not your business
 *       500:
 *         description: Server error
 */
router.get(
  "/:businessId/staff",
  authMiddleware,
  onlyRole("businessOwner"),
  getAllStaff,
);

/**
 * @swagger
 * /api/v1/business/{businessId}/staff/{identifier}:
 *   get:
 *     summary: Get a staff member's detail
 *     description: Returns a staff member's full profile (identity, live working status, current job, today's jobs and rating). The identifier may be the staff code (SGD-...), Mongo id, or email.
 *     tags: [Business Staff]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: businessId
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: identifier
 *         required: true
 *         schema:
 *           type: string
 *         example: "SGD-284961"
 *     responses:
 *       200:
 *         description: Staff detail fetched successfully
 *       400:
 *         description: Invalid business ID or missing identifier
 *       401:
 *         description: Invalid or missing token
 *       403:
 *         description: Business owner access only, or not your business
 *       404:
 *         description: Staff not found in your business
 *       500:
 *         description: Server error
 */
router.get(
  "/:businessId/staff/:identifier",
  authMiddleware,
  onlyRole("businessOwner"),
  getStaffDetail,
);

/**
 * @swagger
 * /api/v1/business/staff/invites/respond:
 *   post:
 *     summary: Accept or decline a staff invitation
 *     description: Provider-facing endpoint for the invited person to respond to a business's staff invitation. The authenticated provider's email must match the invitation. Accepting activates the staff record, links the provider account and assigns the staff code; declining soft-marks it without touching the provider account.
 *     tags: [Business Staff]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - staffEmail
 *               - businessEmail
 *               - status
 *             properties:
 *               staffEmail:
 *                 type: string
 *                 format: email
 *                 example: tunde@example.com
 *               businessEmail:
 *                 type: string
 *                 format: email
 *                 example: business@example.com
 *               status:
 *                 type: string
 *                 enum: [accept, decline]
 *                 example: accept
 *     responses:
 *       200:
 *         description: Invitation response processed
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
 *                     status:
 *                       type: string
 *                       enum: [ACTIVE, DECLINED]
 *                     staffId:
 *                       type: string
 *                     staffCode:
 *                       type: string
 *                       nullable: true
 *                     businessId:
 *                       type: string
 *       400:
 *         description: Missing or invalid payload
 *       401:
 *         description: Invalid or missing token
 *       403:
 *         description: Provider access only, or responding to someone else's invitation
 *       404:
 *         description: Business or invitation not found
 *       409:
 *         description: Invitation already responded to, expired, or not pending
 *       500:
 *         description: Server error
 */
router.post(
  "/staff/invites/respond",
  authMiddleware,
  onlyRole("provider"),
  respondToStaffInvite,
);

/**
 * @swagger
 * /api/v1/business/staff/clock-in:
 *   post:
 *     summary: Request to clock in as staff
 *     description: Provider-facing. Sends a clock-in request to the business owner; the staff member goes on duty only once the owner approves it. On-duty staff count towards the business's fast-booking eligibility while their own location heartbeat is fresh. businessId is only required if the provider is active staff at more than one business. A provider can be on duty (or awaiting clock-in) at one business at a time. Repeating a pending request is a no-op; calling it while already on duty cancels any pending clock-out request.
 *     tags: [Business Staff]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               businessId:
 *                 type: string
 *     responses:
 *       200:
 *         description: Request pending, or current duty state (data.clockRequest shows the request)
 *       400:
 *         description: Invalid businessId, or businessId required for multi-business staff
 *       403:
 *         description: Provider access only
 *       404:
 *         description: Not an active staff member
 *       409:
 *         description: On duty or awaiting clock-in at another business
 *       500:
 *         description: Server error
 */
router.post("/staff/clock-in", authMiddleware, onlyRole("provider"), clockIn);

/**
 * @swagger
 * /api/v1/business/staff/clock-out:
 *   post:
 *     summary: Request to clock out as staff
 *     description: Provider-facing. Sends a clock-out request to the business owner; the staff member stays on duty until the owner approves it. businessId is only required if the provider is active staff at more than one business. Repeating a pending request is a no-op; calling it while already off duty cancels any pending clock-in request.
 *     tags: [Business Staff]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               businessId:
 *                 type: string
 *     responses:
 *       200:
 *         description: Request pending, or current duty state (data.clockRequest shows the request)
 *       400:
 *         description: Invalid businessId, or businessId required for multi-business staff
 *       403:
 *         description: Provider access only
 *       404:
 *         description: Not an active staff member
 *       500:
 *         description: Server error
 */
router.post("/staff/clock-out", authMiddleware, onlyRole("provider"), clockOut);

/**
 * @swagger
 * /api/v1/business/{businessId}/clock-requests:
 *   get:
 *     summary: List pending staff clock requests
 *     description: Business-facing. Returns active staff with a pending clock-in or clock-out request, oldest first.
 *     tags: [Business Staff]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: businessId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Pending clock requests
 *       400:
 *         description: Invalid business ID
 *       403:
 *         description: Not your business
 *       500:
 *         description: Server error
 */
router.get(
  "/:businessId/clock-requests",
  authMiddleware,
  onlyRole("businessOwner"),
  getPendingClockRequests,
);

/**
 * @swagger
 * /api/v1/business/{businessId}/staff/{staffId}/clock-request:
 *   post:
 *     summary: Approve or reject a staff clock request
 *     description: Business-facing. Approving a clock-in puts the staff member on duty; approving a clock-out takes them off duty. Rejecting leaves their duty state unchanged. The staff member is notified either way.
 *     tags: [Business Staff]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: businessId
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: staffId
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
 *               - action
 *             properties:
 *               action:
 *                 type: string
 *                 enum: [approve, reject]
 *               reason:
 *                 type: string
 *                 description: Optional note shown to the staff member
 *     responses:
 *       200:
 *         description: Request approved or rejected (returns current duty state)
 *       400:
 *         description: Invalid IDs, action or reason
 *       403:
 *         description: Not your business
 *       404:
 *         description: Staff not found in your business
 *       409:
 *         description: No pending request, staff not active, or staff on duty at another business
 *       500:
 *         description: Server error
 */
router.post(
  "/:businessId/staff/:staffId/clock-request",
  authMiddleware,
  onlyRole("businessOwner"),
  respondToClockRequest,
);

/**
 * @swagger
 * /api/v1/business/{businessId}/staff/{staffId}/clock-out:
 *   post:
 *     summary: Clock a staff member out
 *     description: Business-facing. Takes a staff member off duty immediately, without a request (e.g. they forgot to clock out). A pending clock-out request is marked approved. No-op if already off duty. The staff member is notified.
 *     tags: [Business Staff]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: businessId
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: staffId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               reason:
 *                 type: string
 *     responses:
 *       200:
 *         description: Staff clocked out (returns current duty state)
 *       400:
 *         description: Invalid IDs or reason
 *       403:
 *         description: Not your business
 *       404:
 *         description: Staff not found in your business
 *       409:
 *         description: Staff not active
 *       500:
 *         description: Server error
 */
/**
 * @swagger
 * /api/v1/business/{businessId}/staff/{staffId}:
 *   delete:
 *     summary: Remove a staff member
 *     description: Only the business owner that invited the staff member can remove them. Deletes the staff record.
 *     tags: [Business Staff]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: businessId
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: staffId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Staff removed successfully
 *       400:
 *         description: Invalid IDs
 *       401:
 *         description: Invalid or missing token
 *       403:
 *         description: Not your business or not the inviting business
 *       404:
 *         description: Staff not found in your business
 *       500:
 *         description: Server error
 */
router.delete(
  '/:businessId/staff/:staffId',
  authMiddleware,
  onlyRole('businessOwner'),
  removeStaff,
);

module.exports = router;
