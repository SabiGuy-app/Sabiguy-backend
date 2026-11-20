const Buyer = require("../../../models/ServiceUser");
const Provider = require("../../../models/ServiceProvider");
const Business = require("../business/business.model");
const dojahService = require("../../services/dojah.service");
const cloudinary = require("../../cloudinary");

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

function getImageDataUri(photo) {
  if (typeof photo !== "string" || !photo.trim()) return null;

  let base64 = photo.trim();
  const dataUriMatch = base64.match(/^data:image\/(jpeg|png|webp);base64,([\s\S]+)$/i);
  if (dataUriMatch) base64 = dataUriMatch[2];
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(base64) || base64.length % 4 === 1) {
    throw new Error("Dojah returned an invalid base64 image");
  }

  const imageBuffer = Buffer.from(base64, "base64");
  if (!imageBuffer.length || imageBuffer.length > 10 * 1024 * 1024) {
    throw new Error("Dojah returned an empty or oversized image");
  }

  let mimeType;
  if (imageBuffer[0] === 0xff && imageBuffer[1] === 0xd8 && imageBuffer[2] === 0xff) {
    mimeType = "image/jpeg";
  } else if (
    imageBuffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  ) {
    mimeType = "image/png";
  } else if (
    imageBuffer.toString("ascii", 0, 4) === "RIFF" &&
    imageBuffer.toString("ascii", 8, 12) === "WEBP"
  ) {
    mimeType = "image/webp";
  } else {
    throw new Error("Dojah returned an unsupported image format");
  }

  return `data:${mimeType};base64,${imageBuffer.toString("base64")}`;
}

async function uploadNinImage(photo, role, accountId) {
  const dataUri = getImageDataUri(photo);
  if (!dataUri) return null;

  const result = await cloudinary.uploader.upload(dataUri, {
    folder: `SabiGuy/${role}/identity_docs/nin`,
    public_id: String(accountId),
    overwrite: true,
    invalidate: true,
    resource_type: "image",
  });
  return result.secure_url;
}

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

    const ninImage = await uploadNinImage(entity.photo, req.user.role, account._id);
    account.ninVerified = true;
    account.ninVerifiedAt = new Date();
    account.nin = nin;
    if (ninImage) account.ninImage = ninImage;
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
