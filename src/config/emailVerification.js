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
  process.env.BREVO_API_KEY,
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

const sendNinSubmittedEmail = async (email, data = {}) => {
  const sendSmtpEmail = new brevo.SendSmtpEmail();

  sendSmtpEmail.subject = "Your SabiGuy NIN is Under Review";
  sendSmtpEmail.to = [{ email }];
  sendSmtpEmail.htmlContent = renderEmailTemplate("nin-submitted.njk", {
    firstName: data.firstName || "there",
    year: new Date().getFullYear(),
    ...data,
  });
  sendSmtpEmail.sender = sender;

  try {
    const result = await apiInstance.sendTransacEmail(sendSmtpEmail);
    console.log("NIN submitted email sent. Message ID:", result.body.messageId);
    return { success: true, messageId: result.body.messageId };
  } catch (error) {
    console.error("NIN submitted email error:", error);
    throw new Error(error.message || "NIN submitted email failed");
  }
};

const sendKycVerificationEmail = async (email, data = {}) => {
  const sendSmtpEmail = new brevo.SendSmtpEmail();

  sendSmtpEmail.subject = "Your KYC Verification is Approved! 🎉";
  sendSmtpEmail.to = [{ email }];
  sendSmtpEmail.htmlContent = renderEmailTemplate("kyc-verified.njk", {
    providerName: data.providerName || "Service Provider",
    note: data.note || "",
    platformUrl:
      data.platformUrl || process.env.PLATFORM_URL || "https://sabiguy.com",
    year: new Date().getFullYear(),
    ...data,
  });
  sendSmtpEmail.sender = sender;

  try {
    const result = await apiInstance.sendTransacEmail(sendSmtpEmail);
    console.log(
      "KYC verification email sent. Message ID:",
      result.body.messageId,
    );
    return { success: true, messageId: result.body.messageId };
  } catch (error) {
    console.error("KYC verification email error:", error);
    throw new Error(error.message || "KYC verification email failed");
  }
};

const sendKycDisputeEmail = async (email, data = {}) => {
  const sendSmtpEmail = new brevo.SendSmtpEmail();

  sendSmtpEmail.subject = "KYC Verification Update - Action Required";
  sendSmtpEmail.to = [{ email }];
  sendSmtpEmail.htmlContent = renderEmailTemplate("kyc-disputed.njk", {
    providerName: data.providerName || "Service Provider",
    reason:
      data.reason ||
      "The information provided does not meet our verification requirements.",
    note: data.note || "",
    platformUrl:
      data.platformUrl || process.env.PLATFORM_URL || "https://sabiguy.com",
    supportEmail:
      data.supportEmail || process.env.SUPPORT_EMAIL || "support@sabiguy.com",
    year: new Date().getFullYear(),
    ...data,
  });
  sendSmtpEmail.sender = sender;

  try {
    const result = await apiInstance.sendTransacEmail(sendSmtpEmail);
    console.log("KYC dispute email sent. Message ID:", result.body.messageId);
    return { success: true, messageId: result.body.messageId };
  } catch (error) {
    console.error("KYC dispute email error:", error);
    throw new Error(error.message || "KYC dispute email failed");
  }
};

const sendDriverInvitationEmail = async (email, data = {}) => {
  const sendSmtpEmail = new brevo.SendSmtpEmail();

  const businessName = data.businessName || "a business";

  sendSmtpEmail.subject = `You've been invited to join ${businessName} as a driver`;
  sendSmtpEmail.to = [{ email }];
  sendSmtpEmail.htmlContent = renderEmailTemplate("driver-invitation.njk", {
    driverName: data.driverName || "there",
    businessName,
    inviteLink: data.inviteLink,
    expiryDays: data.expiryDays || 7,
    year: new Date().getFullYear(),
    ...data,
  });
  sendSmtpEmail.sender = sender;

  try {
    const result = await apiInstance.sendTransacEmail(sendSmtpEmail);
    console.log(
      "Driver invitation email sent. Message ID:",
      result.body.messageId,
    );
    return { success: true, messageId: result.body.messageId };
  } catch (error) {
    console.error("Driver invitation email error:", error);
    throw new Error(error.message || "Driver invitation email failed");
  }
};

module.exports = {
  sendEmailOtp,
  forgotPasswordOtp,
  passwordChangedEmail,
  sendWelcomeEmail,
  sendNinSubmittedEmail,
  sendKycVerificationEmail,
  sendKycDisputeEmail,
  sendDriverInvitationEmail,
};
