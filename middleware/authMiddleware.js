const jwt = require("jsonwebtoken");
const Buyer = require ("../models/ServiceUser");
const Provider = require ("../models/ServiceProvider");


const roleModelMap = {
  buyer: Buyer,
  provider: Provider,
};

const authMiddleware = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith("Bearer ")) {
    return res.status(401).json({ message: "No token provided" });
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const { id, role } = decoded;

    const Model = roleModelMap[role];
    if (!Model) {
      return res.status(403).json({ message: "Inval role" });
    }

    const user = await Model.findById(id);
    if (!user) {
      return res.status(404).json({ message: `${role} not found` });
    }

    req.user = { id: user._id, role };
    next();
  } catch (err) {
    return res.status(401).json({ message: "Invalid token" });
  }
};

module.exports = authMiddleware;
