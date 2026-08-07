const { OAuth2Client } = require('google-auth-library');
const axios = require('axios');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const Business = require('./business.model');
const authService = require('../auth/auth.service');
const {
  sendEmailOtp,
  sendWelcomeEmail,
} = require('../../config/emailVerification');
const {
  normalizeEmail,
  normalizePhoneNumber,
  findUserByEmailAcrossDb,
} = require('../../services/identity.service');

const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
const REFRESH_TOKEN_SECRET =
  authService.REFRESH_TOKEN_SECRET || process.env.JWT_SECRET;

class AppError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

const generateOtp = () =>
  Math.floor(100000 + Math.random() * 900000).toString();

const findBusinessByEmail = async (email, { includePassword = false } = {}) => {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) return null;
  let query = Business.findOne({ email: normalizedEmail });
  if (includePassword) query = query.select('+password');
  return await query;
};
const getBusinessProfileById = async (id) => {
  const business = await Business.findById(id).select(
    '-password -otp -emailVerificationExpires -refreshToken -resetOtp -resetOtpExpires',
  );
  if (!business) {
    throw new AppError('Business not found', 404);
  }
  return business;
};
const verifyGoogleToken = async (token) => {
  if (!token || typeof token !== 'string') {
    throw new AppError('Token is required', 400);
  }

  if (token.startsWith('1//')) {
    throw new AppError(
      'Invalid token format: Received a Refresh Token instead of an ID Token or Access Token',
      400,
    );
  }

  try {
    const ticket = await client.verifyIdToken({
      idToken: token,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();
    return {
      email: payload.email,
      googleId: payload.sub,
      name:
        payload.name ||
        `${payload.given_name || ''} ${payload.family_name || ''}`.trim(),
      picture: payload.picture,
    };
  } catch (idTokenError) {
    try {
      const tokenInfoResponse = await axios.get(
        'https://www.googleapis.com/oauth2/v3/tokeninfo',
        {
          params: { access_token: token },
        },
      );

      const audience =
        tokenInfoResponse.data.aud || tokenInfoResponse.data.issued_to;
      if (audience !== process.env.GOOGLE_CLIENT_ID) {
        throw new AppError('Invalid token audience', 401);
      }

      const userInfoResponse = await axios.get(
        'https://www.googleapis.com/oauth2/v3/userinfo',
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      );

      const info = userInfoResponse.data;
      return {
        email: info.email,
        googleId: info.sub,
        name:
          info.name ||
          `${info.given_name || ''} ${info.family_name || ''}`.trim(),
        picture: info.picture,
      };
    } catch (accessTokenError) {
      throw new AppError('Invalid or expired Google token', 401);
    }
  }
};

const registerBusiness = async ({
  email,
  password,
  fullName,
  phoneNumber,
  accountType,
  BusinessName,
  regNumber,
  BusinessAddress,
  cityOfOperation,
}) => {
  const normalizedEmail = normalizeEmail(email);
  const normalizedPhoneNumber = normalizePhoneNumber(phoneNumber);

  if (!normalizedEmail || !password) {
    throw new AppError('Email and password are required', 400);
  }

  const existingEmail = await findUserByEmailAcrossDb(normalizedEmail);
  if (existingEmail) {
    if (
      existingEmail.role === 'businessOwner' &&
      !existingEmail.user.emailVerified
    ) {
      const otp = generateOtp();
      existingEmail.user.otp = otp;
      existingEmail.user.emailVerificationExpires = new Date(
        Date.now() + 10 * 60 * 1000,
      );
      await existingEmail.user.save();
      await sendEmailOtp(normalizedEmail, otp);
      return {
        resend: true,
        message: 'Email not verified. OTP resent to email.',
      };
    }
    throw new AppError('Email already in use', 400);
  }

  if (normalizedPhoneNumber) {
    const existingPhone = await Business.findOne({
      phoneNumber: normalizedPhoneNumber,
    });
    if (existingPhone) {
      throw new AppError('Phone number already in use', 400);
    }
  }

  const hashedPassword = await bcrypt.hash(password, 10);
  const otp = generateOtp();
  const emailVerificationExpires = new Date(Date.now() + 10 * 60 * 1000);

  const newBusiness = new Business({
    email: normalizedEmail,
    password: hashedPassword,
    fullName,
    phoneNumber: normalizedPhoneNumber || phoneNumber,
    accountType,
    BusinessName,
    regNumber,
    BusinessAddress,
    cityOfOperation,
    otp,
    emailVerificationExpires,
    emailVerified: false,
    role: 'businessOwner',
  });

  await newBusiness.save();
  await sendEmailOtp(normalizedEmail, otp);

  const token = authService.generateAccessToken(newBusiness);
  return {
    message: 'OTP sent to email. Please verify to complete registration.',
    business: { id: newBusiness._id, email: newBusiness.email },
    token,
  };
};

// FIX: Combined email lookup with OTP validation to prevent cross-account validation collisions
const verifyBusinessEmail = async (email, otp) => {
  if (!email || !otp) {
    throw new AppError('Email and OTP are required', 400);
  }

  const normalizedEmail = normalizeEmail(email);
  const business = await Business.findOne({ email: normalizedEmail, otp });

  if (!business) {
    throw new AppError('Invalid or expired OTP', 400);
  }

  if (
    !business.emailVerificationExpires ||
    new Date() > new Date(business.emailVerificationExpires)
  ) {
    throw new AppError('OTP has expired', 400);
  }

  business.emailVerified = true;
  business.otp = null;
  business.emailVerificationExpires = null;
  business.kycLevel = 1;
  await business.save();

  await sendWelcomeEmail(business.email, {
    firstName: business.fullName
      ? business.fullName.trim().split(/\s+/)[0]
      : 'there',
    year: new Date().getFullYear(),
    ctaUrl: process.env.FRONTEND_URL || '',
    ctaText: 'Open SabiGuy',
    role: business.role,
  });

  return { message: 'Email verified successfully as businessOwner.' };
};

const resendBusinessOtp = async (email) => {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) {
    throw new AppError('Email is required', 400);
  }

  const business = await findBusinessByEmail(normalizedEmail);
  if (!business) {
    throw new AppError('Business not found', 404);
  }

  if (business.emailVerified) {
    throw new AppError('Email already verified', 400);
  }

  const otp = generateOtp();
  business.otp = otp;
  business.emailVerificationExpires = new Date(Date.now() + 10 * 60 * 1000);
  await business.save();
  await sendEmailOtp(normalizedEmail, otp);

  return { message: 'OTP resent successfully' };
};

const loginBusiness = async ({ email, password }) => {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail || !password) {
    throw new AppError('Email and password are required', 400);
  }

  const business = await findBusinessByEmail(normalizedEmail, {
    includePassword: true,
  });
  if (!business) {
    throw new AppError('Invalid credentials', 400);
  }

  if (business.isDeleted) {
    throw new AppError('Account deleted', 403);
  }

  if (business.isActive === false) {
    throw new AppError('Account deactivated', 403);
  }

  if (!business.emailVerified) {
    throw new AppError('Please verify your email before logging in', 403);
  }

  if (business.isGoogleUser && !business.password) {
    throw new AppError(
      'You signed up with Google. Please log in using Google.',
      400,
    );
  }

  const isMatch = await bcrypt.compare(password, business.password);
  if (!isMatch) {
    throw new AppError('Invalid credentials', 400);
  }

  const token = authService.generateAccessToken(business);
  const refreshToken = authService.generateRefreshToken(business);

  business.refreshToken = refreshToken;
  business.refreshTokenExpiresAt =
    authService.getRefreshTokenExpiryDate(refreshToken);
  await business.save();

  return {
    message: 'Login successful',
    token,
    refreshToken,
    user: authService.buildAuthUserPayload(business),
  };
};

