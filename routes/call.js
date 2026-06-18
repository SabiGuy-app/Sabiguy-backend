const { getIceServers } = require("../src/services/turnService");
const authMiddleware = require("../middleware/authMiddleware");
const router = require("express").Router();


router.get("/ice-servers", authMiddleware, async (req, res) => {
  const iceServers = await getIceServers();
  res.json({ iceServers });
});

module.exports = router;