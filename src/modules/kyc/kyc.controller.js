const Buyer = require("../../../models/ServiceUser");
const Provider = require("../../../models/ServiceProvider");
const Business = require("../business/business.model");
const dojahService = require("../../services/dojah.service");

const accountModelByRole = {
  buyer: Buyer,
  provider: Provider,
  businessOwner: Business,
  business: Business,
};

const normalizeName = (value) =>
  String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");

async function verifyNin(req, res) {
  const nin = String(req.body?.nin || "").trim();
  if (!/^\d{11}$/.test(nin)) {
    return res.status(400).json({ success: false, message: "NIN must be exactly 11 digits" });
  }

  try {
    const Account = accountModelByRole[req.user.role];
    if (!Account) {
      return res.status(403).json({ success: false, message: "This account type cannot verify a NIN" });
    }

    const account = await Account.findById(req.user.id);
    if (!account) {
      return res.status(404).json({ success: false, message: "Account not found" });
    }

    const result = await dojahService.verifyNin(nin);
    const entity = result?.entity || result?.data?.entity;
    if (!entity || typeof entity !== "object") {
      return res.status(422).json({ success: false, message: "NIN could not be verified" });
    }

    const accountNameParts = normalizeName(account.fullName).split(" ").filter(Boolean);
    const accountFirstName = accountNameParts[0];
    const accountLastName = accountNameParts.at(-1);
    const dojahFirstName = normalizeName(entity.first_name);
    const dojahLastName = normalizeName(entity.last_name);
    if (!accountFirstName || !accountLastName || !dojahFirstName || !dojahLastName) {
      return res.status(409).json({
        success: false,
        message: "Add your full name to your profile before verifying your NIN",
      });
    }
    if (accountFirstName !== dojahFirstName || accountLastName !== dojahLastName) {
      return res.status(422).json({ success: false, message: "NIN details do not match your profile" });
    }

    account.ninVerified = true;
    account.ninVerifiedAt = new Date();
    account.nin = nin;
    if (typeof entity.photo === "string" && entity.photo.trim()) {
      account.ninImage = entity.photo;
    }
    await account.save();

    return res.status(200).json({
      success: true,
      message: "NIN verified successfully",
      data: { ninVerified: true, ninVerifiedAt: account.ninVerifiedAt },
    });
  } catch (error) {
    const status = error.statusCode || (error.response ? 502 : 500);
    console.error("Dojah NIN verification failed:", error.message);
    return res.status(status).json({
      success: false,
      message: status === 503 ? error.message : "NIN verification is temporarily unavailable",
    });
  }
}

module.exports = { verifyNin };
