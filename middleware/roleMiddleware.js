const onlyRole = (role) => {
  return (req, res, next) => {
    if (!req.user || req.user.role !== role) {
      return res.status(403).json({ message: `${role} access only` });
    }
    next();
  };
};

module.exports = onlyRole;



