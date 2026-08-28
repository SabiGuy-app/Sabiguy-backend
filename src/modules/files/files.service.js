const fs = require("fs");
const cloudinary = require("../../cloudinary.js");
const filesRepository = require("./files.repository");

class NotFoundError extends Error {
  constructor(message) {
    super(message);
    this.name = "NotFoundError";
  }
}

class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = "ValidationError";
  }
}

exports.NotFoundError = NotFoundError;
exports.ValidationError = ValidationError;

const allowedCategories = [
  "profile_pictures",
  "work_visuals",
  "automobiles",
  "identity_docs",
  "certificates",
];

exports.uploadFile = async ({ email, rawCategory, file }) => {
  const category = allowedCategories.includes(rawCategory)
    ? rawCategory
    : "other_files";

  if (!email) {
    throw new ValidationError("Email is compulsory");
  }

  let user = await filesRepository.findBusinessByEmail(email);
  let role = "businessOwner";

  if (!user) {
    user = await filesRepository.findProviderByEmail(email);
    role = "provider";
  }

  if (!user) {
    user = await filesRepository.findBuyerByEmail(email);
    role = "buyer";
  }

  if (!user) {
    throw new NotFoundError("User not found");
  }

  if (!file) {
    throw new ValidationError("No file uploaded");
  }

  const filePath = file.path;

  const result = await cloudinary.uploader.upload(filePath, {
    folder: `SabiGuy/${role}/${category}`,
    resource_type: "auto",
  });

  fs.unlinkSync(filePath);

  const filePayload = {
    filename: file.originalname,
    url: result.secure_url,
    resource_type: result.resource_type,
    email,
    category,
  };

  if (role === "provider") {
    filePayload.provider = user._id;
  } else if (role === "buyer") {
    filePayload.buyer = user._id;
  } else if (role === "businessOwner") {
    filePayload.business = user._id;
  }

  const savedFile = await filesRepository.createFile(filePayload);

  if (role === "provider") {
    await filesRepository.pushFileToProvider(user._id, savedFile._id);
  } else if (role === "buyer") {
    await filesRepository.pushFileToBuyer(user._id, savedFile._id);
  } else if (role === "businessOwner") {
    await filesRepository.pushFileToBusiness(user._id, savedFile._id);
  }

  return savedFile;
};
