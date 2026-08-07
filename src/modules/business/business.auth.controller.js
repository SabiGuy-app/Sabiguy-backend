const businessAuthService = require('./business.auth.service');

const registerBusiness = async (req, res) => {
  try {
    const result = await businessAuthService.registerBusiness(req.body);
    return res.status(201).json({ success: true, ...result });
  } catch (err) {
    console.error('registerBusiness error:', err.message);
    const status = err.status || 500;
    return res
      .status(status)
      .json({ message: err.message || 'Internal server error' });
  }
};

const verifyEmail = async (req, res) => {
  try {
    const { email, otp } = req.body;
    const result = await businessAuthService.verifyBusinessEmail(email, otp);
    return res.status(200).json({ success: true, ...result });
  } catch (err) {
    console.error('verifyEmail error:', err.message);
    const status = err.status || 500;
    return res
      .status(status)
      .json({ message: err.message || 'Internal server error' });
  }
};

const resendOtp = async (req, res) => {
  try {
    const { email } = req.body;
    const result = await businessAuthService.resendBusinessOtp(email);
    return res.status(200).json({ success: true, ...result });
  } catch (err) {
    console.error('resendOtp error:', err.message);
    const status = err.status || 500;
    return res
      .status(status)
      .json({ message: err.message || 'Internal server error' });
  }
};

const login = async (req, res) => {
  try {
    const result = await businessAuthService.loginBusiness(req.body);
    return res.status(200).json({ success: true, ...result });
  } catch (err) {
    console.error('business login error:', err.message);
    const status = err.status || 500;
    return res
      .status(status)
      .json({ message: err.message || 'Internal server error' });
  }
};

const googleSignUp = async (req, res) => {
  try {
    const { token } = req.body;
    const result = await businessAuthService.googleSignUpBusiness(token);
    return res.status(201).json({ success: true, ...result });
  } catch (err) {
    console.error('business googleSignUp error:', err.message);
    const status = err.status || 500;
    return res
      .status(status)
      .json({ message: err.message || 'Internal server error' });
  }
};

const googleLogin = async (req, res) => {
  try {
    const { token } = req.body;
    const result = await businessAuthService.googleLogInBusiness(token);
    return res.status(200).json({ success: true, ...result });
  } catch (err) {
    console.error('business googleLogin error:', err.message);
    const status = err.status || 500;
    return res
      .status(status)
      .json({ message: err.message || 'Internal server error' });
  }
};

const refreshAuthToken = async (req, res) => {
  try {
    const { refreshToken } = req.body;
    const result = await businessAuthService.refreshAuthToken(refreshToken);
    return res.status(200).json({ success: true, ...result });
  } catch (err) {
    console.error('refreshAuthToken error:', err.message);
    const status = err.status || 500;
    return res
      .status(status)
      .json({ message: err.message || 'Internal server error' });
  }
};

const me = async (req, res) => {
  try {
    const { id, role } = req.user || {};
    if (!id || !role) {
      return res.status(401).json({ message: 'Invalid token' });
    }
    const business = await Business.findById(id).select(
      '-password -otp -emailVerificationExpires -refreshToken -resetOtp -resetOtpExpires',
    );
    if (!business) {
      return res.status(404).json({ message: 'Business not found' });
    }
    return res.status(200).json({ success: true, data: business });
  } catch (err) {
    console.error('me error:', err.message);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

module.exports = {
  registerBusiness,
  verifyEmail,
  resendOtp,
  login,
  googleSignUp,
  googleLogin,
  refreshAuthToken,
  me,
};
