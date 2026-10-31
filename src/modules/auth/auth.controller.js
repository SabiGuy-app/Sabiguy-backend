const { OAuth2Client } = require('google-auth-library');
const dotenv = require('dotenv');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const axios = require('axios');
const Provider = require('../../../models/ServiceProvider');
const Buyer = require('../../../models/ServiceUser');
const Admin = require('../admin/Admin.model');
const Staff = require('../business/staff.model');
const authService = require('./auth.service');
const AccountLink = require('./accountLink.model');
const { notifyAdminTeam } = require('../../services/adminNotification.service');
const { getClientPlatform } = require('../../services/clientPlatform.service');

dotenv.config();
const {
  sendEmailOtp,
  forgotPasswordOtp,
  passwordChangedEmail,
  sendWelcomeEmail,
  sendAccountDeletionOtp,
} = require('../../config/emailVerification');
const {
  findEmailProfiles,
  findUserByPhoneAcrossDb,
  normalizePhoneNumber,
} = require('../../services/identity.service');

const {
  AppError,
  googleHelper,
  passwordHelper,
  emailHelper,
  accountHelper,
} = require('../../shared/utils/auth.helpers');

const roleModelMap = authService.roleModelMap;
const normalizeEmail = authService.normalizeEmail;
const findUserByEmail = authService.findUserByEmail;
const generateAccessToken = authService.generateAccessToken;
const generateRefreshToken = authService.generateRefreshToken;
const getRefreshTokenExpiryDate = authService.getRefreshTokenExpiryDate;
const buildAuthUserPayload = authService.buildAuthUserPayload;
const { passwordMatches } = authService;

const authRoles = Object.keys(roleModelMap);

const findUserByRoleAndEmail = async (role, email, options) => {
  const Model = roleModelMap[role];
  if (!Model) return null;
  return findUserByEmail(Model, email, options);
};

const findUserAcrossRoles = async (email, roles = authRoles) => {
  for (const role of roles) {
    const user = await findUserByRoleAndEmail(
      role,
      email,
      role === 'admin' ? { includePassword: true } : undefined,
    );
    if (user) return { user, role };
  }

  return { user: null, role: null };
};

exports.googleSignUp = async (req, res) => {
  const { token } = req.body;

  if (!token) {
    return res.status(400).json({ message: 'Token is required' });
  }

  try {
    const { email, googleId, name, picture } =
      await googleHelper.verifyToken(token);
    const normalizedEmail = normalizeEmail(email);

    // Check if email already exists
    const existingEmailProfiles = await findEmailProfiles(normalizedEmail);
    const existingEmail = existingEmailProfiles.find(
      ({ role }) => role === 'provider',
    );

    if (existingEmail) {
      const user = existingEmail.user;
      let message = 'Account successfully linked and logged in.';

      // If not verified, this implicitly verifies them
      if (!user.emailVerified) {
        message = 'Email verified and account linked successfully.';
      }

      // Link the account (updates isGoogleUser, googleId, authMethods)
      accountHelper.linkGoogleAccount(user, googleId);
      await user.save();

      // Send welcome email if they weren't verified previously
      if (!user.emailVerified) {
        const welcomeSent = await emailHelper.sendWelcomeSafe(user.email, {
          firstName: accountHelper.getFirstName(user.fullName),
          role: user.role,
        });
        if (!welcomeSent) message += ' (Welcome email will be sent shortly)';
      }

      const jwtToken = generateAccessToken(user);
      const refreshToken = generateRefreshToken(user);
      user.refreshToken = refreshToken;
      user.refreshTokenExpiresAt = getRefreshTokenExpiryDate(refreshToken);
      await user.save();

      return res.status(200).json({
        message,
        token: jwtToken,
        refreshToken,
        user: buildAuthUserPayload(user),
        newUser: false, // flag for frontend
      });
    }
    if (existingEmailProfiles.some(({ role }) => role !== 'buyer')) {
      return res.status(400).json({
        message: 'Email already in use by an incompatible account type',
      });
    }

    // Create new provider
    const newUser = new Provider({
      email: normalizedEmail,
      signupPlatform: getClientPlatform(req),
      fullName: name,
      password: null,
      otp: null,
      otpExpiresAt: null,
      emailVerified: true,
      isGoogleUser: true,
      googleId,
      profilePicture: picture,
      role: 'provider',
      kycLevel: 1,
      isOnline: false,
      availability: {
        isAvailable: false,
        lastUpdated: new Date(),
      },
    });

    accountHelper.addAuthMethod(newUser, 'google');
    await newUser.save();
    await notifyAdminTeam({
      event: 'account_created',
      accountType: 'provider',
      account: newUser,
    });

    const welcomeSent = await emailHelper.sendWelcomeSafe(newUser.email, {
      firstName: accountHelper.getFirstName(newUser.fullName),
      role: newUser.role,
    });

    const jwtToken = generateAccessToken(newUser);
    const refreshToken = generateRefreshToken(newUser);
    newUser.refreshToken = refreshToken;
    newUser.refreshTokenExpiresAt = getRefreshTokenExpiryDate(refreshToken);
    await newUser.save();

    res.status(200).json({
      message: welcomeSent
        ? 'Signup successful! Welcome email sent.'
        : 'Signup successful! Welcome email will be sent shortly.',
      token: jwtToken,
      refreshToken,
      user: buildAuthUserPayload(newUser),
      newUser: true,
    });
  } catch (err) {
    console.error('Google signup failed:', err);
    res
      .status(401)
      .json({ message: 'Google signup failed', error: err.message });
  }
};

