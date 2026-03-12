const Provider = require ('../models/ServiceProvider');
const Buyer = require ('../models/ServiceUser');
const bcrypt = require ('bcryptjs');
const jwt = require ('jsonwebtoken');
const dotenv = require ('dotenv');
dotenv.config();
const { OAuth2Client } = require ('google-auth-library');
const {sendEmailOtp, forgotPasswordOtp, passwordChangedEmail, sendWelcomeEmail} = require ('../src/config/emailVerification')

const roleModelMap = {
  buyer: Buyer,
  provider: Provider,
};

const axios = require('axios');

const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
const ACCESS_TOKEN_EXPIRES_IN = process.env.ACCESS_TOKEN_EXPIRES_IN || "20h";
const REFRESH_TOKEN_EXPIRES_IN = process.env.REFRESH_TOKEN_EXPIRES_IN || "7d";
const REFRESH_TOKEN_SECRET =
  process.env.REFRESH_TOKEN_SECRET || process.env.JWT_SECRET;

const generateAccessToken = (user) =>
  jwt.sign(
    { id: user._id, role: user.role, email: user.email },
    process.env.JWT_SECRET,
    { expiresIn: ACCESS_TOKEN_EXPIRES_IN },
  );

const generateRefreshToken = (user) =>
  jwt.sign(
    { id: user._id, role: user.role, email: user.email },
    REFRESH_TOKEN_SECRET,
    { expiresIn: REFRESH_TOKEN_EXPIRES_IN },
  );

const getRefreshTokenExpiryDate = (token) => {
  const decoded = jwt.decode(token);
  if (!decoded?.exp) return null;
  return new Date(decoded.exp * 1000);
};

