const mongoose = require('mongoose');
const Provider = require('../../../models/ServiceProvider');
const Buyer = require('../../../models/ServiceUser');
const Business = require('../business/business.model');
const Staff = require('../business/staff.model'); 
const Product = require('../products/product.model');
const geolocationService = require('../../services/geolocation.service');
const { sendNinSubmittedEmail } = require('../../config/emailVerification');
const { getPagination } = require('../../shared/utils/pagination');

const getAllBuyers = async (req) => {
  const { page, limit, skip } = getPagination(req);

  const [result] = await Buyer.aggregate([
    { $sort: { createdAt: -1, _id: -1 } },
    {
      $facet: {
        data: [
          { $skip: skip },
          { $limit: limit },
          {
            $lookup: {
              from: 'bookings',
              localField: '_id',
              foreignField: 'userId',
              as: 'bookingStats',
              pipeline: [{ $count: 'count' }],
            },
          },
          {
            $addFields: {
              bookingsCount: {
                $ifNull: [{ $arrayElemAt: ['$bookingStats.count', 0] }, 0],
              },
            },
          },
          {
            $project: {
              bookingStats: 0,
              password: 0,
              otp: 0,
              otpExpiresAt: 0,
              resetOtp: 0,
              resetOtpExpires: 0,
              refreshToken: 0,
              __v: 0,
            },
          },
        ],
        total: [{ $count: 'count' }],
      },
    },
  ]);

  const buyers = result?.data || [];
  const total = result?.total?.[0]?.count || 0;

  return {
    success: true,
    count: buyers.length,
    total,
    page,
    totalPages: Math.ceil(total / limit) || 1,
    data: buyers,
  };
};

const getAllProviders = async (req) => {
  const { page, limit, skip } = getPagination(req);
  const { kycLevel, kycVerified } = req.query;
  const query = {};

  if (kycLevel !== undefined) {
    const parsedLevel = parseInt(kycLevel, 10);
    if (Number.isNaN(parsedLevel)) {
      const error = new Error('Invalid kycLevel');
      error.statusCode = 400;
      throw error;
    }
    query.kycLevel = parsedLevel;
  }

  if (kycVerified !== undefined) {
    const normalized = String(kycVerified).toLowerCase();
    if (normalized === 'true' || normalized === 'false') {
      query.kycVerified = normalized === 'true';
    } else {
      const error = new Error('Invalid kycVerified');
      error.statusCode = 400;
      throw error;
    }
  }

  const [result] = await Provider.aggregate([
    { $match: query },
    { $sort: { createdAt: -1, _id: -1 } },
    {
      $facet: {
        data: [
          { $skip: skip },
          { $limit: limit },
          {
            $lookup: {
              from: 'bookings',
              localField: '_id',
              foreignField: 'providerId',
              as: 'bookingStats',
              pipeline: [{ $count: 'count' }],
            },
          },
          {
            $addFields: {
              bookingsCount: {
                $ifNull: [{ $arrayElemAt: ['$bookingStats.count', 0] }, 0],
              },
            },
          },
          {
            $project: {
              bookingStats: 0,
              password: 0,
              otp: 0,
              otpExpiresAt: 0,
              resetOtp: 0,
              resetOtpExpires: 0,
              refreshToken: 0,
              __v: 0,
            },
          },
        ],
        total: [{ $count: 'count' }],
      },
    },
  ]);

  const providers = result?.data || [];
  const total = result?.total?.[0]?.count || 0;

  return {
    success: true,
    count: providers.length,
    total,
    page,
    totalPages: Math.ceil(total / limit) || 1,
    data: providers,
  };
};

const getAllUsers = async (req) => {
  const { page, limit, skip } = getPagination(req);

  const [result] = await Buyer.aggregate([
    { $addFields: { userType: 'buyer' } },
    { $project: { password: 0, __v: 0 } },
    {
      $unionWith: {
        coll: 'providers',
        pipeline: [
          { $addFields: { userType: 'provider' } },
          { $project: { password: 0, __v: 0 } },
        ],
      },
    },
    { $sort: { createdAt: -1, _id: -1 } },
    {
      $facet: {
        data: [{ $skip: skip }, { $limit: limit }],
        total: [{ $count: 'count' }],
      },
    },
  ]);

  const users = result?.data || [];
  const total = result?.total?.[0]?.count || 0;

  return {
    success: true,
    count: users.length,
    total,
    page,
    totalPages: Math.ceil(total / limit) || 1,
    data: users,
  };
};