exports.googleSignUpBuyer = async (req, res) => {
  const { token } = req.body;

  if (!token) {
    return res.status(400).json({ message: 'Token is required' });
  }

  try {
    const { email, googleId, name, picture } =
      await googleHelper.verifyToken(token);
    const normalizedEmail = normalizeEmail(email);

    const existingEmailProfiles = await findEmailProfiles(normalizedEmail);
    const existingEmail = existingEmailProfiles.find(
      ({ role }) => role === 'buyer',
    );

    if (existingEmail) {
      const user = existingEmail.user;
      let message = 'Account successfully linked and logged in.';

      if (!user.emailVerified) {
        message = 'Email verified and account linked successfully.';
      }

      accountHelper.linkGoogleAccount(user, googleId);
      await user.save();

      if (!user.emailVerified) {
        const welcomeSent = await emailHelper.sendWelcomeSafe(user.email, {
          firstName: accountHelper.getFirstName(user.fullName),
          role: user.role,
        });
        if (!welcomeSent) message += ' (Welcome email will be sent shortly)';
      }

      const jwtToken = generateAccessToken(user);
      const refreshToken = generateRefreshToken(user);
      user.refreshToken = refreshToken;
      user.refreshTokenExpiresAt = getRefreshTokenExpiryDate(refreshToken);
      await user.save();

      return res.status(200).json({
        message,
        token: jwtToken,
        refreshToken,
        user: buildAuthUserPayload(user),
        newUser: false,
      });
    }
    if (
      existingEmailProfiles.some(
        ({ role }) => !['provider', 'businessOwner'].includes(role),
      )
    ) {
      return res.status(400).json({
        message: 'Email already in use by an incompatible account type',
      });
    }

    // Create new buyer
    const newUser = new Buyer({
      email: normalizedEmail,
      fullName: name,
      password: null,
      profilePicture: picture,
      otp: null,
      otpExpiresAt: null,
      emailVerified: true,
      isGoogleUser: true,
      googleId,
      role: 'buyer',
    });

    accountHelper.addAuthMethod(newUser, 'google');
    await newUser.save();

    const welcomeSent = await emailHelper.sendWelcomeSafe(newUser.email, {
      firstName: accountHelper.getFirstName(newUser.fullName),
      role: newUser.role,
    });

    const jwtToken = generateAccessToken(newUser);
    const refreshToken = generateRefreshToken(newUser);
    newUser.refreshToken = refreshToken;
    newUser.refreshTokenExpiresAt = getRefreshTokenExpiryDate(refreshToken);
    await newUser.save();

    res.status(200).json({
      message: welcomeSent
        ? 'Signup successful! Welcome email sent.'
        : 'Signup successful! Welcome email will be sent shortly.',
      token: jwtToken,
      refreshToken,
      user: buildAuthUserPayload(newUser),
      newUser: true,
    });
  } catch (err) {
    console.error('Google signup failed:', err);
    res
      .status(401)
      .json({ message: 'Google signup failed', error: err.message });
  }
};

exports.googleLogIn = async (req, res) => {
  const { token } = req.body;

  if (!token) {
    return res.status(400).json({ message: 'Token is required' });
  }

  try {
    const { email, googleId } = await googleHelper.verifyToken(token);
    const normalizedEmail = normalizeEmail(email);

    const { user } = await findUserAcrossRoles(normalizedEmail, [
      'provider',
      'buyer',
      'businessOwner',
    ]);

    if (!user) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    if (user.isDeleted) {
      return res.status(403).json({ message: 'Account deleted' });
    }

    if (user.isActive === false) {
      return res.status(403).json({ message: 'Account deactivated' });
    }

    // Hybrid magic: If they exist but aren't a Google user, link them
    if (!user.isGoogleUser) {
      accountHelper.linkGoogleAccount(user, googleId);
    } else if (user.googleId && user.googleId !== googleId) {
      return res.status(401).json({
        message:
          'Google account mismatch. Please use the correct Google account.',
      });
    }

    if (!user.emailVerified) {
      // Auto verify if they logged in with Google successfully
      user.emailVerified = true;
    }

    const jwtToken = generateAccessToken(user);
    const refreshToken = generateRefreshToken(user);
    user.refreshToken = refreshToken;
    user.refreshTokenExpiresAt = getRefreshTokenExpiryDate(refreshToken);
    await user.save();

    res.status(200).json({
      message: 'Login successful',
      token: jwtToken,
      refreshToken,
      user: buildAuthUserPayload(user),
    });
  } catch (err) {
    console.error('Google login failed:', err);
    res
      .status(401)
      .json({ message: 'Google login failed', error: err.message });
  }
};
exports.registerBuyer = async (req, res) => {
  const { email, password, phoneNumber, city, fullName } = req.body;
  const normalizedEmail = normalizeEmail(email);
  const normalizedPhoneNumber = normalizePhoneNumber(phoneNumber);

  try {
    const existingBuyer = await findUserByEmail(Buyer, normalizedEmail);
    if (existingBuyer) {
      if (!existingBuyer.emailVerified) {
        const otp = accountHelper.generateOtp();
        const otpExpiresAt = new Date(Date.now() + 10 * 60 * 1000);
        existingBuyer.otp = otp;
        existingBuyer.otpExpiresAt = otpExpiresAt;
        await existingBuyer.save();

        try {
          await sendEmailOtp(normalizedEmail, otp);
        } catch (OtpError) {
          console.error(
            'Failed to resend signup OTP:',
            normalizedEmail,
            OtpError.message,
          );
        }
        return res.status(200).json({
          message: 'Email not verified. OTP sent to email.',
        });
      }
      return res.status(400).json({ message: 'Email already in use' });
    }

    const existingEmailProfiles = await findEmailProfiles(normalizedEmail);
    const conflicts = existingEmailProfiles.some(
      ({ role }) => !['provider', 'businessOwner'].includes(role),
    );
    if (conflicts) {
      return res.status(400).json({
        message: 'Email already in use by an incompatible account type',
      });
    }

    if (normalizedPhoneNumber) {
      const existingPhone = await findUserByPhoneAcrossDb(
        normalizedPhoneNumber,
      );
      if (existingPhone) {
        return res.status(400).json({ message: 'Phone number already in use' });
      }
    }

    let hashedPassword = null;
    if (password) {
      hashedPassword = await passwordHelper.hash(password);
    }

    const otp = accountHelper.generateOtp();
    const otpExpiresAt = new Date(Date.now() + 10 * 60 * 1000); // expires in 10 mins

    const newBuyer = new Buyer({
      email: normalizedEmail,
      password: hashedPassword,
      otp,
      otpExpiresAt,
      isVerified: false,
      city,
      fullName,
      phoneNumber: normalizedPhoneNumber || phoneNumber,
      role: 'buyer',
      authMethods: ['email'],
    });

    await newBuyer.save();

    try {
      await sendEmailOtp(normalizedEmail, otp);
    } catch (OtpError) {
      console.error(
        'Failed to send buyer signup OTP:',
        normalizedEmail,
        OtpError.message,
      );
    }
    const token = jwt.sign(
      { id: newBuyer._id, role: newBuyer.role, email: newBuyer.email },
      process.env.JWT_SECRET,
      { expiresIn: '20h' },
    );

    return res.status(201).json({
      message: 'OTP sent to email. Please verify to complete registration.',
      buyer: {
        id: newBuyer._id,
        email: newBuyer.email,
      },
      token,
    });
  } catch (err) {
    console.error('Registration error:', err);
    res.status(500).json({ message: 'Server error:', err });
  }
};

