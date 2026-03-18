const path = require("path");
const brevo = require("@getbrevo/brevo");
const nunjucks = require("nunjucks");

const templatesPath = path.join(__dirname, "..", "templates", "emails");
const templateEnv = nunjucks.configure(templatesPath, {
    autoescape: true,
    noCache: process.env.NODE_ENV !== "production",
});

const apiInstance = new brevo.TransactionalEmailsApi();
apiInstance.setApiKey(
    brevo.TransactionalEmailsApiApiKeys.apiKey,
    process.env.BREVO_API_KEY
);

const senderEmail = (process.env.BREVO_SENDER_EMAIL || "").trim();
const sender = {
    name: "SabiGuy",
    email: senderEmail,
};

const renderEmailTemplate = (templateName, data = {}) => {
    const baseData = {
        brandName: "SabiGuy",
        logoUrl: process.env.SABIGUY_LOGO_URL || "",
        senderEmail,
        ...data,
    };

    return templateEnv.render(templateName, baseData);
};

const sendEmailOtp = async (email, otp) => {
    const sendSmtpEmail = new brevo.SendSmtpEmail();

    sendSmtpEmail.subject = "Welcome to SabiGuy - Verify Your Email";
    sendSmtpEmail.to = [{ email }];
    sendSmtpEmail.htmlContent = renderEmailTemplate("verification-otp.njk", {
        otp,
        expiryMinutes: 10,
        year: new Date().getFullYear(),
         supportMessage:
           "If you did not request this OTP, please ignore this email or contact support if you have concerns about your account security.",
    });
    sendSmtpEmail.sender = sender;

    try {
        const data = await apiInstance.sendTransacEmail(sendSmtpEmail);
        console.log("Email sent successfully. Message ID:", data.body.messageId);
        return { success: true, messageId: data.body.messageId };
    } catch (error) {
        console.error("Brevo error:", error);
        throw new Error(error.message || "Email send failed");
    }
};

const forgotPasswordOtp = async (email, otp) => {
    const sendSmtpEmail = new brevo.SendSmtpEmail();

    sendSmtpEmail.subject = "SabiGuy Password Reset";
    sendSmtpEmail.to = [{ email }];
    sendSmtpEmail.htmlContent = renderEmailTemplate("forgot-password-otp.njk", {
        otp,
        expiryMinutes: 10,
        year: new Date().getFullYear(),
    });
    sendSmtpEmail.sender = sender;

    try {
        const data = await apiInstance.sendTransacEmail(sendSmtpEmail);
        console.log("Password reset OTP sent. Message ID:", data.body.messageId);
        return { success: true, messageId: data.body.messageId };
    } catch (error) {
        console.error("Brevo error:", error);
        throw new Error(error.message || "Password reset email failed");
    }
};

const passwordChangedEmail = async (email, data = {}) => {
    const sendSmtpEmail = new brevo.SendSmtpEmail();

    sendSmtpEmail.subject = "Your SabiGuy Password Was Changed";
    sendSmtpEmail.to = [{ email }];
    sendSmtpEmail.htmlContent = renderEmailTemplate("password-changed.njk", {
      year: new Date().getFullYear(),
      ...data,
    });
    sendSmtpEmail.sender = sender;

    try {
        const data = await apiInstance.sendTransacEmail(sendSmtpEmail);
        console.log("Password change email sent. Message ID:", data.body.messageId);
        return { success: true, messageId: data.body.messageId };
    } catch (error) {
        console.error("Password change email error:", error);
        throw new Error(error.message || "Password change email failed");
    }
};

const sendWelcomeEmail = async (email, data = {}) => {
    const sendSmtpEmail = new brevo.SendSmtpEmail();

    sendSmtpEmail.subject = "Welcome to SabiGuy";
    sendSmtpEmail.to = [{ email }];
    sendSmtpEmail.htmlContent = renderEmailTemplate("welcome-onboard.njk", data);
    sendSmtpEmail.sender = sender;

    try {
        const dataResp = await apiInstance.sendTransacEmail(sendSmtpEmail);
        console.log("Welcome email sent. Message ID:", dataResp.body.messageId);
        return { success: true, messageId: dataResp.body.messageId };
    } catch (error) {
        console.error("Welcome email error:", error);
        throw new Error(error.message || "Welcome email failed");
    }
};

module.exports = { sendEmailOtp, forgotPasswordOtp, passwordChangedEmail, sendWelcomeEmail };
