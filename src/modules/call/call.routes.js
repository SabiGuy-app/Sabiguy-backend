const { getIceServers } = require("./call.service");
const authMiddleware = require("../../../middleware/authMiddleware");
const router = require("express").Router();
const Call = require("./Call.model");
const notificationService = require("../../services/notification.service");

/**
 * @swagger
 * tags:
 *   name: Call
 *   description: WebRTC signaling and ICE server endpoints
 */

/**
 * @swagger
 * /api/v1/call/ice-servers:
 *   get:
 *     summary: Get ICE servers for WebRTC
 *     description: Returns the ICE server configuration needed by the frontend to establish WebRTC peer connections.
 *     tags: [Call]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: ICE servers returned successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 iceServers:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       urls:
 *                         type: array
 *                         items:
 *                           type: string
 *                       username:
 *                         type: string
 *                       credential:
 *                         type: string
 *       401:
 *         description: Authentication required
 *       500:
 *         description: Failed to load ICE servers
 */
router.get("/ice-servers", authMiddleware, async (req, res) => {
  try {
    const iceServers = await getIceServers();
    res.json({ iceServers });
  } catch (error) {
    console.error("Failed to load ICE servers:", error.message);
    res.status(500).json({ message: "Failed to load ICE servers" });
  }
});

// Mobile fallback: fetch the WebRTC offer after accepting the FCM incoming-call alert.
router.get("/pending", authMiddleware, async (req, res) => {
  try {
    const { bookingId } = req.query;
    if (!bookingId) return res.status(400).json({ message: "bookingId is required" });
    const call = await Call.findOne({
      bookingId,
      receiverId: req.user.id,
      receiverType: req.user.role,
      status: "ringing",
    }).sort({ createdAt: -1 });
    if (!call) return res.status(404).json({ message: "No ringing call found" });
    if (call.expiresAt <= new Date()) {
      call.status = "expired";
      await call.save();
      return res.status(410).json({ message: "Call has expired" });
    }
    return res.json({
      bookingId: call.bookingId,
      callerId: call.callerId,
      callerType: call.callerType,
      callerName: call.callerName,
      offer: call.offer,
      iceServers: call.iceServers,
      expiresAt: call.expiresAt,
    });
  } catch (error) {
    console.error("Get pending call error:", error.message);
    return res.status(500).json({ message: "Failed to retrieve pending call" });
  }
});

router.post("/reject", authMiddleware, async (req, res) => {
  try {
    const { bookingId } = req.body;
    if (!bookingId) return res.status(400).json({ message: "bookingId is required" });
    const call = await Call.findOneAndUpdate(
      { bookingId, receiverId: req.user.id, receiverType: req.user.role, status: "ringing", expiresAt: { $gt: new Date() } },
      { $set: { status: "rejected" } },
      { new: true },
    );
    if (!call) return res.status(404).json({ message: "No ringing call found" });
    notificationService.io?.to(`${call.callerType}:${call.callerId}`).emit("call:rejected", {
      bookingId: call.bookingId,
      rejectedBy: call.receiverId,
    });
    return res.json({ message: "Call rejected", bookingId: call.bookingId });
  } catch (error) {
    console.error("Reject call error:", error.message);
    return res.status(500).json({ message: "Failed to reject call" });
  }
});

module.exports = router;
