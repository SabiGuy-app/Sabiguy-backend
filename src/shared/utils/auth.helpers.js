const { OAuth2Client } = require('google-auth-library');
const axios = require('axios');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const {
  sendWelcomeEmail,
  sendBusinessWelcomeMail,
} = require('../../config/emailVerification');

const allowedGoogleClientIds = [
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_IOS_CLIENT_ID,
  process.env.GOOGLE_ANDROID_CLIENT_ID,
].filter(Boolean);

// Pass a primary client id if available, otherwise create a client without one
const client = new OAuth2Client(allowedGoogleClientIds[0] || undefined);
const APPLE_JWKS_URL = 'https://appleid.apple.com/auth/keys';
const APPLE_ISSUER = 'https://appleid.apple.com';
const APPLE_JWKS_CACHE_MS = 60 * 60 * 1000;
let appleJwksCache = null;
let appleJwksCacheExpiresAt = 0;

const BCRYPT_SALT_ROUNDS = 10;

class AppError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

const verifyGoogleToken = async (token) => {
  if (!token || typeof token !== "string") {
    throw new AppError("Token is required", 400);
  }

  // Guard against refresh tokens being sent by mistake
  if (token.startsWith("1//")) {
    throw new AppError(
      "Invalid token format: Received a Refresh Token instead of an ID Token or Access Token",
      400,
    );
  }

  // 1) Try as ID token first
  try {
    const ticket = await client.verifyIdToken({
      idToken: token,
      // Accept any of the configured client IDs
      audience: allowedGoogleClientIds,
    });
    const payload = ticket.getPayload();
    return {
      email: payload.email,
      googleId: payload.sub,
      name:
        payload.name ||
        `${payload.given_name || ""} ${payload.family_name || ""}`.trim(),
      picture: payload.picture,
    };
  } catch (_idTokenError) {
    // Not an ID token — fall through to access token path
  }

  // 2) Try as access token
  try {
    const tokenInfoResponse = await axios.get(
      "https://www.googleapis.com/oauth2/v3/tokeninfo",
      { params: { access_token: token } },
    );

    const audience =
      tokenInfoResponse.data.aud || tokenInfoResponse.data.issued_to;
    if (!allowedGoogleClientIds.includes(audience)) {
      throw new AppError("Invalid token audience", 401);
    }

    const userInfoResponse = await axios.get(
      "https://www.googleapis.com/oauth2/v3/userinfo",
      { headers: { Authorization: `Bearer ${token}` } },
    );

    const info = userInfoResponse.data;
    return {
      email: info.email,
      googleId: info.sub,
      name:
        info.name ||
        `${info.given_name || ""} ${info.family_name || ""}`.trim(),
      picture: info.picture,
    };
  } catch (accessTokenError) {
    if (accessTokenError instanceof AppError) throw accessTokenError;
    throw new AppError("Invalid or expired Google token", 401);
  }
};

const getAppleJwks = async (forceRefresh = false) => {
  if (!forceRefresh && appleJwksCache && Date.now() < appleJwksCacheExpiresAt) {
    return appleJwksCache;
  }

  try {
    const response = await axios.get(APPLE_JWKS_URL, { timeout: 10000 });
    if (!Array.isArray(response.data?.keys)) {
      throw new Error('Apple returned an invalid signing key set');
    }

    appleJwksCache = response.data.keys;
    appleJwksCacheExpiresAt = Date.now() + APPLE_JWKS_CACHE_MS;
    return appleJwksCache;
  } catch (error) {
    appleJwksCache = null;
    appleJwksCacheExpiresAt = 0;
    console.error('Failed to retrieve Apple signing keys:', error.message);
    throw new AppError('Apple token verification is temporarily unavailable', 503);
  }
};

const verifyAppleToken = async (token, { nonce } = {}) => {
  if (!token || typeof token !== 'string') {
    throw new AppError('Token is required', 400);
  }

  const allowedAppleClientIds = String(process.env.APPLE_CLIENT_IDS || '')
    .split(',')
    .map((clientId) => clientId.trim())
    .filter(Boolean);
  if (allowedAppleClientIds.length === 0) {
    throw new AppError('Apple authentication is not configured', 500);
  }

  const decoded = jwt.decode(token, { complete: true });
  if (
    !decoded ||
    decoded.header?.alg !== 'RS256' ||
    typeof decoded.header?.kid !== 'string'
  ) {
    throw new AppError('Invalid Apple identity token', 401);
  }

  let appleKey = (await getAppleJwks()).find(
    ({ kid }) => kid === decoded.header.kid,
  );
  if (!appleKey) {
    appleKey = (await getAppleJwks(true)).find(
      ({ kid }) => kid === decoded.header.kid,
    );
  }
  if (!appleKey) {
    throw new AppError('Invalid Apple identity token', 401);
  }

  let claims;
  try {
    const publicKey = crypto.createPublicKey({
      key: appleKey,
      format: 'jwk',
    });
    claims = jwt.verify(token, publicKey, {
      algorithms: ['RS256'],
      issuer: APPLE_ISSUER,
      audience: allowedAppleClientIds,
    });
  } catch (_error) {
    throw new AppError('Invalid or expired Apple identity token', 401);
  }

  if (typeof claims.sub !== 'string' || !claims.sub) {
    throw new AppError('Apple identity token is missing its subject', 401);
  }
  if (!Number.isFinite(claims.exp)) {
    throw new AppError('Apple identity token is missing its expiration', 401);
  }

  if (nonce !== undefined) {
    if (typeof nonce !== 'string' || !nonce || typeof claims.nonce !== 'string') {
      throw new AppError('Invalid Apple nonce', 401);
    }
    const hashedNonce = crypto.createHash('sha256').update(nonce).digest('hex');
    if (claims.nonce !== nonce && claims.nonce !== hashedNonce) {
      throw new AppError('Invalid Apple nonce', 401);
    }
  }

  return {
    appleId: claims.sub,
    email: claims.email,
    emailVerified:
      claims.email_verified === true || claims.email_verified === 'true',
  };
};

