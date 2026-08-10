const { OAuth2Client } = require("google-auth-library");
const dotenv = require("dotenv");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const axios = require("axios");
const Provider = require("../../../models/ServiceProvider");
const Buyer = require("../../../models/ServiceUser");
const Admin = require("../admin/Admin.model");
const authService = require("./auth.service");

dotenv.config();
const {
  sendEmailOtp,
  forgotPasswordOtp,
  passwordChangedEmail,
  sendWelcomeEmail,
  sendAccountDeletionOtp,
} = require("../../config/emailVerification");
const {
  findUserByEmailAcrossDb,
  findUserByPhoneAcrossDb,
  normalizePhoneNumber,
} = require("../../services/identity.service");

const {
  AppError,
  googleHelper,
  passwordHelper,
  emailHelper,
  accountHelper,
} = require("../../shared/utils/auth.helpers");

const roleModelMap = authService.roleModelMap;
const normalizeEmail = authService.normalizeEmail;
const findUserByEmail = authService.findUserByEmail;
const generateAccessToken = authService.generateAccessToken;
const generateRefreshToken = authService.generateRefreshToken;
const getRefreshTokenExpiryDate = authService.getRefreshTokenExpiryDate;
const buildAuthUserPayload = authService.buildAuthUserPayload;
const { passwordMatches } = authService;

exports.googleSignUp = async (req, res) => {
  const { token } = req.body;

  if (!token) {
    return res.status(400).json({ message: "Token is required" });
  }

  try {
    const { email, googleId, name, picture } =
      await googleHelper.verifyToken(token);
    const normalizedEmail = normalizeEmail(email);

    // Check if email already exists
    const existingEmail = await findUserByEmailAcrossDb(normalizedEmail);

    if (existingEmail) {
      if (existingEmail.role === "provider") {
        const user = existingEmail.user;
        let message = "Account successfully linked and logged in.";

        // If not verified, this implicitly verifies them
        if (!user.emailVerified) {
          message = "Email verified and account linked successfully.";
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
          if (!welcomeSent) message += " (Welcome email will be sent shortly)";
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
      return res
        .status(400)
        .json({ message: "Email already in use by another role" });
    }

    // Create new provider
    const newUser = new Provider({
      email: normalizedEmail,
      fullName: name,
      password: null,
      otp: null,
      otpExpiresAt: null,
      emailVerified: true,
      isGoogleUser: true,
      googleId,
      profilePicture: picture,
      role: "provider",
      kycLevel: 1,
    });

    accountHelper.addAuthMethod(newUser, "google");
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
        ? "Signup successful! Welcome email sent."
        : "Signup successful! Welcome email will be sent shortly.",
      token: jwtToken,
      refreshToken,
      user: buildAuthUserPayload(newUser),
      newUser: true,
    });
  } catch (err) {
    console.error("Google signup failed:", err);
    res
      .status(401)
      .json({ message: "Google signup failed", error: err.message });
  }
};

exports.googleSignUpBuyer = async (req, res) => {
  const { token } = req.body;

  if (!token) {
    return res.status(400).json({ message: "Token is required" });
  }

  try {
    const { email, googleId, name, picture } =
      await googleHelper.verifyToken(token);
    const normalizedEmail = normalizeEmail(email);

    const existingEmail = await findUserByEmailAcrossDb(normalizedEmail);

    if (existingEmail) {
      if (existingEmail.role === "buyer") {
        const user = existingEmail.user;
        let message = "Account successfully linked and logged in.";

        if (!user.emailVerified) {
          message = "Email verified and account linked successfully.";
        }

        accountHelper.linkGoogleAccount(user, googleId);
        await user.save();

        if (!user.emailVerified) {
          const welcomeSent = await emailHelper.sendWelcomeSafe(user.email, {
            firstName: accountHelper.getFirstName(user.fullName),
            role: user.role,
          });
          if (!welcomeSent) message += " (Welcome email will be sent shortly)";
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
      return res
        .status(400)
        .json({ message: "Email already in use by another role" });
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
      role: "buyer",
    });

    accountHelper.addAuthMethod(newUser, "google");
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
        ? "Signup successful! Welcome email sent."
        : "Signup successful! Welcome email will be sent shortly.",
      token: jwtToken,
      refreshToken,
      user: buildAuthUserPayload(newUser),
      newUser: true,
    });
  } catch (err) {
    console.error("Google signup failed:", err);
    res
      .status(401)
      .json({ message: "Google signup failed", error: err.message });
  }
};

