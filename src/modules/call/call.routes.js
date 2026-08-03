const { getIceServers } = require("./call.service");
const authMiddleware = require("../../../middleware/authMiddleware");
const router = require("express").Router();

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

module.exports = router;
