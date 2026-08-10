const businessAuthService = require('./business.auth.service');
const Business = require('./business.model');

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

const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    const result = await businessAuthService.forgotBusinessPassword(email);
    return res.status(201).json({ success: true, ...result });
  } catch (err) {
    console.error('forgotPassword error:', err.message);
    const status = err.status || 500;
    return res
      .status(status)
      .json({ message: err.message || 'Internal server error' });
  }
};

const resendForgotPasswordOtp = async (req, res) => {
  try {
    const { email } = req.body;
    const result = await businessAuthService.resendForgotBusinessPasswordOtp(email);
    return res.status(200).json({ success: true, ...result });
  } catch (err) {
    console.error('resendForgotPasswordOtp error:', err.message);
    const status = err.status || 500;
    return res
      .status(status)
      .json({ message: err.message || 'Internal server error' });
  }
};

const verifyResetOtp = async (req, res) => {
  try {
    const { email, otp } = req.body;
    const result = await businessAuthService.verifyBusinessResetOtp(email, otp);
    return res.status(200).json({ success: true, ...result });
  } catch (err) {
    console.error('verifyResetOtp error:', err.message);
    const status = err.status || 500;
    return res
      .status(status)
      .json({ message: err.message || 'Internal server error' });
  }
};

const resetPassword = async (req, res) => {
  try {
    const { email, otp, newPassword } = req.body;
    const result = await businessAuthService.resetBusinessPassword(email, otp, newPassword);
    return res.status(200).json({ success: true, ...result });
  } catch (err) {
    console.error('resetPassword error:', err.message);
    const status = err.status || 500;
    return res
      .status(status)
      .json({ message: err.message || 'Internal server error' });
  }
};

const changePassword = async (req, res) => {
  try {
    const userId = req.user.id;
    const { oldPassword, newPassword } = req.body;
    const result = await businessAuthService.changeBusinessPassword(userId, oldPassword, newPassword);
    return res.status(200).json({ success: true, ...result });
  } catch (err) {
    console.error('changePassword error:', err.message);
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
    const business = await businessAuthService.getBusinessProfileById(id);
    return res.status(200).json({ success: true, data: business });
  } catch (err) {
    console.error('me error:', err.message);
    const status = err.status || 500;
    return res.status(status).json({ message: err.message || 'Internal server error' });
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
  forgotPassword,
  resendForgotPasswordOtp,
  verifyResetOtp,
  resetPassword,
  changePassword,
};
