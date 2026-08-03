const Buyer = require("../../../models/ServiceUser");
const Provider = require("../../../models/ServiceProvider");

// registerFCMDevice used role === 'buyer' ? Buyer : Provider
exports.updateFcmDeviceForRegister = (id, role, update) => {
  const Model = role === "buyer" ? Buyer : Provider;
  return Model.findByIdAndUpdate(id, update, { new: true });
};

// removeToken used role === 'provider' ? Provider : Buyer
exports.unsetFcmTokenForRemove = (id, role) => {
  const Model = role === "provider" ? Provider : Buyer;
  return Model.findByIdAndUpdate(id, { $unset: { fcmToken: 1 } });
};
