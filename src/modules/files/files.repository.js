const File = require("./file.model");
const Provider = require("../../../models/ServiceProvider");
const Buyer = require("../../../models/ServiceUser");
const Business = require ("../business/business.model")

const normalizeEmail = (email) =>
  String(email || "")
    .trim()
    .toLowerCase();

exports.findProviderByEmail = (email) =>
  Provider.findOne({ email: normalizeEmail(email) });
exports.findBuyerByEmail = (email) =>
  Buyer.findOne({ email: normalizeEmail(email) });
exports.findBusinessByEmail = (email) =>
  Business.findOne({ email: normalizeEmail(email) });

exports.createFile = (filePayload) => File.create(filePayload);

exports.pushFileToProvider = (providerId, fileId) =>
  Provider.findByIdAndUpdate(providerId, { $push: { files: fileId } });

exports.pushFileToBuyer = (buyerId, fileId) =>
  Buyer.findByIdAndUpdate(buyerId, { $push: { files: fileId } });

exports.pushFileToBusiness = (businessId, fileId) =>
  Business.findByIdAndUpdate(businessId, { $push: { files: fileId } });
