const { OAuth2Client } = require('google-auth-library');
const axios = require('axios');
const bcrypt = require('bcryptjs');
const {
  sendWelcomeEmail,
  sendBusinessWelcomeMail,
} = require('../../config/emailVerification');

const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

const BCRYPT_SALT_ROUNDS = 10;

class AppError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

const verifyGoogleToken = async (token) => {
  if (!token || typeof token !== 'string') {
    throw new AppError('Token is required', 400);
  }

  // Guard against refresh tokens being sent by mistake
  if (token.startsWith('1//')) {
    throw new AppError(
      'Invalid token format: Received a Refresh Token instead of an ID Token or Access Token',
      400,
    );
  }

  // 1) Try as ID token first
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
  } catch (_idTokenError) {
    // Not an ID token — fall through to access token path
  }

  // 2) Try as access token
  try {
    const tokenInfoResponse = await axios.get(
      'https://www.googleapis.com/oauth2/v3/tokeninfo',
      { params: { access_token: token } },
    );

    const audience =
      tokenInfoResponse.data.aud || tokenInfoResponse.data.issued_to;
    if (audience !== process.env.GOOGLE_CLIENT_ID) {
      throw new AppError('Invalid token audience', 401);
    }

    const userInfoResponse = await axios.get(
      'https://www.googleapis.com/oauth2/v3/userinfo',
      { headers: { Authorization: `Bearer ${token}` } },
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
    if (accessTokenError instanceof AppError) throw accessTokenError;
    throw new AppError('Invalid or expired Google token', 401);
  }
};

const generateOtp = () =>
  Math.floor(100000 + Math.random() * 900000).toString();

const hashPassword = (password) => bcrypt.hash(password, BCRYPT_SALT_ROUNDS);

const comparePassword = async (candidate, storedHash) => {
  if (!storedHash) return false;
  return bcrypt.compare(candidate, storedHash);
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
  fullName ? fullName.trim().split(/\s+/)[0] : 'there';

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
  addAuthMethod(user, 'google');
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
    console.error('Password changed email failed to dispatch:', err);
    return false;
  }
};

const formatChangedAt = () =>
  new Date().toLocaleString('en-NG', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Africa/Lagos',
  });

const googleHelper = {
  verifyToken: verifyGoogleToken,
};

const passwordHelper = {
  hash: hashPassword,
  compare: comparePassword,
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
  generateOtp,
  formatChangedAt,
};

module.exports = {
  AppError,
  googleHelper,
  passwordHelper,
  emailHelper,
  accountHelper,
};