const generateOtp = () =>
  Math.floor(100000 + Math.random() * 900000).toString();

const hashPassword = (password) => bcrypt.hash(password, BCRYPT_SALT_ROUNDS);

const comparePassword = async (candidate, storedHash) => {
  if (!storedHash) return false;
  return bcrypt.compare(candidate, storedHash);
};

const STRONG_PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])/;
const MIN_PASSWORD_LENGTH = 8;

const validatePasswordStrength = (password) => {
  if (!password || typeof password !== 'string') {
    throw new AppError('Password is required', 400);
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new AppError('Password must be at least 8 characters long', 400);
  }
  if (!STRONG_PASSWORD_REGEX.test(password)) {
    throw new AppError(
      'Password must contain uppercase, lowercase, number, and special character',
      400,
    );
  }
};

const sendWelcomeEmailSafe = async (email, data = {}) => {
  try {
    await sendWelcomeEmail(email, {
      firstName: data.firstName || 'there',
      year: new Date().getFullYear(),
      ctaUrl: process.env.FRONTEND_URL || '',
      ctaText: 'Open SabiGuy',
      role: data.role || 'user',
      ...data,
    });
    return true;
  } catch (err) {
    console.error('Welcome email failed to dispatch:', err);
    return false;
  }
};

const sendBusinessWelcomeEmailSafe = async (email, data) => {
  try {
    await sendBusinessWelcomeMail(email, {
      firstName: data.firstName || 'there',
      year: new Date().getFullYear(),
      ctaUrl: process.env.FRONTEND_URL || '',
      ctaText: 'Open SabiGuy',
      ...data,
    });
    return true;
  } catch (err) {
    console.error('Business Welcome email failed to dispatch:', err);
    return false;
  }
};

const getFirstName = (fullName) =>
  fullName ? fullName.trim().split(/\s+/)[0] : "there";

const addAuthMethod = (user, method) => {
  if (!Array.isArray(user.authMethods)) {
    user.authMethods = [];
  }
  if (!user.authMethods.includes(method)) {
    user.authMethods.push(method);
  }
};

const linkGoogleAccount = (user, googleId) => {
  user.isGoogleUser = true;
  user.googleId = googleId;
  user.emailVerified = true;
  user.otp = null;
  user.otpExpiresAt = null;
  addAuthMethod(user, "google");
};

const linkAppleAccount = (user, appleId) => {
  user.isAppleUser = true;
  user.appleId = appleId;
  user.emailVerified = true;
  user.otp = null;
  user.otpExpiresAt = null;
  if ('emailVerificationExpires' in user) {
    user.emailVerificationExpires = null;
  }
  addAuthMethod(user, 'apple');
};

const passwordChangedEmailSafe = async (
  passwordChangedEmailFn,
  email,
  data = {},
) => {
  try {
    await passwordChangedEmailFn(email, data);
    return true;
  } catch (err) {
    console.error("Password changed email failed to dispatch:", err);
    return false;
  }
};

const formatChangedAt = () =>
  new Date().toLocaleString("en-NG", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Africa/Lagos",
  });

const googleHelper = {
  verifyToken: verifyGoogleToken,
};

const appleHelper = {
  verifyToken: verifyAppleToken,
};

const passwordHelper = {
  hash: hashPassword,
  compare: comparePassword,
  validateStrength: validatePasswordStrength,
  SALT_ROUNDS: BCRYPT_SALT_ROUNDS,
};

const emailHelper = {
  sendBusinessWelcomeEmailSafe,
  sendWelcomeSafe: sendWelcomeEmailSafe,
  sendPasswordChangedSafe: passwordChangedEmailSafe,
};

const accountHelper = {
  getFirstName,
  addAuthMethod,
  linkGoogleAccount,
  linkAppleAccount,
  generateOtp,
  formatChangedAt,
};

module.exports = {
  AppError,
  googleHelper,
  appleHelper,
  passwordHelper,
  emailHelper,
  accountHelper,
};
