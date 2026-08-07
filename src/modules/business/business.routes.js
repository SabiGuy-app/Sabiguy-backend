const express = require('express');
const router = express.Router();
const {
  getAllBusinesses,
  inviteDriver,
  getBusinessDrivers,
  getBusinessVehicles,
  respondToInvitation,
} = require('./business.controller');
const authMiddleware = require('../../../middleware/authMiddleware');
const onlyRole = require('../../../middleware/roleMiddleware');

router.get('/getAllBusinesses', authMiddleware, getAllBusinesses);

// Business/Fleet management
router.post(
  '/invite-driver',
  authMiddleware,
  onlyRole('business'),
  inviteDriver,
);
router.get(
  '/drivers',
  authMiddleware,
  onlyRole('business'),
  getBusinessDrivers,
);
router.get(
  '/vehicles',
  authMiddleware,
  onlyRole('business'),
  getBusinessVehicles,
);
// Driver-facing: mounted here (rather than under /provider) to keep all
// fleet-invitation logic in one module.
router.post(
  '/driver/invitation/respond',
  authMiddleware,
  onlyRole('provider'),
  respondToInvitation,
);

module.exports = router;
