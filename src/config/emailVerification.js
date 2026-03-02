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

    sendSmtpEmail.subject = "Your SabiGuy Verification Code";
    sendSmtpEmail.to = [{ email }];
    sendSmtpEmail.htmlContent = renderEmailTemplate("verification-otp.njk", {
        otp,
        expiryMinutes: 10,
    });
    sendSmtpEmail.sender = sender;

    try {
        const data = await apiInstance.sendTransacEmail(sendSmtpEmail);
        console.log("Email sent successfully. Message ID:", data.body.messageId);
        return { success: true, messageId: data.body.messageId };
    } catch (error) {
        console.error("Brevo error:", error);
        return { success: false, error: error.message };
    }
};

const forgotPasswordOtp = async (email, otp) => {
    const sendSmtpEmail = new brevo.SendSmtpEmail();

    sendSmtpEmail.subject = "SabiGuy Password Reset";
    sendSmtpEmail.to = [{ email }];
    sendSmtpEmail.htmlContent = renderEmailTemplate("forgot-password-otp.njk", {
        otp,
        expiryMinutes: 10,
    });
    sendSmtpEmail.sender = sender;

    try {
        const data = await apiInstance.sendTransacEmail(sendSmtpEmail);
        console.log("Password reset OTP sent. Message ID:", data.body.messageId);
        return { success: true, messageId: data.body.messageId };
    } catch (error) {
        console.error("Brevo error:", error);
        return { success: false, error: error.message };
    }
};

const passwordChangedEmail = async (email) => {
    const sendSmtpEmail = new brevo.SendSmtpEmail();

    sendSmtpEmail.subject = "Your SabiGuy Password Was Changed";
    sendSmtpEmail.to = [{ email }];
    sendSmtpEmail.htmlContent = renderEmailTemplate("password-changed.njk");
    sendSmtpEmail.sender = sender;

    try {
        const data = await apiInstance.sendTransacEmail(sendSmtpEmail);
        console.log("Password change email sent. Message ID:", data.body.messageId);
        return { success: true, messageId: data.body.messageId };
    } catch (error) {
        console.error("Password change email error:", error);
        return { success: false, error: error.message };
    }
};

module.exports = { sendEmailOtp, forgotPasswordOtp, passwordChangedEmail };
