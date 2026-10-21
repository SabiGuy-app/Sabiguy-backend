const Admin = require("../modules/admin/Admin.model");
const { sendAdminEventEmail } = require("../config/emailVerification");

const NOTIFIED_ADMIN_ROLES = ["super_admin", "verification_admin", "support_admin"];

const notifyAdminTeam = async ({ event, accountType, account, level }) => {
  try {
    if (!account?.email) return;

    const admins = await Admin.find({
      adminRole: { $in: NOTIFIED_ADMIN_ROLES },
      emailVerified: true,
      isActive: { $ne: false },
    }).select("email fullName adminRole").lean();

    const notification = {
      event,
      accountType,
      accountName: account.fullName || account.BusinessName || "Not provided",
      accountEmail: account.email,
      signupPlatform: account.signupPlatform || "unknown",
      businessCategory: accountType === "business"
        ? account.businessCategory || "Not provided"
        : null,
      jobServices: accountType === "provider"
        ? (account.job || []).map((job) => job.service).filter(Boolean).join(", ") || "Not provided"
        : null,
      services: (account.service || [])
        .map((service) => service.serviceName)
        .filter(Boolean)
        .join(", ") || "Not provided",
      level,
    };

    const results = await Promise.allSettled(
      admins.map((admin) => sendAdminEventEmail(admin.email, notification)),
    );
    results.forEach((result, index) => {
      if (result.status === "rejected") {
        console.error(`Admin notification email failed for ${admins[index].email}:`, result.reason);
      }
    });
  } catch (error) {
    console.error("Admin notification lookup failed:", error);
  }
};

const notifyKycCompleted = async (accountType, account, wasKycCompleted) => {
  if (wasKycCompleted || !account?.kycCompleted) return;
  await notifyAdminTeam({
    event: "kyc_completed",
    accountType,
    account,
  });
};

module.exports = {
  notifyAdminTeam,
  notifyKycCompleted,
  NOTIFIED_ADMIN_ROLES,
};
