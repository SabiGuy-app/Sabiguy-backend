const { getPagination } = require('../../shared/utils/pagination');
const Business = require('./business.model');
const businessService = require('./business.service');

const getAllBusinesses = async (req, res, next) => {
  try {
    // Get pagination parameters from request
    const { page, limit, skip } = getPagination(req, {
      defaultPage: 1,
      defaultLimit: 20,
      maxLimit: 100,
    });

    // Add search/filter functionality
    let filters = {};
    if (req.query.search) {
      filters.$or = [
        { BusinessName: { $regex: req.query.search, $options: 'i' } },
        { email: { $regex: req.query.search, $options: 'i' } },
        { regNumber: { $regex: req.query.search, $options: 'i' } },
      ];
    }

    if (req.query.isActive !== undefined) {
      filters.isActive = req.query.isActive === 'true';
    }

    if (req.query.kycVerified !== undefined) {
      filters.kycVerified = req.query.kycVerified === 'true';
    }

    // Get businesses with pagination
    const result = await businessService.getBusinessesWithPagination(filters, {
      skip,
      limit,
    });

    const response = {
      status: 'success',
      data: {
        businesses: result.businesses,
        pagination: {
          currentPage: page,
          totalPages: Math.ceil(result.total / limit),
          totalItems: result.total,
          itemsPerPage: limit,
          hasNext: page < Math.ceil(result.total / limit),
          hasPrev: page > 1,
        },
      },
    };

    res.status(200).json(response);
  } catch (error) {
    console.error('Error in getAllBusinesses controller:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

module.exports = {
  getAllBusinesses,
};
