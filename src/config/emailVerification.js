// const nodemailer = require('nodemailer');
// const dotenv = require('dotenv');
// dotenv.config();
// // Install: npm install resend
// const { Resend } = require('resend');
// const resend = new Resend(process.env.RESEND_API_KEY);

// const sendEmailOtp = async (email, otp) => {
//     try {
//         const data = await resend.emails.send({
//             from: 'SabiGuy <onboarding@yourdomain.com>', // Must use your domain
//             to: email,
//             subject: 'Your SabiGuy Verification Code',
//             html: `<div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
//                 <h2>Welcome to SabiGuy</h2>
//                 <p>We're glad to have you!</p>
//                 <p>Your email verification code is:</p>
//                 <h1 style="background: #f2f2f2; padding: 10px 20px; border-radius: 6px; display: inline-block; color: #111;">${otp}</h1>
//                 <p>This code will expire in <strong>10 minutes</strong>.</p>
//                 <p>If you didn't request this, you can safely ignore this email.</p>
//                 <br/>
//                 <p style="font-size: 14px;">— The SabiGuy Team</p>
//             </div>`,
//         });
//         console.log('Email sent:', data);
//         return { success: true };
//     } catch (error) {
//         console.error('Resend error:', error);
//         return { success: false, error: error.message };
//     }
// };


// // const transporter = nodemailer.createTransport({
// //     host: 'smtp.gmail.com',
// //     port: 587,
// //     secure: false, // use TLS
// //     requireTLS: true,
// //     auth: {
// //         user: process.env.GMAIL_USER,
// //         pass: process.env.GMAIL_PASS, 
// //     },
// //     tls: {
// //         rejectUnauthorized: true,
// //         minVersion: 'TLSv1.2'
// //     }
// // });

// // // Verify transporter configuration on startup
// // transporter.verify(function(error, success) {
// //     if (error) {
// //         console.error('Nodemailer configuration error:', error);
// //     } else {
// //         console.log('Server is ready to send emails');
// //     }
// // });

// // const sendEmailOtp = async (email, otp) => {
// //     const mailOptions = {
// //         from: process.env.GMAIL_USER,
// //         to: email,
// //         subject: 'Your SabiGuy Verification Code',
// //         text: `Hello!\n\nWelcome Onboard — we're glad to have you.\n\nYour email verification code is: ${otp}\n\nThis code will expire in 10 minutes. If you didn't request this, you can safely ignore this email.\n\nThanks,  \nThe SabiGuy Team`,
// //         html: `<div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;"><h2>Welcome to SabiGuy</h2><p>We're glad to have you!</p><p>Your email verification code is:</p><h1 style="background: #f2f2f2; padding: 10px 20px; border-radius: 6px; display: inline-block; color: #111;">${otp}</h1><p>This code will expire in <strong>10 minutes</strong>.</p><p>If you didn't request this, you can safely ignore this email.</p><br/><p style="font-size: 14px;">— The SabiGuy Team</p></div>`,
// //     };
    
// //     try {
// //         const info = await transporter.sendMail(mailOptions);
// //         console.log('Email sent successfully:', info.messageId);
// //         return { success: true, messageId: info.messageId };
// //     } catch (error) {
// //         console.error('Nodemailer error:', error);
// //         // Log more details for debugging
// //         if (error.code) console.error('Error code:', error.code);
// //         if (error.response) console.error('SMTP response:', error.response);
// //         return { success: false, error: error.message };
// //     }
// // };

