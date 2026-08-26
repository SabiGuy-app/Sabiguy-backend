const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const Business = require('./business.model');
const authService = require('../auth/auth.service');
const {
  sendEmailOtp,
  forgotPasswordOtp,
  passwordChangedEmail,
  sendWelcomeEmail,
} = require('../../config/emailVerification');
const {
  normalizeEmail,
  findUserByEmailAcrossDb,
} = require('../../services/identity.service');
const {
  AppError,
  googleHelper,
  passwordHelper,
  emailHelper,
  accountHelper,
} = require('../../shared/utils/auth.helpers');

const REFRESH_TOKEN_SECRET =
  authService.REFRESH_TOKEN_SECRET || process.env.JWT_SECRET;

const findBusinessByEmail = async (email, { includePassword = false } = {}) => {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) return null;
  let query = Business.findOne({ email: normalizedEmail });
  if (includePassword) query = query.select('+password');
  return query;
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

const issueTokens = async (business) => {
  const token = authService.generateAccessToken(business);
  const refreshToken = authService.generateRefreshToken(business);
  business.refreshToken = refreshToken;
  business.refreshTokenExpiresAt =
    authService.getRefreshTokenExpiryDate(refreshToken);
  await business.save();
  return { token, refreshToken };
};

const guardAccountStatus = (business) => {
  if (business.isDeleted) {
    throw new AppError('Account deleted', 403);
  }
  if (business.isActive === false) {
    throw new AppError('Account deactivated', 403);
  }
};

