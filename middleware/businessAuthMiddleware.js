const jwt = require('jsonwebtoken');
const Business = require('../src/modules/business/business.model');

const businessAuthMiddleware = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'No token provided' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const { id, role } = decoded;
    if (role !== 'businessOwner') {
      return res.status(403).json({ message: 'Business access only' });
    }

    const business = await Business.findById(id);
    if (!business) {
      return res.status(404).json({ message: 'Business not found' });
    }
    if (business.isActive === false) {
      return res.status(403).json({ message: 'Account deactivated' });
    }

    req.user = { id: business._id, role: business.role, email: business.email };
    next();
  } catch (err) {
    return res.status(401).json({ message: 'Invalid token' });
  }
};

module.exports = businessAuthMiddleware;