exports.googleLogIn = async (req, res) => {
  const { token } = req.body;

  if (!token) {
    return res.status(400).json({ message: "Token is required" });
  }

  try {
    const { email, googleId } = await googleHelper.verifyToken(token);
    const normalizedEmail = normalizeEmail(email);

    let user = await findUserByEmail(Provider, normalizedEmail);
    if (!user) {
      user = await findUserByEmail(Buyer, normalizedEmail);
    }

    if (!user) {
      return res
        .status(400)
        .json({ message: "Account not found. Please sign up" });
    }

    if (user.isDeleted) {
      return res.status(403).json({ message: "Account deleted" });
    }

    if (user.isActive === false) {
      return res.status(403).json({ message: "Account deactivated" });
    }

    // Hybrid magic: If they exist but aren't a Google user, link them
    if (!user.isGoogleUser) {
      accountHelper.linkGoogleAccount(user, googleId);
    } else if (user.googleId && user.googleId !== googleId) {
      return res.status(401).json({
        message:
          "Google account mismatch. Please use the correct Google account.",
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
      message: "Login successful",
      token: jwtToken,
      refreshToken,
      user: buildAuthUserPayload(user),
    });
  } catch (err) {
    console.error("Google login failed:", err);
    res
      .status(401)
      .json({ message: "Google login failed", error: err.message });
  }
};
exports.registerBuyer = async (req, res) => {
  const { email, password, phoneNumber, city, fullName } = req.body;
  const normalizedEmail = normalizeEmail(email);
  const normalizedPhoneNumber = normalizePhoneNumber(phoneNumber);

  // const isValidPassword = /^(?=.*[A-Za-z])(?=.*\d)(?=.*[@$!%*#?&])[A-Za-z\d@$!%*#?&]{8,}$/.test(password);
  // if (!isValidPassword) {
  //   return res.status(400).json({
  //     message:
  //       'Password must be at least 8 characters long and include a letter, number, and special character',
  //   });
  // }
  try {
    const existingEmail = await findUserByEmailAcrossDb(normalizedEmail);
    if (existingEmail) {
      if (existingEmail.role === "buyer" && !existingEmail.user.emailVerified) {
        const otp = accountHelper.generateOtp();
        const otpExpiresAt = new Date(Date.now() + 10 * 60 * 1000);
        existingEmail.user.otp = otp;
        existingEmail.user.otpExpiresAt = otpExpiresAt;
        await existingEmail.user.save();

        await sendEmailOtp(normalizedEmail, otp);
        return res.status(200).json({
          message: "Email not verified. OTP sent to email.",
        });
      }
      return res.status(400).json({ message: "Email already in use" });
    }

    if (normalizedPhoneNumber) {
      const existingPhone = await findUserByPhoneAcrossDb(
        normalizedPhoneNumber,
      );
      if (existingPhone) {
        return res.status(400).json({ message: "Phone number already in use" });
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
      role: "buyer",
      authMethods: ["email"],
    });

    await newBuyer.save();

    try {
      await sendEmailOtp(normalizedEmail, otp);
    } catch (OtpError) {
      await Buyer.findByIdAndDelete(newBuyer._id);
      return res
        .status(500)
        .json({ message: "Failed to send otp, please try again" });
    }

    const token = jwt.sign(
      { id: newBuyer._id, role: newBuyer.role, email: newBuyer.email },
      process.env.JWT_SECRET,
      { expiresIn: "20h" },
    );

    return res.status(201).json({
      message: "OTP sent to email. Please verify to complete registration.",
      buyer: {
        id: newBuyer._id,
        email: newBuyer.email,
      },
      token,
    });
  } catch (err) {
    console.error("Registration error:", err);
    res.status(500).json({ message: "Server error:", err });
  }
};

exports.registerProvider = async (req, res) => {
  const { email, password, phoneNumber, fullName } = req.body;
  const normalizedPhoneNumber = normalizePhoneNumber(phoneNumber);

  // const isValidPassword = /^(?=.*[A-Za-z])(?=.*\d)(?=.*[@$!%*#?&])[A-Za-z\d@$!%*#?&]{8,}$/.test(password);
  // if (!isValidPassword) {
  //   return res.status(400).json({
  //     message:
  //       'Password must be at least 8 characters long and include a letter, number, and special character',
  //   });
  // }
  try {
    const normalizedEmail = normalizeEmail(email);
    const existingEmail = await findUserByEmailAcrossDb(normalizedEmail);
    if (existingEmail) {
      if (
        existingEmail.role === "provider" &&
        !existingEmail.user.emailVerified
      ) {
        const otp = accountHelper.generateOtp();
        const otpExpiresAt = new Date(Date.now() + 10 * 60 * 1000);
        existingEmail.user.otp = otp;
        existingEmail.user.otpExpiresAt = otpExpiresAt;
        await existingEmail.user.save();

        await sendEmailOtp(normalizedEmail, otp);
        return res.status(200).json({
          message: "Email not verified. OTP sent to email.",
        });
      }
      return res.status(400).json({ message: "Email already in use" });
    }

    if (normalizedPhoneNumber) {
      const existingPhone = await findUserByPhoneAcrossDb(
        normalizedPhoneNumber,
      );
      if (existingPhone) {
        return res.status(400).json({ message: "Phone number already in use" });
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
      password: hashedPassword,
      otp,
      otpExpiresAt,
      isVerified: false,
      fullName,
      phoneNumber: normalizedPhoneNumber || phoneNumber,
      role: "provider",
      authMethods: ["email"],
    });

    await newProvider.save();

    try {
      await sendEmailOtp(normalizedEmail, otp);
    } catch (OtpError) {
      await Provider.findByIdAndDelete(newProvider._id);
      return res
        .status(500)
        .json({ message: "Failed to send otp, please try again" });
    }
    const token = jwt.sign(
      { id: newProvider._id, role: newProvider.role, email: newProvider.email },
      process.env.JWT_SECRET,
      { expiresIn: "20h" },
    );

    return res.status(201).json({
      message: "OTP sent to email. Please verify to complete registration.",
      provider: {
        id: newProvider._id,
        email: newProvider.email,
      },
      token,
    });
  } catch (err) {
    console.error("Registration error:", err);
    res.status(500).json({ message: "Server error:", err });
  }
};

exports.verifyEmail = async (req, res) => {
  const { otp } = req.body;
  try {
    let user = await Buyer.findOne({ otp: otp });
    let userType = "buyer";

    if (!user) {
      user = await Provider.findOne({ otp: otp });
      userType = "provider";
    }

    if (!user) {
      return res.status(400).json({ message: "Invalid or expired OTP." });
    }
    if (Date.now() > user.otpExpiresAt) {
      return res.status(400).json({ message: "OTP has expired." });
    }
    user.emailVerified = true;
    user.otp = null;
    user.otpExpiresAt = null;
    user.kycLevel = 1;
    accountHelper.addAuthMethod(user, "email");

    await user.save();

    let welcomeEmailSent = true;
    try {
      const firstName = user.fullName
        ? user.fullName.trim().split(/\s+/)[0]
        : "there";
      const baseUrl = process.env.FRONTEND_URL || "";
      await sendWelcomeEmail(user.email, {
        firstName,
        year: new Date().getFullYear(),
        appUrl: baseUrl,
        ctaText: "Open SabiGuy",
        role: userType,
        // unsubscribeUrl: baseUrl ? `${baseUrl.replace(/\\/$/, "")}/unsubscribe` : "",
      });
    } catch (welcomeError) {
      console.error("Welcome email error:", welcomeError);
      welcomeEmailSent = false;
    }

    res.status(200).json({
      message: welcomeEmailSent
        ? `Email verified successfully as ${userType}.`
        : `Email verified successfully as ${userType}. Welcome email will be sent shortly.`,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Something went wrong." });
  }
};

exports.resendOTP = async (req, res) => {
  const { email } = req.body;
  const normalizedEmail = normalizeEmail(email);

  try {
    let user = await findUserByEmail(Buyer, normalizedEmail);
    let role = "buyer";

    if (!user) {
      user = await findUserByEmail(Provider, normalizedEmail);
      role = "provider";
    }

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (user.emailVerified) {
      return res.status(400).json({ message: "Email already verified" });
    }

    const now = new Date();
    const lastSent = new Date(user.lastVerificationOtpSentAt);

    if (
      user.lastVerificationOtpSentAt &&
      now.getTime() - lastSent.getTime() < 60 * 1000
    ) {
      return res
        .status(429)
        .json({ message: "Please wait before requesting another OTP" });
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
        .json({ message: "Failed to send OTP. Please try again" });
    }
    return res.status(200).json({ message: "OTP resent successfully" });
  } catch (err) {
    console.error("Resend OTP error:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

exports.login = async (req, res) => {
  const { email, password, role: requestedRole } = req.body || {};

  if (!email || !password) {
    return res.status(400).json({ message: "Email and password are required" });
  }

  const normalizedEmail = normalizeEmail(email);
  const allowedRoles = ["buyer", "provider", "admin"];

  const findUserByRole = async (role) => {
    const Model = roleModelMap[role];
    if (!Model) return null;
    if (role === "admin") {
      return findUserByEmail(Model, normalizedEmail, { includePassword: true });
    }
    return findUserByEmail(Model, normalizedEmail);
  };

  try {
    let user = null;
    let role = null;

    if (requestedRole) {
      if (!allowedRoles.includes(requestedRole)) {
        return res.status(400).json({ message: "Invalid role" });
      }
      user = await findUserByRole(requestedRole);
      role = requestedRole;
    } else {
      user = await findUserByRole("buyer");
      role = "buyer";

      if (!user) {
        user = await findUserByRole("provider");
        role = "provider";
      }
      if (!user) {
        user = await findUserByRole("admin");
        role = "admin";
      }
    }

    if (!user) {
      return res.status(400).json({ message: "Invalid credentials" });
    }

    if (user.isDeleted) {
      return res.status(403).json({ message: "Account deleted" });
    }

    if (user.isActive === false) {
      return res.status(403).json({ message: "Account deactivated" });
    }

    if (!user.emailVerified) {
      return res
        .status(403)
        .json({ message: "Please verify your email before logging in" });
    }

    if (user.isGoogleUser && !user.password) {
      return res.status(400).json({
        message:
          "This account was created with Google. Please log in with Google, or use 'Forgot Password' to set a password.",
        authMethod: "google",
      });
    }

    const isMatch = await passwordHelper.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: "Invalid credentials" });
    }

    const token = generateAccessToken(user);
    const refreshToken = generateRefreshToken(user);
    user.refreshToken = refreshToken;
    user.refreshTokenExpiresAt = getRefreshTokenExpiryDate(refreshToken);
    await user.save();

    res.json({
      message: "Login successful",
      role,
      email: user.email,
      token,
      // accessToken: token,
      refreshToken,
      id: user._id,
      user: buildAuthUserPayload(user),
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ message: "Failed to login", error });
  }
};

exports.refreshAuthToken = async (req, res) => {
  const { refreshToken } = req.body;

  if (!refreshToken) {
    return res.status(400).json({
      success: false,
      message: "refreshToken is required",
    });
  }

  try {
    const decoded = jwt.verify(refreshToken, REFRESH_TOKEN_SECRET);

    let user = await Buyer.findById(decoded.id);
    if (!user) {
      user = await Provider.findById(decoded.id);
    }

    if (!user || user.refreshToken !== refreshToken) {
      return res.status(401).json({
        success: false,
        message: "Invalid refresh token",
      });
    }

    if (
      user.refreshTokenExpiresAt &&
      new Date(user.refreshTokenExpiresAt).getTime() < Date.now()
    ) {
      return res.status(401).json({
        success: false,
        message: "Refresh token expired",
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
      message: "Refresh token expired or invalid",
      error: error.message,
    });
  }
};

exports.forgotPassword = async (req, res) => {
  const { email } = req.body;
  const normalizedEmail = normalizeEmail(email);

  try {
    let user = await findUserByEmail(Buyer, normalizedEmail);
    let role = "buyer";

    if (!user) {
      user = await findUserByEmail(Provider, normalizedEmail);
      role = "provider";
    }

    if (!user) {
      return res
        .status(400)
        .json({ message: "User not found, please check the email" });
    }
    const otp = accountHelper.generateOtp();

    user.resetOtp = otp;
    user.resetOtpExpires = Date.now() + 10 * 60 * 1000; // 10 min
    await user.save();
    await forgotPasswordOtp(normalizedEmail, otp);

    res.status(201).json({ message: "Forgot password otp sent to email" });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Failed to send OTP email" });
  }
};

exports.resendForgotPasswordOtp = async (req, res) => {
  const { email } = req.body;
  const normalizedEmail = normalizeEmail(email);

  if (!email) {
    return res.status(400).json({ message: "Email is required" });
  }

  try {
    let user = await findUserByEmail(Buyer, normalizedEmail);

    if (!user) {
      user = await findUserByEmail(Provider, normalizedEmail);
    }

    if (!user) {
      return res
        .status(400)
        .json({ message: "User not found, please check the email" });
    }

    const now = new Date();
    const lastSent = user.lastResetOtpSentAt
      ? new Date(user.lastResetOtpSentAt)
      : null;

    if (lastSent && now.getTime() - lastSent.getTime() < 60 * 1000) {
      return res
        .status(429)
        .json({ message: "Please wait before requesting another OTP" });
    }

    const otp = accountHelper.generateOtp();

    user.resetOtp = otp;
    user.resetOtpExpires = Date.now() + 10 * 60 * 1000; // 10 min
    user.lastResetOtpSentAt = now;
    await user.save();

    await forgotPasswordOtp(normalizedEmail, otp);

    return res
      .status(200)
      .json({ message: "Forgot password OTP resent to email" });
  } catch (error) {
    console.error("Resend forgot password OTP error:", error);
    return res.status(500).json({ message: "Failed to send OTP email" });
  }
};

exports.verifyResetOtp = async (req, res) => {
  const { email, otp } = req.body;
  const normalizedEmail = normalizeEmail(email);

  try {
    let user = await findUserByEmail(Buyer, normalizedEmail);
    if (!user) {
      user = await findUserByEmail(Provider, normalizedEmail);
    }

    if (!user) {
      return res
        .status(400)
        .json({ message: "User not found, please check the email" });
    }

    if (!otp || user.resetOtp !== otp || user.resetOtpExpires < Date.now()) {
      return res.status(400).json({ message: "Invalid or expired OTP" });
    }

    return res.status(200).json({ message: "OTP verified successfully" });
  } catch (error) {
    console.error("Verify reset OTP error:", error);
    return res
      .status(500)
      .json({ message: "Server error", error: error.message });
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
    let user = await findUserByEmail(Buyer, normalizedEmail);
    let role = "buyer";

    if (!user) {
      user = await findUserByEmail(Provider, normalizedEmail);
      role = "provider";
    }

    if (!user) {
      return res
        .status(400)
        .json({ message: "User not found, please check the email" });
    }
    if (user.resetOtp !== otp || user.resetOtpExpires < Date.now()) {
      return res.status(400).json({ message: "Invalid or expired OTP" });
    }

    user.password = await passwordHelper.hash(newPassword);
    user.resetOtp = undefined;
    user.resetOtpExpires = undefined;
    accountHelper.addAuthMethod(user, "email");
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

    res.json({ message: "Password reset successful" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error:", err });
  }
};

exports.changePassword = async (req, res) => {
  try {
    const userId = req.user.id; // From auth middleware
    const { oldPassword, newPassword } = req.body;

    if (!newPassword) {
      return res.status(400).json({
        success: false,
        message: "New password is required",
      });
    }
    const strongPassword = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])/;
    if (!strongPassword.test(newPassword)) {
      return res.status(400).json({
        success: false,
        message:
          "Password must contain uppercase, lowercase, number, and special character",
      });
    }
    // Minimum password strength check
    if (newPassword.length < 8) {
      return res.status(400).json({
        success: false,
        message: "New password must be at least 8 characters long",
      });
    }

    // Find user
    let user = await Buyer.findById(userId).select("+password");

    if (!user) {
      user = await Provider.findById(userId).select("+password");
    }

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
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
            "You are setting your first password. Do not send oldPassword.",
        });
      }
    } else {
      // Normal change: old password is required
      if (!oldPassword) {
        return res.status(400).json({
          success: false,
          message: "Old password is required",
        });
      }

      const isMatch = await passwordHelper.compare(oldPassword, user.password);
      if (!isMatch) {
        return res.status(401).json({
          success: false,
          message: "Old password is incorrect",
        });
      }
    }

    // Hash and save new password
    user.password = await passwordHelper.hash(newPassword);
    accountHelper.addAuthMethod(user, "email");
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
      console.error("Password change email error:", emailError);
      return res.status(500).json({
        success: false,
        message: "Password changed, but confirmation email failed to send",
      });
    }

    return res.status(200).json({
      success: true,
      message: isSettingFirstPassword
        ? "Password set successfully. You can now log in with email and password."
        : "Password changed successfully",
    });
  } catch (error) {
    console.error("Change password error:", error);
    return res.status(500).json({
      success: false,
      message: "Error changing password",
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
      return res.status(401).json({ message: "Invalid token" });
    }

    if (user.isDeleted) {
      return res.status(400).json({ message: "Account already deleted" });
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
      console.error("Account deletion OTP email error:", emailError);
      return res.status(500).json({
        message: "Failed to send deletion OTP. Please try again.",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Account deletion OTP sent to your email.",
    });
  } catch (error) {
    console.error("Initiate account deletion error:", error);
    return res.status(500).json({
      success: false,
      message: "Error initiating account deletion",
      error: error.message,
    });
  }
};

exports.verifyAccountDeletionOtp = async (req, res) => {
  try {
    const user = await getAuthenticatedUserForDeletion(req);

    if (!user) {
      return res.status(401).json({ message: "Invalid token" });
    }

    if (user.isDeleted) {
      return res.status(400).json({ message: "Account already deleted" });
    }

    const { otp } = req.body || {};
    if (!otp) {
      return res.status(400).json({ message: "OTP is required" });
    }

    if (
      !user.accountDeletionOtp ||
      user.accountDeletionOtp !== otp ||
      !user.accountDeletionOtpExpiresAt ||
      new Date(user.accountDeletionOtpExpiresAt).getTime() < Date.now()
    ) {
      return res.status(400).json({ message: "Invalid or expired OTP" });
    }

    user.accountDeletionOtpVerified = true;
    await user.save();

    return res.status(200).json({
      success: true,
      message:
        "OTP verified successfully. You can now confirm account deletion.",
    });
  } catch (error) {
    console.error("Verify account deletion OTP error:", error);
    return res.status(500).json({
      success: false,
      message: "Error verifying account deletion OTP",
      error: error.message,
    });
  }
};

exports.confirmAccountDeletion = async (req, res) => {
  try {
    const user = await getAuthenticatedUserForDeletion(req);

    if (!user) {
      return res.status(401).json({ message: "Invalid token" });
    }

    if (user.isDeleted) {
      return res.status(400).json({ message: "Account already deleted" });
    }

    if (!user.accountDeletionOtpVerified) {
      return res.status(400).json({
        message: "Please verify the deletion OTP first.",
      });
    }

    const { otp } = req.body || {};
    if (!otp) {
      return res.status(400).json({ message: "OTP is required" });
    }

    if (
      !user.accountDeletionOtp ||
      user.accountDeletionOtp !== otp ||
      !user.accountDeletionOtpExpiresAt ||
      new Date(user.accountDeletionOtpExpiresAt).getTime() < Date.now()
    ) {
      return res.status(400).json({ message: "Invalid or expired OTP" });
    }

    user.isDeleted = true;
    user.deletedAt = new Date();
    user.isActive = false;
    user.deactivatedAt = new Date();
    user.refreshToken = undefined;
    user.refreshTokenExpiresAt = undefined;
    user.password = undefined;
    user.unset("email");
    user.unset("phoneNumber");
    user.fcmToken = undefined;
    user.device = undefined;
    user.accountDeletionOtp = undefined;
    user.accountDeletionOtpExpiresAt = undefined;
    user.accountDeletionOtpVerified = false;

    await user.save();

    return res.status(200).json({
      success: true,
      message: "Account deleted successfully",
    });
  } catch (error) {
    console.error("Confirm account deletion error:", error);
    return res.status(500).json({
      success: false,
      message: "Error confirming account deletion",
      error: error.message,
    });
  }
};

exports.me = async (req, res) => {
  try {
    const { id, role } = req.user || {};

    if (!id || !role) {
      return res.status(401).json({ message: "Invalid token" });
    }

    const Model = roleModelMap[role];
    if (!Model) {
      return res.status(403).json({ message: "Invalid role" });
    }

    const user = await Model.findById(id).select(
      "-password -otp -otpExpiresAt -resetOtp -resetOtpExpires -refreshToken",
    );

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

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
        user,
      },
    });
  } catch (error) {
    console.error("Auth me error:", error);
    return res.status(500).json({
      success: false,
      message: "Error fetching profile",
      error: error.message,
    });
  }
};