const registerBusiness = async ({ email, password, fullName, phoneNumber, accountType }) => {
  const normalizedEmail = normalizeEmail(email);

  if (!normalizedEmail || !password) {
    throw new AppError('Email and password are required', 400);
  }
   if (!accountType || !["individual", "business"].includes(accountType)) {
    throw new AppError('accountType is required and must be "individual" or "business"', 400);
  }

  const existingEmail = await findUserByEmailAcrossDb(normalizedEmail);
  if (existingEmail) {
    if (
      existingEmail.role === 'businessOwner' &&
      !existingEmail.user.emailVerified
    ) {
      const otp = accountHelper.generateOtp();
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

  if (phoneNumber) {
    const { normalizePhoneNumber } = require('../../services/identity.service');
    const normalizedPhoneNumber = normalizePhoneNumber(phoneNumber);
    if (normalizedPhoneNumber) {
      const existingPhone = await Business.findOne({
        phoneNumber: normalizedPhoneNumber,
      });
      if (existingPhone) {
        throw new AppError('Phone number already in use', 400);
      }
    }
  }

  const hashedPassword = await passwordHelper.hash(password);
  const otp = accountHelper.generateOtp();
  const emailVerificationExpires = new Date(Date.now() + 10 * 60 * 1000);

  const newBusiness = new Business({
    email: normalizedEmail,
    password: hashedPassword,
    fullName,
    phoneNumber: phoneNumber || undefined,
    accountType,
    otp,
    emailVerificationExpires,
    emailVerified: false,
    role: 'businessOwner',
    authMethods: ['email'],
    kycLevel: 1,
    
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
  accountHelper.addAuthMethod(business, 'email');
  await business.save();

  await emailHelper.sendBusinessWelcomeEmailSafe(business.email, {
    firstName: accountHelper.getFirstName(business.fullName),
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

  // Rate-limit: 1 OTP per 60 seconds
  const now = new Date();
  const lastSent = business.lastVerificationOtpSentAt
    ? new Date(business.lastVerificationOtpSentAt)
    : null;
  if (lastSent && now.getTime() - lastSent.getTime() < 60 * 1000) {
    throw new AppError('Please wait before requesting another OTP', 429);
  }

  const otp = accountHelper.generateOtp();
  business.otp = otp;
  business.emailVerificationExpires = new Date(Date.now() + 10 * 60 * 1000);
  business.lastVerificationOtpSentAt = now;
  await business.save();
  await sendEmailOtp(normalizedEmail, otp);

  return { message: 'OTP resent successfully' };
};

const loginBusiness = async ({ email, password }) => {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail || !password) {
    throw new AppError('Email and password are required', 400);
  }

  const business = await findBusinessByEmail(normalizedEmail);
  if (!business) {
    throw new AppError('Invalid credentials', 400);
  }

  guardAccountStatus(business);

  if (!business.emailVerified) {
    throw new AppError('Please verify your email before logging in', 403);
  }

  // Google-only user trying email/password login
  if (business.isGoogleUser && !business.password) {
    throw new AppError(
      "This account was created with Google. Please log in with Google, or use 'Forgot Password' to set a password.",
      400,
    );
  }

  const isMatch = await passwordHelper.compare(password, business.password);
  if (!isMatch) {
    throw new AppError('Invalid credentials', 400);
  }

  const { token, refreshToken } = await issueTokens(business);

  return {
    message: 'Login successful',
    token,
    refreshToken,
    user: authService.buildAuthUserPayload(business),
  };
};

const googleAuthBusiness = async (token) => {
  if (!token) {
    throw new AppError('Token is required', 400);
  }

  const { email, googleId, name, picture } =
    await googleHelper.verifyToken(token);
  const normalizedEmail = normalizeEmail(email);

  if (!normalizedEmail) {
    throw new AppError('Invalid email returned from Google', 400);
  }

  let business = await Business.findOne({ email: normalizedEmail });

  if (business) {
    guardAccountStatus(business);

    let message = 'Login successful';

    // Case 1: Unverified account — verify + link Google
    if (!business.emailVerified) {
      business.emailVerified = true;
      business.otp = null;
      business.emailVerificationExpires = null;
      message = 'Email verified and account linked successfully.';
    }

    // Case 2: Existing email-only user — link Google account
    if (!business.isGoogleUser) {
      accountHelper.linkGoogleAccount(business, googleId);
      message = 'Google account linked successfully.';
    } else if (business.googleId && business.googleId !== googleId) {
      // Case 3: Google ID mismatch
      throw new AppError(
        'Google account mismatch. Please use the correct Google account.',
        401,
      );
    }

    // Update profile picture if missing
    if (!business.profilePicture && picture) {
      business.profilePicture = picture;
    }

    const { token: jwtToken, refreshToken } = await issueTokens(business);

    return {
      message,
      token: jwtToken,
      refreshToken,
      user: authService.buildAuthUserPayload(business),
      newUser: false,
    };
  }

  // No business account — check if email is used by another role
  const existingGlobalUser = await findUserByEmailAcrossDb(normalizedEmail);
  if (existingGlobalUser) {
    throw new AppError('Email already in use by another account type', 400);
  }

  // Create new business with Google
  business = new Business({
    email: normalizedEmail,
    password: null,
    fullName: name,
    isGoogleUser: true,
    googleId,
    emailVerified: true,
    profilePicture: picture,
    role: 'businessOwner',
    authMethods: ['google'],
  });

  const { token: jwtToken, refreshToken } = await issueTokens(business);

  await emailHelper.sendBusinessWelcomeEmailSafe(normalizedEmail, {
    firstName: accountHelper.getFirstName(name),
    role: business.role,
  });

  return {
    message: 'Signup successful via Google.',
    token: jwtToken,
    refreshToken,
    user: authService.buildAuthUserPayload(business),
    newUser: true,
  };
};

// Both google-signup and google-login call the same unified handler
const googleSignUpBusiness = googleAuthBusiness;
const googleLogInBusiness = googleAuthBusiness;

// ─── Forgot Password ────────────────────────────────────────────────────────

const forgotBusinessPassword = async (email) => {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) {
    throw new AppError('Email is required', 400);
  }

  const business = await findBusinessByEmail(normalizedEmail);
  if (!business) {
    throw new AppError('User not found, please check the email', 400);
  }

  const otp = accountHelper.generateOtp();
  business.resetOtp = otp;
  business.resetOtpExpires = Date.now() + 10 * 60 * 1000; // 10 min
  await business.save();
  await forgotPasswordOtp(normalizedEmail, otp);

  return { message: 'Forgot password OTP sent to email' };
};

const resendForgotBusinessPasswordOtp = async (email) => {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) {
    throw new AppError('Email is required', 400);
  }

  const business = await findBusinessByEmail(normalizedEmail);
  if (!business) {
    throw new AppError('User not found, please check the email', 400);
  }

  // Rate-limit: 1 OTP per 60 seconds
  const now = new Date();
  const lastSent = business.lastResetOtpSentAt
    ? new Date(business.lastResetOtpSentAt)
    : null;
  if (lastSent && now.getTime() - lastSent.getTime() < 60 * 1000) {
    throw new AppError('Please wait before requesting another OTP', 429);
  }

  const otp = accountHelper.generateOtp();
  business.resetOtp = otp;
  business.resetOtpExpires = Date.now() + 10 * 60 * 1000; // 10 min
  business.lastResetOtpSentAt = now;
  await business.save();
  await forgotPasswordOtp(normalizedEmail, otp);

  return { message: 'Forgot password OTP resent to email' };
};

const verifyBusinessResetOtp = async (email, otp) => {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail || !otp) {
    throw new AppError('Email and OTP are required', 400);
  }

  const business = await findBusinessByEmail(normalizedEmail);
  if (!business) {
    throw new AppError('User not found, please check the email', 400);
  }

  if (
    !otp ||
    business.resetOtp !== otp ||
    business.resetOtpExpires < Date.now()
  ) {
    throw new AppError('Invalid or expired OTP', 400);
  }

  return { message: 'OTP verified successfully' };
};

const resetBusinessPassword = async (email, otp, newPassword) => {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail || !otp || !newPassword) {
    throw new AppError('Email, OTP, and new password are required', 400);
  }

  const business = await findBusinessByEmail(normalizedEmail);
  if (!business) {
    throw new AppError('User not found, please check the email', 400);
  }

  if (business.resetOtp !== otp || business.resetOtpExpires < Date.now()) {
    throw new AppError('Invalid or expired OTP', 400);
  }

  business.password = await passwordHelper.hash(newPassword);
  business.resetOtp = undefined;
  business.resetOtpExpires = undefined;
  accountHelper.addAuthMethod(business, 'email');
  await business.save();

  // Non-blocking notification
  const changedAt = accountHelper.formatChangedAt();
  await emailHelper.sendPasswordChangedSafe(
    passwordChangedEmail,
    business.email,
    {
      changedAt,
    },
  );

  return { message: 'Password reset successful' };
};

const changeBusinessPassword = async (userId, oldPassword, newPassword) => {
  if (!newPassword) {
    throw new AppError('New password is required', 400);
  }

  const strongPassword = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])/;
  if (!strongPassword.test(newPassword)) {
    throw new AppError(
      'Password must contain uppercase, lowercase, number, and special character',
      400,
    );
  }
  if (newPassword.length < 8) {
    throw new AppError('New password must be at least 8 characters long', 400);
  }

  const business = await Business.findById(userId);
  if (!business) {
    throw new AppError('Business not found', 404);
  }

  // Google-only users setting their first password
  const isSettingFirstPassword = business.isGoogleUser && !business.password;

  if (isSettingFirstPassword) {
    if (oldPassword) {
      throw new AppError(
        'You are setting your first password. Do not send oldPassword.',
        400,
      );
    }
  } else {
    if (!oldPassword) {
      throw new AppError('Old password is required', 400);
    }
    const isMatch = await passwordHelper.compare(
      oldPassword,
      business.password,
    );
    if (!isMatch) {
      throw new AppError('Old password is incorrect', 401);
    }
  }

  business.password = await passwordHelper.hash(newPassword);
  accountHelper.addAuthMethod(business, 'email');
  await business.save();

  // Non-blocking notification
  const changedAt = accountHelper.formatChangedAt();
  await emailHelper.sendPasswordChangedSafe(
    passwordChangedEmail,
    business.email,
    {
      changedAt,
    },
  );

  return {
    message: isSettingFirstPassword
      ? 'Password set successfully. You can now log in with email and password.'
      : 'Password changed successfully',
  };
};

// ─── Refresh Token ───────────────────────────────────────────────────────────

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
  forgotBusinessPassword,
  resendForgotBusinessPasswordOtp,
  verifyBusinessResetOtp,
  resetBusinessPassword,
  changeBusinessPassword,
};