// const forgotPasswordOtp = async (email, otp) => {
//     const mailOptions = {
//         from: process.env.GMAIL_USER, // Fixed: was GMAIL_PASS (wrong variable)
//         to: email,
//         subject: 'SabiGuy Password Reset',
//         text: `Your password reset OTP is: ${otp}\n\nIf you did not request this, please ignore this email and your password will remain unchanged.\n`,
//         html: `<div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;"><h2>Your password reset OTP is:</h2>
//         <h1 style="background: #f2f2f2; padding: 10px 20px; border-radius: 6px; display: inline-block; color: #111;">${otp}</h1><p>This code will expire in <strong>10 minutes</strong>.</p>
//         <p>If you didn't request this, please ignore this email and your password will remain unchanged.</p><br/><p style="font-size: 14px;">— The SabiGuy Team</p></div>`,
//     };
    
//     try {
//         const info = await transporter.sendMail(mailOptions);
//         console.log('Forgot password OTP sent successfully:', info.messageId);
//         return { success: true, messageId: info.messageId };
//     } catch (error) {
//         console.error('Nodemailer error:', error);
//         if (error.code) console.error('Error code:', error.code);
//         if (error.response) console.error('SMTP response:', error.response);
//         return { success: false, error: error.message };
//     }
// };

// module.exports = { sendEmailOtp, forgotPasswordOtp };

const brevo = require('@getbrevo/brevo');

let apiInstance = new brevo.TransactionalEmailsApi();
apiInstance.setApiKey(brevo.TransactionalEmailsApiApiKeys.apiKey, process.env.BREVO_API_KEY);

const sendEmailOtp = async (email, otp) => {
    let sendSmtpEmail = new brevo.SendSmtpEmail();
    
    sendSmtpEmail.subject = "Your SabiGuy Verification Code";
    sendSmtpEmail.to = [{ email: email }];
    sendSmtpEmail.htmlContent = `<div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
        <h2>Welcome to SabiGuy</h2>
        <p>We're glad to have you!</p>
        <p>Your email verification code is:</p>
        <h1 style="background: #f2f2f2; padding: 10px 20px; border-radius: 6px; display: inline-block; color: #111;">${otp}</h1>
        <p>This code will expire in <strong>10 minutes</strong>.</p>
        <p>If you didn't request this, you can safely ignore this email.</p>
        <br/>
        <p style="font-size: 14px;">— The SabiGuy Team</p>
    </div>`;
    sendSmtpEmail.sender = { 
        name: "Pitchers", 
        email: process.env.BREVO_SENDER_EMAIL  // ← Use environment variable
    };
    
    try {
        const data = await apiInstance.sendTransacEmail(sendSmtpEmail);
        console.log('✅ Email sent successfully! Message ID:', data.body.messageId);
        return { success: true, messageId: data.body.messageId };
    } catch (error) {
        console.error('❌ Brevo error:', error);
        return { success: false, error: error.message };
    }
};

const forgotPasswordOtp = async (email, otp) => {
    let sendSmtpEmail = new brevo.SendSmtpEmail();
    
    sendSmtpEmail.subject = "SabiGuy Password Reset";
    sendSmtpEmail.to = [{ email: email }];
    sendSmtpEmail.htmlContent = `<div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
        <h2>Your password reset OTP is:</h2>
        <h1 style="background: #f2f2f2; padding: 10px 20px; border-radius: 6px; display: inline-block; color: #111;">${otp}</h1>
        <p>This code will expire in <strong>10 minutes</strong>.</p>
        <p>If you didn't request this, please ignore this email and your password will remain unchanged.</p>
        <br/>
        <p style="font-size: 14px;">— The SabiGuy Team</p>
    </div>`;
    sendSmtpEmail.sender = { 
        name: "SabiGuy", 
        email: process.env.BREVO_SENDER_EMAIL  // ← Use environment variable
    };
    
    try {
        const data = await apiInstance.sendTransacEmail(sendSmtpEmail);
        console.log('✅ Password reset OTP sent! Message ID:', data.body.messageId);
        return { success: true, messageId: data.body.messageId };
    } catch (error) {
        console.error('❌ Brevo error:', error);
        return { success: false, error: error.message };
    }
};

module.exports = { sendEmailOtp, forgotPasswordOtp };