exports.registerProvider = async (req, res) => {
  const { email, password, phoneNumber, fullName } = req.body;
  const normalizedPhoneNumber = normalizePhoneNumber(phoneNumber);

  try {
    const normalizedEmail = normalizeEmail(email);
    const existingProvider = await findUserByEmail(Provider, normalizedEmail);
    if (existingProvider) {
      if (!existingProvider.emailVerified) {
        const otp = accountHelper.generateOtp();
        const otpExpiresAt = new Date(Date.now() + 10 * 60 * 1000);
        existingProvider.otp = otp;
        existingProvider.otpExpiresAt = otpExpiresAt;
        await existingProvider.save();

        try {
          await sendEmailOtp(normalizedEmail, otp);
        } catch (OtpError) {
          console.error(
            'Failed to resend signup OTP:',
            normalizedEmail,
            OtpError.message,
          );
        }
        return res.status(200).json({
          message: 'Email not verified. OTP sent to email.',
        });
      }
      return res.status(400).json({ message: 'Email already in use' });
    }

    const existingEmailProfiles = await findEmailProfiles(normalizedEmail);
    if (existingEmailProfiles.some(({ role }) => role !== 'buyer')) {
      return res.status(400).json({
        message: 'Email already in use by an incompatible account type',
      });
    }

    if (normalizedPhoneNumber) {
      const existingPhone = await findUserByPhoneAcrossDb(
        normalizedPhoneNumber,
      );
      if (existingPhone) {
        return res.status(400).json({ message: 'Phone number already in use' });
      }
    }

    let hashedPassword = null;
    if (password) {
      hashedPassword = await passwordHelper.hash(password);
    }

    const otp = accountHelper.generateOtp();
    const otpExpiresAt = new Date(Date.now() + 10 * 60 * 1000); // expires in 10 mins

    const newProvider = new Provider({
      email: normalizedEmail,
      signupPlatform: getClientPlatform(req),
      password: hashedPassword,
      otp,
      otpExpiresAt,
      isVerified: false,
      fullName,
      phoneNumber: normalizedPhoneNumber || phoneNumber,
      role: 'provider',
      authMethods: ['email'],
      isOnline: false,
      availability: {
        isAvailable: false,
        lastUpdated: new Date(),
      },
    });

    await newProvider.save();

    try {
      await sendEmailOtp(normalizedEmail, otp);
    } catch (OtpError) {
      console.error(
        'Failed to send provider signup OTP:',
        normalizedEmail,
        OtpError.message,
      );
    }
    await notifyAdminTeam({
      event: 'account_created',
      accountType: 'provider',
      account: newProvider,
    });
    const token = jwt.sign(
      { id: newProvider._id, role: newProvider.role, email: newProvider.email },
      process.env.JWT_SECRET,
      { expiresIn: '20h' },
    );

    return res.status(201).json({
      message: 'OTP sent to email. Please verify to complete registration.',
      provider: {
        id: newProvider._id,
        email: newProvider.email,
      },
      token,
    });
  } catch (err) {
    console.error('Registration error:', err);
    res.status(500).json({ message: 'Server error:', err });
  }
};