exports.googleSignUp = async (req, res) => {
  const { token } = req.body;

  // Check if token exists
  if (!token) {
    return res.status(400).json({ message: "Token is required" });
  }

  try {
    let email, googleId, name, picture;

    // Try to verify as ID token first
    try {
      const ticket = await client.verifyIdToken({
        idToken: token,
        audience: process.env.GOOGLE_CLIENT_ID,
      });
      const payload = ticket.getPayload();
      email = payload.email;
      googleId = payload.sub;
      console.log("Successfully verified as ID token");

      email = payload.email;
      googleId = payload.sub;
      name = payload.name || `${payload.given_name || ""} ${payload.family_name || ""}`.trim();
      picture = payload.picture;

    } catch (idTokenError) {
      // If ID token verification fails, treat it as access token
      console.log("Not an ID token, verifying as access token...");
      
      try {
        // Verify access token with Google
        const tokenInfoResponse = await axios.get(
          `https://www.googleapis.com/oauth2/v3/tokeninfo`,
          {
            params: { access_token: token } // Use params instead of template string
          }
        );
        
        
        if (tokenInfoResponse.data.aud !== process.env.GOOGLE_CLIENT_ID) {
          return res.status(401).json({ message: "Invalid token audience" });
        }

        // Get user profile using access token
        const userInfoResponse = await axios.get(
          'https://www.googleapis.com/oauth2/v3/userinfo',
          {
            headers: { Authorization: `Bearer ${token}` }
          }
        );

         const info = userInfoResponse.data;
        
        console.log("User info:", userInfoResponse.data);
        
        email = info.email;
        googleId = info.sub;
        name = info.name || `${info.given_name || ""} ${info.family_name || ""}`.trim();
        picture = info.picture;

      } catch (accessTokenError) {
        console.error("Access token verification failed:", accessTokenError.response?.data || accessTokenError.message);
        return res.status(401).json({ 
          message: "Invalid token", 
          error: accessTokenError.response?.data || accessTokenError.message 
        });
      }
    }

    // Check if email exists
    const existingEmail = await Provider.findOne({ email });
    if (existingEmail) {
      return res.status(400).json({ message: "Email already in use" });
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpExpiresAt = new Date(Date.now() + 10 * 60 * 1000);
    
    const newUser = new Provider({
      email,
      fullName: name,
      password: null,
      otp,
      otpExpiresAt,
      isGoogleUser: true,
      googleId,
      role: "provider",
    });

    await newUser.save();

    try {
      await sendEmailOtp(email, otp);
    } catch (OtpError) {
      await Provider.findByIdAndDelete(newUser._id);
      return res.status(500).json({ message: 'Failed to send otp, please try again' });
    }

    const jwtToken = jwt.sign(
      { id: newUser._id, role: newUser.role, email: newUser.email },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );

    res.status(200).json({
      message: "Signup successful! OTP sent to email. Please verify to complete registration.",
      token: jwtToken,
      newUser: {
        email: newUser.email,
        _id: newUser._id,
      },
    });
  } catch (err) {
    console.error("Google signup failed:", err);
    res.status(401).json({ message: "Google signup failed", error: err.message });
  }
};


exports.googleSignUpBuyer = async (req, res) => {
  const { token } = req.body;

  if (!token) {
    return res.status(400).json({ message: "Token is required" });
  }

  try {
    let email, googleId, name, picture;

    // Try verifying as ID token
    try {
      const ticket = await client.verifyIdToken({
        idToken: token,
        audience: process.env.GOOGLE_CLIENT_ID,
      });

      const payload = ticket.getPayload();
       email = payload.email;
      googleId = payload.sub;
      console.log("Successfully verified as ID token");

      email = payload.email;
      googleId = payload.sub;
      name = payload.name || `${payload.given_name || ""} ${payload.family_name || ""}`.trim();
      picture = payload.picture;

    } catch (idTokenError) {
      // Try verifying as access token
      console.log("Not an ID token, verifying as access token...");

      try {
        const tokenInfoResponse = await axios.get(
          "https://www.googleapis.com/oauth2/v3/tokeninfo",
          { params: { access_token: token } }
        );

        if (tokenInfoResponse.data.aud !== process.env.GOOGLE_CLIENT_ID) {
          return res.status(401).json({ message: "Invalid token audience" });
        }

        const userInfoResponse = await axios.get(
          "https://www.googleapis.com/oauth2/v3/userinfo",
          { headers: { Authorization: `Bearer ${token}` } }
        );

        const info = userInfoResponse.data;

        console.log("Access token verified. User info:", info);

        email = info.email;
        googleId = info.sub;
        name = info.name || `${info.given_name || ""} ${info.family_name || ""}`.trim();
        picture = info.picture;

      } catch (accessTokenError) {
        console.error("Access token verification failed:", accessTokenError.response?.data || accessTokenError.message);
        return res.status(401).json({ 
          message: "Invalid token", 
          error: accessTokenError.response?.data || accessTokenError.message 
        });
      }
    }

    // Check if email already exists
    const existingEmail = await Buyer.findOne({ email });
    if (existingEmail) {
      return res.status(400).json({ message: "Email already in use" });
    }

    // Generate OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpExpiresAt = new Date(Date.now() + 10 * 60 * 1000);

    // Create new user
    const newUser = new Buyer({
      email,
      fullName: name,
      password: null,
      otp,
      profilePicture: picture,
      otpExpiresAt,
      isGoogleUser: true,
      googleId,
      role: "buyer",
    });

    await newUser.save();

    // Send OTP
    try {
      await sendEmailOtp(email, otp);
    } catch (OtpError) {
      await Buyer.findByIdAndDelete(newUser._id);
      return res.status(500).json({ message: "Failed to send OTP, please try again" });
    }

    // Generate JWT
    const jwtToken = jwt.sign({ id: newUser._id }, process.env.JWT_SECRET, { expiresIn: "1h" });

    res.status(200).json({
      message: "Signup successful! OTP sent to email. Please verify to complete registration.",
      token: jwtToken,
      newUser: {
        email: newUser.email,
        _id: newUser._id,
      },
    });

  } catch (err) {
    console.error("Google signup failed:", err);
    res.status(401).json({ message: "Google signup failed", error: err });
  }
};


exports.googleLogIn = async (req, res) => {
  const { token } = req.body;

  // Check if token exists
  if (!token) {
    return res.status(400).json({ message: "Token is required" });
  }

  try {
    let email, googleId;

    // Try to verify as ID token first
    try {
      const ticket = await client.verifyIdToken({
        idToken: token,
        audience: process.env.GOOGLE_CLIENT_ID,
      });
      const payload = ticket.getPayload();
      email = payload.email;
      googleId = payload.sub;
      console.log("Successfully verified as ID token");
    } catch (idTokenError) {
      // If ID token verification fails, treat it as access token
      console.log("Not an ID token, verifying as access token...");
      
      try {
        // Verify access token with Google
        const tokenInfoResponse = await axios.get(
          `https://www.googleapis.com/oauth2/v3/tokeninfo`,
          {
            params: { access_token: token }
          }
        );
        
        console.log("Token info:", tokenInfoResponse.data);
        
        if (tokenInfoResponse.data.aud !== process.env.GOOGLE_CLIENT_ID) {
          return res.status(401).json({ message: "Invalid token audience" });
        }

        // Get user profile using access token
        const userInfoResponse = await axios.get(
          'https://www.googleapis.com/oauth2/v3/userinfo',
          {
            headers: { Authorization: `Bearer ${token}` }
          }
        );
        
        console.log("User info:", userInfoResponse.data);
        
        email = userInfoResponse.data.email;
        googleId = userInfoResponse.data.sub;
        console.log("Successfully verified as access token");
      } catch (accessTokenError) {
        console.error("Access token verification failed:", accessTokenError.response?.data || accessTokenError.message);
        return res.status(401).json({ 
          message: "Invalid token", 
          error: accessTokenError.response?.data || accessTokenError.message 
        });
      }
    }

    // Check if user exists
    let user = await Provider.findOne({ email });

    if (!user) {
      user = await Buyer.findOne({ email });
    }
    if (!user) {
      return res.status(400).json({ message: "Account not found. Please sign up" });
    }

    // Check if email is verified 

    if (!user.emailVerified) {
       return res.status(403).json({ message: "Please verify your email before logging in" });
    }

    // Check if user registered with Google
    if (!user.isGoogleUser) {
      return res.status(400).json({ 
        message: "This email was registered with a password. Use email/password login." 
      });
    }

    // Optional: Verify googleId matches
    if (user.googleId && user.googleId !== googleId) {
      return res.status(401).json({ 
        message: "Google account mismatch. Please use the correct Google account." 
      });
    }

    // Generate access + refresh tokens
    const jwtToken = generateAccessToken(user);
    const refreshToken = generateRefreshToken(user);
    user.refreshToken = refreshToken;
    user.refreshTokenExpiresAt = getRefreshTokenExpiryDate(refreshToken);
    await user.save();

    res.status(200).json({
      message: "Login successful",
      token: jwtToken,
      // accessToken: jwtToken,
      refreshToken,
      user: {
        email: user.email,
        _id: user._id,
        role: user.role,
      },
    });
  } catch (err) {
    console.error("Google login failed:", err);
    res.status(401).json({ message: "Google login failed", error: err.message });
  }
};
exports.registerBuyer = async (req, res) => {
    const { email, password, phoneNumber, city, fullName } = req.body;

  const isValidPassword = /^(?=.*[A-Za-z])(?=.*\d)(?=.*[@$!%*#?&])[A-Za-z\d@$!%*#?&]{8,}$/.test(password);
  if (!isValidPassword) {
    return res.status(400).json({
      message:
        'Password must be at least 8 characters long and include a letter, number, and special character',
    });
  }
  try {

    const existingEmail = await Buyer.findOne ({ email });
    if (existingEmail) {
        return res.status(400).json({ message: "Email already in use" });
    }

    let hashedPassword = null;
    if (password) {
        hashedPassword = await bcrypt.hash(password, 10);
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpExpiresAt = new Date(Date.now() + 10 * 60 * 1000); // expires in 10 mins

    const newBuyer = new Buyer ({
        email,
        password: hashedPassword,
        otp,
        otpExpiresAt,
        isVerified: false,
        city,
        fullName,
        phoneNumber,
        role: "buyer", 

    })

    await newBuyer.save();

    try {
        await sendEmailOtp(email, otp);
        
    } catch (OtpError) {
        await Buyer.findByIdAndDelete(newBuyer._id);
        return res.status(500).json ({ message: 'Failed to send otp, please try again'})    
    }

        const token = jwt.sign({ id: newBuyer._id, role: newBuyer.role, email: newBuyer.email }, process.env.JWT_SECRET, { expiresIn: "20h" });

    return res.status(201).json ({
        message: 'OTP sent to email. Please verify to complete registration.',
        buyer: {
            id: newBuyer._id,
            email: newBuyer.email
        },
        token
    })
 
    
  } catch (err) {
    console.error("Registration error:", err)
    res.status(500).json ({ message: 'Server error:', err});
    
  }
};

exports.registerProvider = async (req, res) => {
    const { email, password, phoneNumber, fullName } = req.body;

  const isValidPassword = /^(?=.*[A-Za-z])(?=.*\d)(?=.*[@$!%*#?&])[A-Za-z\d@$!%*#?&]{8,}$/.test(password);
  if (!isValidPassword) {
    return res.status(400).json({
      message:
        'Password must be at least 8 characters long and include a letter, number, and special character',
    });
  }
  try {

    const existingEmail = await Provider.findOne ({ email });
    if (existingEmail) {
        return res.status(400).json({ message: "Email already in use" });
    }

    let hashedPassword = null;
    if (password) {
        hashedPassword = await bcrypt.hash(password, 10);
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpExpiresAt = new Date(Date.now() + 10 * 60 * 1000); // expires in 10 mins

    const newProvider = new Provider ({
        email,
        password: hashedPassword,
        otp,
        otpExpiresAt,
        isVerified: false,
        fullName,
        phoneNumber,
        role: "provider", 


    })

    await newProvider.save();

    try {
        await sendEmailOtp(email, otp);
        
    } catch (OtpError) {
        await Provider.findByIdAndDelete(newProvider._id);
        return res.status(500).json ({ message: 'Failed to send otp, please try again'})    
    }
        const token = jwt.sign({ id: newProvider._id, role: newProvider.role, email: newProvider.email }, process.env.JWT_SECRET, { expiresIn: "20h" });

    return res.status(201).json ({
        message: 'OTP sent to email. Please verify to complete registration.',
        provider: {
            id: newProvider._id,
            email: newProvider.email
        },
        token
    })
 
    
  } catch (err) {
    console.error("Registration error:", err)
    res.status(500).json ({ message: 'Server error:', err});
    
  }
};

exports.verifyEmail = async (req, res) => {
    const { otp } = req.body;
try {
    let user = await Buyer.findOne ({ otp: otp});
    let userType = 'buyer';

    if (!user) {
        user = await Provider.findOne ({ otp: otp });
        userType = 'provider';
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
    await user.save();

    try {
      const firstName = user.fullName
        ? user.fullName.trim().split(/\s+/)[0]
        : "there";
      const baseUrl = process.env.FRONTEND_URL || "";
      await sendWelcomeEmail(user.email, {
        firstName,
        year: new Date().getFullYear(),
        ctaUrl: baseUrl,
        ctaText: "Open SabiGuy",
        // unsubscribeUrl: baseUrl ? `${baseUrl.replace(/\\/$/, "")}/unsubscribe` : "",
      });
    } catch (welcomeError) {
      console.error("Welcome email error:", welcomeError);
      return res.status(500).json({
        message: "Email verified, but welcome email failed to send",
      });
    }

    res.status(200).json({
      message: `Email verified successfully as ${userType}.`,
    });
} catch (error) {
    console.error(error);
    res.status(500).json ({ message: 'Something went wrong.' });
    
}
};

exports.resendOTP = async (req, res) => {
  const { email } = req.body;

  try {
    let user = await Buyer.findOne({ email });
    let role = "buyer";

    if (!user) {
      user = await Provider.findOne({ email });
      role = "provider";
    }    

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (user.isVerified) {
      return res.status(400).json({ message: 'Email already verified' });
    }

   const now = new Date();
const lastSent = new Date(user.lastVerificationOtpSentAt);

if (user.lastVerificationOtpSentAt && now.getTime() - lastSent.getTime() < 60 * 1000) {
  return res.status(429).json({ message: 'Please wait before requesting another OTP' });
}

    // Generate new OTP and expiration
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpExpiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    user.otp = otp;
    user.otpExpiresAt = otpExpiresAt;
    user.lastVerificationOtpSentAt = now; 
    await user.save();

 try {
         await sendEmailOtp(email, otp);

          
        } catch (OtpError) {
          await user.findByIdAndDelete(user._id);
          return res.status (500).json ({ message: 'Failed to send OTP. Please try again'})
          
        }
    return res.status(200).json({ message: 'OTP resent successfully' });
  } catch (err) {
    console.error('Resend OTP error:', err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

exports.login = async (req, res) => {
    const { email, password } = req.body;

    try {
        let user = await Buyer.findOne ({ email });
        let role = 'buyer';

        if (!user) {
            user = await Provider.findOne ({ email });
            role = 'provider';
        }
        
 if (!user) {
      return res.status(400).json({ message: "Invalid credentials" });
    }

    if (!user.emailVerified) {
       return res.status(403).json({ message: "Please verify your email before logging in" });

    }

    if (user.isGoogleUser && !user.password) {
  return res.status(400).json({
    message: "You signed up with Google. Please log in using Google.",
  });
}
    const isMatch = await bcrypt.compare(password, user.password);
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
    });

  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ message: "Failed to login", error });
          
    }

}

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
      token
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
  const { email } = req.body

  try {
    let user = await Buyer.findOne ({ email });
    let role = 'buyer';
    
    if (!user) {
      user = await Provider.findOne ({ email });
      role = 'provider';
    }

    if (!user) {
      return res.status(400).json ({ message: 'User not found, please check the email'})
    }
const otp = Math.floor(100000 + Math.random() * 900000).toString();

    user.resetOtp = otp;
    user.resetOtpExpires = Date.now() + 10 * 60 * 1000; // 10 min
    await user.save();
    await forgotPasswordOtp(email, otp);

    res.status(201).json({ message: "Forgot password otp sent to email" });

  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Failed to send OTP email" });
  }
};

exports.resetPassword = async (req, res) => {
  const { email, otp, newPassword } = req.body;

  try {
     let user = await Buyer.findOne ({ email });
    let role = 'buyer';
    
    if (!user) {
      user = await Provider.findOne ({ email });
      role = 'provider';
    }

    if (!user) {
      return res.status(400).json ({ message: 'User not found, please check the email'})
    }
if ( user.resetOtp !== otp || user.resetOtpExpires < Date.now()) {
      return res.status(400).json({ message: "Invalid or expired OTP" });
    }

    user.password = await bcrypt.hash(newPassword, 10);
    user.resetOtp = undefined;
    user.resetOtpExpires = undefined;
    await user.save();
    try {
      await passwordChangedEmail(user.email);
    } catch (emailError) {
      console.error("Password reset email error:", emailError);
      return res.status(500).json({
        message: "Password reset, but confirmation email failed to send",
      });
    }

   
 res.json({ message: "Password reset successful" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error:", err});
      
  }
};


exports.changePassword = async (req, res) => {
  try {
    const userId = req.user.id; // From auth middleware
    const { oldPassword, newPassword } = req.body;

    if (!oldPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        message: "Old password and new password are required",
      });
    }
  const strongPassword = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])/;
if (!strongPassword.test(newPassword)) {
  return res.status(400).json({
    success: false,
    message: "Password must contain uppercase, lowercase, number, and special character",
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

    // Compare old password
    const isMatch = await bcrypt.compare(oldPassword, user.password);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: "Old password is incorrect",
      });
    }

    // Hash new password
    const saltRounds = 12;
    const hashedPassword = await bcrypt.hash(newPassword, saltRounds);

    // Update password
    user.password = hashedPassword;
    await user.save();
    try {
      await passwordChangedEmail(user.email);
    } catch (emailError) {
      console.error("Password change email error:", emailError);
      return res.status(500).json({
        success: false,
        message: "Password changed, but confirmation email failed to send",
      });
    }


    return res.status(200).json({
      success: true,
      message: "Password changed successfully",
    });

  } catch (error) {
    console.error("Change password error:", error);
    return res.status(500).json({
      success: false,
      message: "Error changing password",
    });
  }
};
