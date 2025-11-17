
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
        name: "SabiGuy", 
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
        email: process.env.BREVO_SENDER_EMAIL  
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
