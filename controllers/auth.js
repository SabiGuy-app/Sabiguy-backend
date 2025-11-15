const Provider = require ('../models/ServiceProvider');
const Buyer = require ('../models/ServiceUser');
const bcrypt = require ('bcryptjs');
const jwt = require ('jsonwebtoken');
const dotenv = require ('dotenv');
dotenv.config();
const { OAuth2Client } = require ('google-auth-library');
const {sendEmailOtp, forgotPasswordOtp} = require ('../src/config/emailVerification')

const roleModelMap = {
  buyer: Buyer,
  provider: Provider,
};

const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

exports.googleSignUp = async (req, res) => {
  const { token } = req.body;

  try {
    const ticket = await client.verifyIdToken({
      idToken: token,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();
    const { email, sub: googleId} = payload;

    // Check if email exists

     const existingEmail = await Provider.findOne ({ email });
    if (existingEmail) {
        return res.status(400).json({ message: "Email already in use" });
    }    

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpExpiresAt = new Date(Date.now() + 10 * 60 * 1000); // expires in 10 mins
    const newUser = new Provider({
        email,
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
        return res.status(500).json ({ message: 'Failed to send otp, please try again'})    
    }

    // Generate your app's JWT
    const jwtToken = jwt.sign({ id: newUser._id, role: newUser.role }, process.env.JWT_SECRET, { expiresIn: '1h' });

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



exports.googleSignUpBuyer = async (req, res) => {
  const { token } = req.body;

  try {
    const ticket = await client.verifyIdToken({
      idToken: token,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();
    const { email, sub: googleId} = payload;

    // Check if email exists

     const existingEmail = await Buyer.findOne ({ email });
    if (existingEmail) {
        return res.status(400).json({ message: "Email already in use" });
    }    

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpExpiresAt = new Date(Date.now() + 10 * 60 * 1000); // expires in 10 mins
    const newUser = new Buyer({
        email,
        password: null, 
        otp,
        otpExpiresAt,
        isGoogleUser: true,
        googleId,
        role: "buyer", 

      });

      await newUser.save();
      
    try {
        await sendEmailOtp(email, otp);
        
    } catch (OtpError) {
        await Buyer.findByIdAndDelete(newUser._id);
        return res.status(500).json ({ message: 'Failed to send otp, please try again'})    
    }

    // Generate your app's JWT
    const jwtToken = jwt.sign({ id: newUser._id }, process.env.JWT_SECRET, { expiresIn: '1h' });

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

  try {
    const ticket = await client.verifyIdToken({
      idToken: token,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();
    const { email, sub: googleId} = payload;

    // Check if email exists

     const user = await Provider.findOne ({ email });
    if (!user) {
        return res.status(400).json({ message: "Account not found. Please sign up" });
    }    
if (!user.isGoogleUser) {
      return res.status(400).json({ message: "This email was registered with a password. Use email/password login." });
    }
    

    // Generate your app's JWT
    const jwtToken = jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET, { expiresIn: '1h' });

    res.status(200).json({
      message: "Login successful",
      token: jwtToken,
      newUser: {
        email: user.email,
        _id: user._id,
      },
    });
  } catch (err) {
    console.error("Google login failed:", err);
    res.status(401).json({ message: "Google login failed", error: err });
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

        const token = jwt.sign({ id: newBuyer._id, role: newBuyer.role }, process.env.JWT_SECRET, { expiresIn: "20h" });

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
        const token = jwt.sign({ id: newProvider._id, role: newProvider.role }, process.env.JWT_SECRET, { expiresIn: "20h" });

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

    res.status(200).json({
      message: `Email verified successfully as ${userType}.`,
    });
} catch (error) {
    console.error(error);
    res.status(500).json ({ message: 'Something went wrong.' });
    
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

    const token = jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET, { expiresIn: "20h" });

    res.json({ message: "Login successful", role, token, id: user._id });

  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ message: "Failed to login", error });
          
    }

}

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
    await forgotPasswordOtp(email, otp)

    res.status(201).json ({ message: "Forgot password otp sent to email" })

  } catch (error) {
    console.error(error);
    return res.status(500).json ({ message: "Failed to send otp:", error})   
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
   
 res.json({ message: "Password reset successful" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error:", err});
      
  }
}