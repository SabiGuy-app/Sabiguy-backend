const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const Provider = require('../../../models/ServiceProvider');
const Buyer = require('../../../models/ServiceUser');
const Admin = require('../admin/Admin.model');
const { findUserByEmailAcrossDb, findUserByPhoneAcrossDb, normalizePhoneNumber } = require('../../services/identity.service');

const roleModelMap = {
  buyer: Buyer,
  provider: Provider,
  admin: Admin,
};

const normalizeEmail = (email) => String(email || '').trim().toLowerCase();

const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const findUserByEmail = async (Model, email, { includePassword = false } = {}) => {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) return null;

  let query = Model.findOne({ email: normalizedEmail });
  if (includePassword) {
    query = query.select('+password');
  }

  const exactMatch = await query;
  if (exactMatch) return exactMatch;

  let fallbackQuery = Model.findOne({
    email: new RegExp(`^${escapeRegex(normalizedEmail)}$`, 'i'),
  });
  if (includePassword) {
    fallbackQuery = fallbackQuery.select('+password');
  }

  return fallbackQuery;
};

const ACCESS_TOKEN_EXPIRES_IN = process.env.ACCESS_TOKEN_EXPIRES_IN || '20h';
const REFRESH_TOKEN_EXPIRES_IN = process.env.REFRESH_TOKEN_EXPIRES_IN || '7d';
const REFRESH_TOKEN_SECRET = process.env.REFRESH_TOKEN_SECRET || process.env.JWT_SECRET;

const generateAccessToken = (user) => jwt.sign(
  { id: user._id, role: user.role, email: user.email },
  process.env.JWT_SECRET,
  { expiresIn: ACCESS_TOKEN_EXPIRES_IN },
);

const generateRefreshToken = (user) => jwt.sign(
  { id: user._id, role: user.role, email: user.email },
  REFRESH_TOKEN_SECRET,
  { expiresIn: REFRESH_TOKEN_EXPIRES_IN },
);

const getRefreshTokenExpiryDate = (token) => {
  const decoded = jwt.decode(token);
  if (!decoded?.exp) return null;
  return new Date(decoded.exp * 1000);
};

const buildAuthUserPayload = (user) => ({
  email: user.email,
  _id: user._id,
  role: user.role,
  kycCompleted: Boolean(user.kycCompleted),
  kycLevel: user.kycLevel ?? 0,
  kycVerified: Boolean(user.kycVerified),
});

const passwordMatches = (candidatePassword, storedPassword) => bcrypt.compare(candidatePassword, storedPassword);

module.exports = {
  roleModelMap,
  normalizeEmail,
  normalizePhoneNumber,
  findUserByEmail,
  findUserByEmailAcrossDb,
  findUserByPhoneAcrossDb,
  generateAccessToken,
  generateRefreshToken,
  getRefreshTokenExpiryDate,
  buildAuthUserPayload,
  passwordMatches,
};