const getUserByEmail = async (email) => {
  const normalizedEmail = String(email || '').trim().toLowerCase();
  const buyer = await Buyer.findOne({ email: normalizedEmail }).select('-password').lean();
  const provider = await Provider.findOne({ email: normalizedEmail }).select('-password').lean();
  const business = await Business.findOne({ email: normalizedEmail }).select('-password').lean();
  const account = buyer || provider || business;
  if (!account) return null;
  if (provider && account === provider) {
    account.products = await Product.find({
      ownerType: 'provider',
      owner: provider._id,
      status: 'approved',
    }).sort({ createdAt: -1 }).lean();
    const staffRecords = await Staff.find({ provider: provider._id, status: 'ACTIVE' })
      .select('staffCode business _id status role services canDoHomeService workStatus onDuty clockRequest acceptedAt')
      .lean();
    account.staffId = staffRecords.length ? staffRecords[0]._id : null;
    account.staffCode = staffRecords.length ? staffRecords[0].staffCode : null;
    account.staffMemberships = staffRecords;
  } else if (business && account === business) {
    account.products = await Product.find({
      ownerType: 'business',
      owner: business._id,
      status: 'approved',
    }).sort({ createdAt: -1 }).lean();
  }
  return account;
};

const getUserById = async (id) => {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    const error = new Error('Invalid user id');
    error.statusCode = 400;
    throw error;
  }

  const buyer = await Buyer.findById(id).select('-password');
  const provider = await Provider.findById(id).select('-password');
  const business = await Business.findById(id).select('-password');
  if (provider) {
    const products = await Product.find({
      ownerType: 'provider',
      owner: provider._id,
      status: 'approved',
    }).sort({ createdAt: -1 }).lean();
    const staffRecords = await Staff.find({ provider: provider._id, status: 'ACTIVE' })
      .select('staffCode business _id status role services canDoHomeService workStatus onDuty clockRequest acceptedAt')
      .lean();
    const providerObj = provider.toObject ? provider.toObject() : { ...provider };
    providerObj.products = products;
    providerObj.staffId = staffRecords.length ? staffRecords[0]._id : null;
    providerObj.staffCode = staffRecords.length ? staffRecords[0].staffCode : null;
    providerObj.staffMemberships = staffRecords;
    return providerObj;
  }
  if (business) {
    const products = await Product.find({
      ownerType: 'business',
      owner: business._id,
      status: 'approved',
    }).sort({ createdAt: -1 }).lean();
    const businessObj = business.toObject ? business.toObject() : { ...business };
    businessObj.products = products;
    return businessObj;
  }
  return buyer;
};

const uploadUserNin = async (buyerId, ninSlip) => {
  const buyer = await Buyer.findById(buyerId);
  if (!buyer) {
    const error = new Error('Buyer not found');
    error.statusCode = 404;
    throw error;
  }

  buyer.ninSlip = ninSlip;
  buyer.kycCompleted = true;
  await buyer.save();

  let notificationEmailSent = Boolean(buyer.email);
  if (buyer.email) {
    try {
      const firstName = buyer.fullName ? buyer.fullName.trim().split(/\s+/)[0] : 'there';
      await sendNinSubmittedEmail(buyer.email, {
        firstName,
        year: new Date().getFullYear(),
      });
    } catch (emailError) {
      console.error('NIN submitted email error:', emailError);
      notificationEmailSent = false;
    }
  }

  return {
    success: true,
    message: notificationEmailSent ? 'NIN uploaded successfully. We will review it and reach out once verified.' : 'NIN uploaded successfully. Verification email will be sent shortly.',
    data: buyer,
  };
};

const updateUserLocation = async (buyerId, { latitude, longitude, address }) => {
  if (!latitude || !longitude) {
    const error = new Error('Latitude and longitude are required');
    error.statusCode = 400;
    throw error;
  }

  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
    const error = new Error('Invalid coordinates');
    error.statusCode = 400;
    throw error;
  }

  const existingBuyer = await Buyer.findById(buyerId);
  if (!existingBuyer) {
    const error = new Error('Buyer not found');
    error.statusCode = 404;
    throw error;
  }

  const finalAddress = await geolocationService.resolveLocationAddress({
    latitude: Number(latitude),
    longitude: Number(longitude),
    providedAddress: address,
    existingLocation: existingBuyer.currentLocation,
  });

  const buyer = await Buyer.findByIdAndUpdate(
    buyerId,
    {
      $set: {
        'currentLocation.type': 'Point',
        'currentLocation.coordinates': [longitude, latitude],
        'currentLocation.address': finalAddress,
        lastLocationUpdate: new Date(),
      },
    },
    { new: true },
  );

  return {
    success: true,
    message: 'Location updated successfully',
    data: {
      currentLocation: buyer.currentLocation,
      lastLocationUpdate: buyer.lastLocationUpdate,
    },
  };
};

module.exports = {
  getPagination,
  getAllBuyers,
  getAllProviders,
  getAllUsers,
  getUserByEmail,
  getUserById,
  uploadUserNin,
  updateUserLocation,
};