const googleSignUpBusiness = async (token) => {
  if (!token) {
    throw new AppError('Token is required', 400);
  }

  const { email, googleId, name } = await verifyGoogleToken(token);
  const normalizedEmail = normalizeEmail(email);

  if (!normalizedEmail) {
    throw new AppError('Invalid email returned from Google', 400);
  }

  let business = await Business.findOne({ email: normalizedEmail });

  if (business) {
    if (!business.emailVerified) {
      // Fix: Securely bridge unverified local user into Google auth context safely
      business.emailVerified = true;
      business.otp = null;
      business.emailVerificationExpires = null;
      business.isGoogleUser = true;
      business.googleId = googleId;
    } else if (!business.isGoogleUser) {
      // Fix: Broken error message string corrected
      throw new AppError(
        'Email already in use with regular password login.',
        400,
      );
    }
    // Note: If they are already a verified Google user, we just allow them to get new tokens below.
  } else {
    const existingGlobalUser = await findUserByEmailAcrossDb(normalizedEmail);
    if (existingGlobalUser) {
      throw new AppError('Email already in use', 400);
    }

    business = new Business({
      email: normalizedEmail,
      password: null,
      fullName: name,
      isGoogleUser: true,
      googleId,
      emailVerified: true,
      role: 'businessOwner',
    });
  }

  const jwtToken = authService.generateAccessToken(business);
  const refreshToken = authService.generateRefreshToken(business);

  business.refreshToken = refreshToken;
  business.refreshTokenExpiresAt =
    authService.getRefreshTokenExpiryDate(refreshToken);
  await business.save();

  // Non-blocking mail trigger optimization recommended here
  try {
    await sendWelcomeEmail(normalizedEmail, {
      firstName: name ? name.trim().split(/\s+/)[0] : 'there',
      year: new Date().getFullYear(),
      ctaUrl: process.env.FRONTEND_URL || '',
      ctaText: 'Open SabiGuy',
      role: business.role,
    });
  } catch (emailError) {
    console.error('Welcome email failed to dispatch:', emailError);
  }

  return {
    message: 'Signup successful via Google.',
    token: jwtToken,
    refreshToken,
    user: authService.buildAuthUserPayload(business),
  };
};
const googleLogInBusiness = async (token) => {
  if (!token) {
    throw new AppError('Token is required', 400);
  }
  const { email, googleId } = await verifyGoogleToken(token);
  const normalizedEmail = normalizeEmail(email);
  const business = await findBusinessByEmail(normalizedEmail, {
    includePassword: true,
  });
  if (!business) {
    throw new AppError('Business not found', 404);
  }
  if (business.isDeleted) {
    throw new AppError('Account deleted', 403);
  }
  if (business.isActive === false) {
    throw new AppError('Account deactivated', 403);
  }
  if (!business.isGoogleUser) {
    throw new AppError(
      'This email was registered with a password. Please log in with email/password.',
      400,
    );
  }
  if (business.googleId && business.googleId !== googleId) {
    throw new AppError(
      'Google account mismatch. Please use the correct Google account.',
      401,
    );
  }
  const jwtToken = authService.generateAccessToken(business);
  const refreshToken = authService.generateRefreshToken(business);
  business.refreshToken = refreshToken;
  business.refreshTokenExpiresAt =
    authService.getRefreshTokenExpiryDate(refreshToken);
  await business.save();
  return {
    message: 'Login successful',
    token: jwtToken,
    refreshToken,
    user: authService.buildAuthUserPayload(business),
  };
};
const refreshAuthToken = async (refreshToken) => {
  if (!refreshToken) {
    throw new AppError('refreshToken is required', 400);
  }
  let decoded;
  try {
    decoded = jwt.verify(refreshToken, REFRESH_TOKEN_SECRET);
  } catch (error) {
    throw new AppError('Refresh token expired or invalid', 401);
  }
  const business = await Business.findById(decoded.id);
  if (
    !business ||
    business.refreshToken !== refreshToken ||
    business.isDeleted ||
    business.isActive === false
  ) {
    throw new AppError('Invalid refresh token', 401);
  }
  if (
    business.refreshTokenExpiresAt &&
    new Date(business.refreshTokenExpiresAt).getTime() < Date.now()
  ) {
    throw new AppError('Refresh token expired', 401);
  }
  const token = authService.generateAccessToken(business);
  return { token };
};
module.exports = {
  registerBusiness,
  verifyBusinessEmail,
  getBusinessProfileById,
  resendBusinessOtp,
  loginBusiness,
  googleSignUpBusiness,
  googleLogInBusiness,
  refreshAuthToken,
};