exports.verifyEmail = async (req, res) => {
  const { otp } = req.body;
  try {
    let user = await Buyer.findOne({ otp: otp });
    let userType = 'buyer';

    if (!user) {
      user = await Provider.findOne({ otp: otp });
      userType = 'provider';
    }
    if (!user) {
      const BusinessOwner = roleModelMap.businessOwner;
      user = await BusinessOwner.findOne({ otp: otp });
      userType = 'businessOwner';
    }

    if (!user) {
      return res.status(400).json({ message: 'Invalid or expired OTP.' });
    }
    if (Date.now() > user.otpExpiresAt) {
      return res.status(400).json({ message: 'OTP has expired.' });
    }
    user.emailVerified = true;
    user.otp = null;
    user.otpExpiresAt = null;
    user.kycLevel = 1;
    accountHelper.addAuthMethod(user, 'email');

    await user.save();
    let welcomeEmailSent = true;
    try {
      const firstName = user.fullName
        ? user.fullName.trim().split(/\s+/)[0]
        : 'there';
      const baseUrl = process.env.FRONTEND_URL || '';
      await sendWelcomeEmail(user.email, {
        firstName,
        year: new Date().getFullYear(),
        appUrl: baseUrl,
        ctaText: 'Open SabiGuy',
        role: userType,
        // unsubscribeUrl: baseUrl ? `${baseUrl.replace(/\\/$/, "")}/unsubscribe` : "",
      });
    } catch (welcomeError) {
      console.error('Welcome email error:', welcomeError);
      welcomeEmailSent = false;
    }

    res.status(200).json({
      message: welcomeEmailSent
        ? `Email verified successfully as ${userType}.`
        : `Email verified successfully as ${userType}. Welcome email will be sent shortly.`,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Something went wrong.' });
  }
};

exports.resendOTP = async (req, res) => {
  const { email } = req.body;
  const normalizedEmail = normalizeEmail(email);

  try {
    const { user } = await findUserAcrossRoles(normalizedEmail, [
      'buyer',
      'provider',
      'businessOwner',
    ]);

    if (!user) {
      return res.status(404).json({
        message:
          "If an account exists for this email, you'll receive instructions shortly.",
      });
    }

    if (user.emailVerified) {
      return res.status(400).json({ message: 'Email already verified' });
    }

    const now = new Date();
    const lastSent = new Date(user.lastVerificationOtpSentAt);

    if (
      user.lastVerificationOtpSentAt &&
      now.getTime() - lastSent.getTime() < 60 * 1000
    ) {
      return res
        .status(429)
        .json({ message: 'Please wait before requesting another OTP' });
    }

    // Generate new OTP and expiration
    const otp = accountHelper.generateOtp();
    const otpExpiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    user.otp = otp;
    user.otpExpiresAt = otpExpiresAt;
    user.lastVerificationOtpSentAt = now;
    await user.save();

    try {
      await sendEmailOtp(normalizedEmail, otp);
    } catch (OtpError) {
      // Don't delete the user on resend failure — they already exist
      return res
        .status(500)
        .json({ message: 'Failed to send OTP. Please try again' });
    }
    return res.status(200).json({ message: 'OTP resent successfully' });
  } catch (err) {
    console.error('Resend OTP error:', err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

exports.login = async (req, res) => {
  const { email, password, role: requestedRole } = req.body || {};

  if (!email || !password) {
    return res.status(400).json({ message: 'Email and password are required' });
  }

  const normalizedEmail = normalizeEmail(email);
  const allowedRoles = authRoles;

  const findUserByRole = async (role) => {
    return findUserByRoleAndEmail(
      role,
      normalizedEmail,
      role === 'admin' ? { includePassword: true } : undefined,
    );
  };

  try {
    let user = null;
    let role = null;

    if (requestedRole) {
      if (!allowedRoles.includes(requestedRole)) {
        return res.status(400).json({ message: 'Invalid role' });
      }
      user = await findUserByRole(requestedRole);
      role = requestedRole;
    } else {
      user = await findUserByRole('buyer');
      role = 'buyer';

      if (!user) {
        user = await findUserByRole('provider');
        role = 'provider';
      }
      if (!user) {
        user = await findUserByRole('admin');
        role = 'admin';
      }
      if (!user) {
        user = await findUserByRole('businessOwner');
        role = 'businessOwner';
      }
    }

    if (!user) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    if (user.isDeleted) {
      return res.status(403).json({ message: 'Account deleted' });
    }

    if (user.isActive === false) {
      return res.status(403).json({ message: 'Account deactivated' });
    }

    if (!user.emailVerified) {
      return res
        .status(403)
        .json({ message: 'Please verify your email before logging in' });
    }

    if (user.isGoogleUser && !user.password) {
      return res.status(400).json({
        message:
          "This account was created with Google. Please log in with Google, or use 'Forgot Password' to set a password.",
        authMethod: 'google',
      });
    }

    const isMatch = await passwordHelper.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    const token = generateAccessToken(user);
    const refreshToken = generateRefreshToken(user);
    user.refreshToken = refreshToken;
    user.refreshTokenExpiresAt = getRefreshTokenExpiryDate(refreshToken);
    await user.save();

    res.json({
      message: 'Login successful',
      role,
      email: user.email,
      token,
      // accessToken: token,
      refreshToken,
      id: user._id,
      user: buildAuthUserPayload(user),
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Failed to login', error });
  }
};

exports.refreshAuthToken = async (req, res) => {
  const { refreshToken } = req.body;

  if (!refreshToken) {
    return res.status(400).json({
      success: false,
      message: 'refreshToken is required',
    });
  }

  try {
    const decoded = jwt.verify(refreshToken, REFRESH_TOKEN_SECRET);

    const Model = roleModelMap[decoded.role];
    const user = Model ? await Model.findById(decoded.id) : null;

    if (!user || user.refreshToken !== refreshToken) {
      return res.status(401).json({
        success: false,
        message: 'Invalid refresh token',
      });
    }

    if (
      user.refreshTokenExpiresAt &&
      new Date(user.refreshTokenExpiresAt).getTime() < Date.now()
    ) {
      return res.status(401).json({
        success: false,
        message: 'Refresh token expired',
      });
    }

    const token = generateAccessToken(user);

    return res.status(200).json({
      success: true,
      // accessToken: token,
      token,
    });
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: 'Refresh token expired or invalid',
      error: error.message,
    });
  }
};

exports.forgotPassword = async (req, res) => {
  const { email } = req.body;
  const normalizedEmail = normalizeEmail(email);

  try {
    const { user } = await findUserAcrossRoles(normalizedEmail, [
      'buyer',
      'provider',
      'businessOwner',
    ]);

    if (!user) {
      return res.status(200).json({
        message:
          "If an account exists for this email, you'll receive instructions shortly.",
      });
    }
    const otp = accountHelper.generateOtp();

    user.resetOtp = otp;
    user.resetOtpExpires = Date.now() + 10 * 60 * 1000; // 10 min
    await user.save();
    await forgotPasswordOtp(normalizedEmail, otp);

    res.status(201).json({ message: 'Forgot password otp sent to email' });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Failed to send OTP email' });
  }
};

exports.resendForgotPasswordOtp = async (req, res) => {
  const { email } = req.body;
  const normalizedEmail = normalizeEmail(email);

  if (!email) {
    return res.status(400).json({ message: 'Email is required' });
  }

  try {
    const { user } = await findUserAcrossRoles(normalizedEmail, [
      'buyer',
      'provider',
      'businessOwner',
    ]);

    if (!user) {
      return res.status(200).json({
        message:
          "If an account exists for this email, you'll receive instructions shortly.",
      });
    }

    const now = new Date();
    const lastSent = user.lastResetOtpSentAt
      ? new Date(user.lastResetOtpSentAt)
      : null;

    if (lastSent && now.getTime() - lastSent.getTime() < 60 * 1000) {
      return res
        .status(429)
        .json({ message: 'Please wait before requesting another OTP' });
    }

    const otp = accountHelper.generateOtp();

    user.resetOtp = otp;
    user.resetOtpExpires = Date.now() + 10 * 60 * 1000; // 10 min
    user.lastResetOtpSentAt = now;
    await user.save();

    await forgotPasswordOtp(normalizedEmail, otp);

    return res
      .status(200)
      .json({ message: 'Forgot password OTP resent to email' });
  } catch (error) {
    console.error('Resend forgot password OTP error:', error);
    return res.status(500).json({ message: 'Failed to send OTP email' });
  }
};

exports.verifyResetOtp = async (req, res) => {
  const { email, otp } = req.body;
  const normalizedEmail = normalizeEmail(email);

  try {
    const { user } = await findUserAcrossRoles(normalizedEmail, [
      'buyer',
      'provider',
      'businessOwner',
    ]);

    if (!user) {
      return res.status(400).json({
        message:
          "If an account exists for this email, you'll receive instructions shortly.",
      });
    }

    if (!otp || user.resetOtp !== otp || user.resetOtpExpires < Date.now()) {
      return res.status(400).json({ message: 'Invalid or expired OTP' });
    }

    return res.status(200).json({ message: 'OTP verified successfully' });
  } catch (error) {
    console.error('Verify reset OTP error:', error);
    return res
      .status(500)
      .json({ message: 'Server error', error: error.message });
  }
};

exports.resetPassword = async (req, res) => {
  const { email, otp, newPassword } = req.body;
  const normalizedEmail = normalizeEmail(email);

  //  const isValidPassword = /^(?=.*[A-Za-z])(?=.*\d)(?=.*[@$!%*#?&])[A-Za-z\d@$!%*#?&]{8,}$/.test(newPassword);
  // if (!isValidPassword) {
  //   return res.status(400).json({
  //     message:
  //       'Password must be at least 8 characters long and include a letter, number, and special character',
  //   });
  // }

  try {
    const { user } = await findUserAcrossRoles(normalizedEmail, [
      'buyer',
      'provider',
      'businessOwner',
    ]);

    if (!user) {
      return res.status(400).json({
        message:
          "If an account exists for this email, you'll receive instructions shortly.",
      });
    }
    if (user.resetOtp !== otp || user.resetOtpExpires < Date.now()) {
      return res.status(400).json({ message: 'Invalid or expired OTP' });
    }

    user.password = await passwordHelper.hash(newPassword);
    user.resetOtp = undefined;
    user.resetOtpExpires = undefined;
    accountHelper.addAuthMethod(user, 'email');
    await user.save();

    // Non-blocking notification — password is already changed
    const changedAt = accountHelper.formatChangedAt();
    await emailHelper.sendPasswordChangedSafe(
      passwordChangedEmail,
      user.email,
      {
        changedAt,
      },
    );

    res.json({ message: 'Password reset successful' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error:', err });
  }
};

exports.changePassword = async (req, res) => {
  try {
    const userId = req.user.id; // From auth middleware
    const { oldPassword, newPassword } = req.body;

    if (!newPassword) {
      return res.status(400).json({
        success: false,
        message: 'New password is required',
      });
    }
    const strongPassword = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])/;
    if (!strongPassword.test(newPassword)) {
      return res.status(400).json({
        success: false,
        message:
          'Password must contain uppercase, lowercase, number, and special character',
      });
    }
    // Minimum password strength check
    if (newPassword.length < 8) {
      return res.status(400).json({
        success: false,
        message: 'New password must be at least 8 characters long',
      });
    }

    // Find user
    const Model = roleModelMap[req.user.role];
    const user = Model
      ? await Model.findById(userId).select('+password')
      : null;

    if (!user) {
      return res.status(404).json({
        success: false,
        message:
          "If an account exists for this email, you'll receive instructions shortly.",
      });
    }

    // Google-only users setting their first password
    const isSettingFirstPassword = user.isGoogleUser && !user.password;

    if (isSettingFirstPassword) {
      // No old password required — they never had one
      if (oldPassword) {
        return res.status(400).json({
          success: false,
          message:
            'You are setting your first password. Do not send oldPassword.',
        });
      }
    } else {
      // Normal change: old password is required
      if (!oldPassword) {
        return res.status(400).json({
          success: false,
          message: 'Old password is required',
        });
      }

      const isMatch = await passwordHelper.compare(oldPassword, user.password);
      if (!isMatch) {
        return res.status(401).json({
          success: false,
          message: 'Old password is incorrect',
        });
      }
    }

    // Hash and save new password
    user.password = await passwordHelper.hash(newPassword);
    accountHelper.addAuthMethod(user, 'email');
    await user.save();

    try {
      const changedAt = accountHelper.formatChangedAt();
      await emailHelper.sendPasswordChangedSafe(
        passwordChangedEmail,
        user.email,
        {
          changedAt,
        },
      );
    } catch (emailError) {
      console.error('Password change email error:', emailError);
      return res.status(500).json({
        success: false,
        message: 'Password changed, but confirmation email failed to send',
      });
    }

    return res.status(200).json({
      success: true,
      message: isSettingFirstPassword
        ? 'Password set successfully. You can now log in with email and password.'
        : 'Password changed successfully',
    });
  } catch (error) {
    console.error('Change password error:', error);
    return res.status(500).json({
      success: false,
      message: 'Error changing password',
    });
  }
};

exports.confirmPassword = async (req, res) => {
  try {
    const { password } = req.body;
    if (!password) {
      return res.status(400).json({
        success: false,
        message: 'Password is required',
      });
    }

    const Model = roleModelMap[req.user.role];
    if (!Model) {
      return res.status(403).json({
        success: false,
        message: 'Password confirmation is not available for this account type',
      });
    }

    const user = await Model.findById(req.user.id).select('+password');
    if (!user) {
      return res.status(404).json({
        success: false,
        message:
          "If an account exists for this email, you'll receive instructions shortly.",
      });
    }

    if (!user.password) {
      return res.status(400).json({
        success: false,
        message: 'No password is set for this account',
      });
    }

    const isMatch = await passwordHelper.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: 'Password is incorrect',
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Password confirmed successfully',
    });
  } catch (error) {
    console.error('Confirm password error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to confirm password',
    });
  }
};

const getAuthenticatedUserForDeletion = async (req) => {
  const { id, role } = req.user || {};
  if (!id || !role) return null;

  const Model = roleModelMap[role];
  if (!Model) return null;

  return Model.findById(id);
};

exports.initiateAccountDeletion = async (req, res) => {
  try {
    const user = await getAuthenticatedUserForDeletion(req);

    if (!user) {
      return res.status(401).json({ message: 'Invalid token' });
    }

    if (user.isDeleted) {
      return res.status(400).json({ message: 'Account already deleted' });
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpExpiresAt = new Date(Date.now() + 10 * 60 * 1000);

    user.accountDeletionOtp = otp;
    user.accountDeletionOtpExpiresAt = otpExpiresAt;
    user.accountDeletionOtpVerified = false;
    await user.save();

    try {
      await sendAccountDeletionOtp(user.email, otp);
    } catch (emailError) {
      console.error('Account deletion OTP email error:', emailError);
      return res.status(500).json({
        message: 'Failed to send deletion OTP. Please try again.',
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Account deletion OTP sent to your email.',
    });
  } catch (error) {
    console.error('Initiate account deletion error:', error);
    return res.status(500).json({
      success: false,
      message: 'Error initiating account deletion',
      error: error.message,
    });
  }
};

exports.verifyAccountDeletionOtp = async (req, res) => {
  try {
    const user = await getAuthenticatedUserForDeletion(req);

    if (!user) {
      return res.status(401).json({ message: 'Invalid token' });
    }

    if (user.isDeleted) {
      return res.status(400).json({ message: 'Account already deleted' });
    }

    const { otp } = req.body || {};
    if (!otp) {
      return res.status(400).json({ message: 'OTP is required' });
    }

    if (
      !user.accountDeletionOtp ||
      user.accountDeletionOtp !== otp ||
      !user.accountDeletionOtpExpiresAt ||
      new Date(user.accountDeletionOtpExpiresAt).getTime() < Date.now()
    ) {
      return res.status(400).json({ message: 'Invalid or expired OTP' });
    }

    user.accountDeletionOtpVerified = true;
    await user.save();

    return res.status(200).json({
      success: true,
      message:
        'OTP verified successfully. You can now confirm account deletion.',
    });
  } catch (error) {
    console.error('Verify account deletion OTP error:', error);
    return res.status(500).json({
      success: false,
      message: 'Error verifying account deletion OTP',
      error: error.message,
    });
  }
};

exports.confirmAccountDeletion = async (req, res) => {
  try {
    const user = await getAuthenticatedUserForDeletion(req);

    if (!user) {
      return res.status(401).json({ message: 'Invalid token' });
    }

    if (user.isDeleted) {
      return res.status(400).json({ message: 'Account already deleted' });
    }

    if (!user.accountDeletionOtpVerified) {
      return res.status(400).json({
        message: 'Please verify the deletion OTP first.',
      });
    }

    const { otp } = req.body || {};
    if (!otp) {
      return res.status(400).json({ message: 'OTP is required' });
    }

    if (
      !user.accountDeletionOtp ||
      user.accountDeletionOtp !== otp ||
      !user.accountDeletionOtpExpiresAt ||
      new Date(user.accountDeletionOtpExpiresAt).getTime() < Date.now()
    ) {
      return res.status(400).json({ message: 'Invalid or expired OTP' });
    }

    const deletionUpdate = {
      $set: {
        isDeleted: true,
        deletedAt: new Date(),
        isActive: false,
        deactivatedAt: new Date(),
        refreshToken: null,
        refreshTokenExpiresAt: null,
        password: null,
        fcmToken: null,
        device: undefined,
        accountDeletionOtp: null,
        accountDeletionOtpExpiresAt: null,
        accountDeletionOtpVerified: false,
      },
      $unset: {
        email: '',
        phoneNumber: '',
      },
    };

    await user.constructor.updateOne({ _id: user._id }, deletionUpdate);

    return res.status(200).json({
      success: true,
      message: 'Account deleted successfully',
    });
  } catch (error) {
    console.error('Confirm account deletion error:', error);
    return res.status(500).json({
      success: false,
      message: 'Error confirming account deletion',
      error: error.message,
    });
  }
};

exports.me = async (req, res) => {
  try {
    const { id, role } = req.user || {};

    if (!id || !role) {
      return res.status(401).json({ message: 'Invalid token' });
    }

    const Model = roleModelMap[role];
    if (!Model) {
      return res.status(403).json({ message: 'Invalid role' });
    }

    const user = await Model.findById(id).select(
      '-password -otp -otpExpiresAt -resetOtp -resetOtpExpires -refreshToken',
    );

    if (!user) {
      return res.status(404).json({
        message:
          "If an account exists for this email, you'll receive instructions shortly.",
      });
    }

    let staffId = null;
    let staffCode = null;
    let staffMemberships = [];
    if (role === "provider") {
      const staffRecords = await Staff.find({ provider: user._id, status: "ACTIVE" })
        .select("staffCode business _id status role services canDoHomeService workStatus onDuty clockRequest acceptedAt")
        .lean();
      staffId = staffRecords.length ? staffRecords[0]._id : null;
      staffCode = staffRecords.length ? staffRecords[0].staffCode : null;
      staffMemberships = staffRecords;
    }

    const userData = user.toObject ? user.toObject() : { ...user };
    userData.staffId = staffId;
    userData.staffCode = staffCode;
    userData.staffMemberships = staffMemberships;

    return res.status(200).json({
      success: true,
      data: {
        id: user._id,
        role,
        email: user.email,
        fullName: user.fullName,
        phoneNumber: user.phoneNumber,
        profilePicture: user.profilePicture,
        emailVerified: user.emailVerified,
        staffId,
        staffCode,
        staffMemberships,
        user: userData,
      },
    });
  } catch (error) {
    console.error('Auth me error:', error);
    return res.status(500).json({
      success: false,
      message: 'Error fetching profile',
      error: error.message,
    });
  }
};

const switchableRoles = ['buyer', 'provider', 'businessOwner'];
const normalizeSwitchRole = (role) => (role === 'business' ? 'businessOwner' : role);

const profileSummary = (profile, role) => ({
  profileId: profile._id,
  role,
  email: profile.email,
  fullName: profile.fullName,
  profilePicture: profile.profilePicture || null,
});

exports.getProfiles = async (req, res) => {
  try {
    const { id, role } = req.user || {};
    if (!switchableRoles.includes(role)) {
      return res.status(403).json({
        success: false,
        message: 'This account cannot switch profiles',
      });
    }

    const link = await AccountLink.findOne({
      profiles: { $elemMatch: { role, profileId: id } },
    });
    const entries = link?.profiles?.length
      ? link.profiles
      : [{ role, profileId: id }];
    const profiles = await Promise.all(
      entries.map(async (entry) => {
        const Model = roleModelMap[entry.role];
        if (!Model) return null;
        const profile = await Model.findById(entry.profileId).select(
          'email fullName profilePicture isActive isDeleted',
        );
        if (!profile || profile.isDeleted || profile.isActive === false)
          return null;
        return profileSummary(profile, entry.role);
      }),
    );

    return res.status(200).json({
      success: true,
      profiles: profiles.filter(Boolean),
      activeProfile: { profileId: id, role },
    });
  } catch (error) {
    console.error('Get linked profiles error:', error);
    return res
      .status(500)
      .json({ success: false, message: 'Failed to fetch linked profiles' });
  }
};

exports.switchProfile = async (req, res) => {
  try {
    const { id: currentId, role: requestRole } = req.user || {};
    const { targetRole: requestedTargetRole, targetProfileId, targetPassword } = req.body || {};
    const currentRole = normalizeSwitchRole(requestRole);
    const targetRole = normalizeSwitchRole(requestedTargetRole);
    if (
      !switchableRoles.includes(currentRole) ||
      !switchableRoles.includes(targetRole)
    ) {
      return res
        .status(400)
        .json({ success: false, message: 'Unsupported profile role' });
    }
    if (
      !targetProfileId ||
      (String(targetProfileId) === String(currentId) &&
        targetRole === currentRole)
    ) {
      return res.status(400).json({
        success: false,
        message: 'A different target profile is required',
      });
    }

    const sourceLink = await AccountLink.findOne({
      profiles: { $elemMatch: { role: currentRole, profileId: currentId } },
    });
    const isAlreadyLinked = Boolean(
      sourceLink?.profiles?.some(
        (entry) =>
          entry.role === targetRole &&
          String(entry.profileId) === String(targetProfileId),
      ),
    );

    const TargetModel = roleModelMap[targetRole];
    const target =
      await TargetModel.findById(targetProfileId).select('+password');
    if (!target || target.isDeleted || target.isActive === false) {
      return res.status(404).json({
        success: false,
        message: 'Target profile not found or inactive',
      });
    }

    if (!isAlreadyLinked) {
      let targetCredentialVerified = Boolean(
        targetPassword &&
        target.password &&
        (await passwordHelper.compare(targetPassword, target.password)),
      );
      if (
        !targetCredentialVerified &&
        target.isGoogleUser &&
        target.googleId &&
        req.body?.targetGoogleToken
      ) {
        try {
          const googleIdentity = await googleHelper.verifyToken(
            req.body.targetGoogleToken,
          );
          targetCredentialVerified =
            normalizeEmail(googleIdentity.email) ===
              normalizeEmail(target.email) &&
            googleIdentity.googleId === target.googleId;
        } catch (_error) {
          targetCredentialVerified = false;
        }
      }
      if (!targetCredentialVerified) {
        return res.status(401).json({
          success: false,
          message:
            'Valid target profile credentials are required to link this profile',
        });
      }
      const targetLink = await AccountLink.findOne({
        profiles: { $elemMatch: { role: targetRole, profileId: target._id } },
      });
      if ((sourceLink && sourceLink !== targetLink) || targetLink) {
        return res.status(409).json({
          success: false,
          message:
            'One of these profiles is already linked to another account group',
        });
      }

      const sourceEntry = { role: currentRole, profileId: currentId };
      const targetEntry = { role: targetRole, profileId: target._id };
      if (sourceLink) {
        sourceLink.profiles.push(targetEntry);
        await sourceLink.save();
      } else {
        await AccountLink.create({ profiles: [sourceEntry, targetEntry] });
      }
    }

    const refreshToken = generateRefreshToken(target);
    target.refreshToken = refreshToken;
    target.refreshTokenExpiresAt = getRefreshTokenExpiryDate(refreshToken);
    await target.save();

    return res.status(200).json({
      success: true,
      message: 'Profile switched successfully',
      token: generateAccessToken(target),
      refreshToken,
      user: buildAuthUserPayload(target),
      activeProfile: profileSummary(target, targetRole),
    });
  } catch (error) {
    console.error('Switch profile error:', error);
    return res
      .status(500)
      .json({ success: false, message: 'Failed to switch profile' });
  }
};

exports.switchToBuyer = async (req, res) => {
  try {
    const { id: sourceId, role: sourceRole } = req.user || {};
    if (!['provider', 'businessOwner'].includes(sourceRole)) {
      return res.status(403).json({
        success: false,
        message: 'Only provider and business profiles can switch to buyer',
      });
    }

    const SourceModel = roleModelMap[sourceRole];
    const source = await SourceModel.findById(sourceId).select('+password');
    if (!source || source.isDeleted || source.isActive === false) {
      return res.status(404).json({
        success: false,
        message: 'Source profile not found or inactive',
      });
    }
    if (!source.email || !source.emailVerified) {
      return res.status(403).json({
        success: false,
        message: 'Verify your email before creating a buyer profile',
      });
    }

    const sourceLink = await AccountLink.findOne({
      profiles: { $elemMatch: { role: sourceRole, profileId: source._id } },
    });
    const linkedBuyerEntry = sourceLink?.profiles?.find(
      (entry) => entry.role === 'buyer',
    );
    let buyer = linkedBuyerEntry
      ? await Buyer.findById(linkedBuyerEntry.profileId).select('+password')
      : null;
    let buyerProfileCreated = false;

    if (!buyer) {
      if (linkedBuyerEntry && sourceLink) {
        sourceLink.profiles = sourceLink.profiles.filter(
          (entry) =>
            !(
              entry.role === 'buyer' &&
              String(entry.profileId) === String(linkedBuyerEntry.profileId)
            ),
        );
      }
      const existingBuyer = await Buyer.findOne({
        email: normalizeEmail(source.email),
      }).select('+password');
      if (existingBuyer) {
        return res.status(409).json({
          success: false,
          message:
            'A buyer profile already exists for this email. Verify that profile with /auth/switch-profile before switching.',
          buyerProfileId: existingBuyer._id,
        });
      }

      if (source.phoneNumber) {
        const existingPhone = await Buyer.findOne({
          phoneNumber: source.phoneNumber,
        });
        if (existingPhone) {
          return res.status(409).json({
            success: false,
            message:
              'This phone number is already used by another buyer profile',
          });
        }
      }

      buyer = new Buyer({
        email: normalizeEmail(source.email),
        password: source.password || null,
        fullName: source.fullName || source.BusinessName || '',
        profilePicture: source.profilePicture || null,
        phoneNumber: source.phoneNumber || undefined,
        city: source.city || source.cityOfOperation || '',
        address: source.address || source.BusinessAddress || '',
        emailVerified: true,
        isGoogleUser: Boolean(source.isGoogleUser),
        googleId: source.googleId || undefined,
        authMethods: Array.isArray(source.authMethods)
          ? [...source.authMethods]
          : [],
        role: 'buyer',
      });
      await buyer.save();
      buyerProfileCreated = true;

      const targetEntry = { role: 'buyer', profileId: buyer._id };
      try {
        if (sourceLink) {
          sourceLink.profiles.push(targetEntry);
          await sourceLink.save();
        } else {
          await AccountLink.create({
            profiles: [
              { role: sourceRole, profileId: source._id },
              targetEntry,
            ],
          });
        }
      } catch (linkError) {
        await Buyer.deleteOne({ _id: buyer._id });
        throw linkError;
      }
    }

    const refreshToken = generateRefreshToken(buyer);
    buyer.refreshToken = refreshToken;
    buyer.refreshTokenExpiresAt = getRefreshTokenExpiryDate(refreshToken);
    await buyer.save();

    return res.status(200).json({
      success: true,
      message: 'Switched to buyer profile',
      token: generateAccessToken(buyer),
      refreshToken,
      user: buildAuthUserPayload(buyer),
      activeProfile: profileSummary(buyer, 'buyer'),
      buyerProfileCreated,
    });
  } catch (error) {
    console.error('Switch to buyer error:', error);
    return res
      .status(500)
      .json({ success: false, message: 'Failed to switch to buyer profile' });
  }
};
