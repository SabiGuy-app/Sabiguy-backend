const File = require("./file.model");
const Provider = require("../../../models/ServiceProvider");
const Buyer = require("../../../models/ServiceUser");

exports.findProviderByEmail = (email) => Provider.findOne({ email });
exports.findBuyerByEmail = (email) => Buyer.findOne({ email });

exports.createFile = (filePayload) => File.create(filePayload);

exports.pushFileToProvider = (providerId, fileId) =>
  Provider.findByIdAndUpdate(providerId, { $push: { files: fileId } });

exports.pushFileToBuyer = (buyerId, fileId) =>
  Buyer.findByIdAndUpdate(buyerId, { $push: { files: fileId } });
