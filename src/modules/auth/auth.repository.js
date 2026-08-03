const Provider = require('../../../models/ServiceProvider');
const Buyer = require('../../../models/ServiceUser');
const Admin = require('../admin/Admin.model');

const roleModelMap = {
  buyer: Buyer,
  provider: Provider,
  admin: Admin,
};

const findByEmail = async (role, email) => {
  const Model = roleModelMap[role];
  if (!Model) return null;
  return Model.findOne({ email: email.toLowerCase() });
};

const findById = async (role, id) => {
  const Model = roleModelMap[role];
  if (!Model) return null;
  return Model.findById(id);
};

module.exports = {
  roleModelMap,
  findByEmail,
  findById,
};
