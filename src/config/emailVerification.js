const nodemailer = require ('nodemailer');
const dotenv = require ('dotenv');
dotenv.config();

const transporter = nodemailer.createTransport ({
    service: 'gmail',
    auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_PASS,
    },
});

const sendEmailOtp = async (email, otp) => {
    const mailOptions = {
        from: process.env.GMAIL_USER,
        to: email,
        subject: 'Your SabiGuy Verification Code',
        text: `Hello!\n\nWelcome Onboard — we’re glad to have you.\n\nYour email verification code is: ${otp}\n\nThis code will expire in 10 minutes. If you didn’t request this, you can safely ignore this email.\n\nThanks,  \nThe SabiGuy Team`,
        html: `<div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;"><h2>Welcome to SabiGuy</h2><p>We're glad to have you!</p><p>Your email verification code is:</p><h1 style="background: #f2f2f2; padding: 10px 20px; border-radius: 6px; display: inline-block; color: #111;">${otp}</h1><p>This code will expire in <strong>10 minutes</strong>.</p><p>If you didn’t request this, you can safely ignore this email.</p><br/><p style="font-size: 14px;">— The SabiGuy Team</p></div>`,
  };
  try {
    await transporter.sendMail(mailOptions);
    console.log('Email sent!');
  } catch (error) {
    console.error('Nodemailer error:', error.message);   
  }
};


const forgotPasswordOtp = async (email, otp) => {
   const mailOptions = {
        to: email,
        from: process.env.GMAIL_PASS,
        subject: 'SabiGuy Password Reset',
        text: `Your password reset OTP is: ${otp}` +
              `If you did not request this, please ignore this email and your password will remain unchanged.\n`,
        html: `<div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;"><h2>Your passoword reset otp is:</h2>
        <h1 style="background: #f2f2f2; padding: 10px 20px; border-radius: 6px; display: inline-block; color: #111;">${otp}</h1><p>This code will expire in <strong>10 minutes</strong>.</p>
        <p>If you didn’t request this, please ignore this email and your password will remain unchanged.</p><br/><p style="font-size: 14px;">— The SabiGuy Team</p></div>`,

    };
      try {
    await transporter.sendMail(mailOptions);
    console.log('Forgot password otp sent!');
  } catch (error) {
    console.error('Nodemailer error:', error.message);   
  }
}
module.exports = {sendEmailOtp, forgotPasswordOtp};