const express = require('express');
const router = express.Router();
const { getAllBusinesses } = require('./business.controller');
const authMiddleware = require('../../../middleware/authMiddleware');
const onlyRole = require('../../../middleware/roleMiddleware');

router.get('/getAllBusinesses', authMiddleware, getAllBusinesses);
module.exports = router;
