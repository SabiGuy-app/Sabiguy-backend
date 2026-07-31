const { getIceServers } = require("./call.service");
const authMiddleware = require("../../../middleware/authMiddleware");
const router = require("express").Router();

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
