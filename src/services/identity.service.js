const Buyer = require('../../models/ServiceUser');
const Provider = require('../../models/ServiceProvider');
const Admin = require('../modules/admin/Admin.model');
const BusinessOwner = require('../modules/business/business.model');

const EMAIL_MODELS = [
  { role: 'buyer', model: Buyer },
  { role: 'provider', model: Provider },
  { role: 'admin', model: Admin },
  { role: 'businessOwner', model: BusinessOwner },
];

const PHONE_MODELS = [
  { role: 'buyer', model: Buyer },
  { role: 'provider', model: Provider },
  { role: 'businessOwner', model: BusinessOwner },
];

const ROLE_MODELS = Object.fromEntries(
  [...EMAIL_MODELS, ...PHONE_MODELS].map(({ role, model }) => [role, model]),
);

const normalizeEmail = (email) =>
  String(email || '')
    .trim()
    .toLowerCase();

const normalizePhoneNumber = (phoneNumber) =>
  String(phoneNumber || '')
    .trim()
    .replace(/[\s().-]/g, '');

const escapeRegex = (value) =>
  String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const buildLoosePhoneRegex = (phoneNumber) =>
  new RegExp(
    `^${String(phoneNumber)
      .trim()
      .split('')
      .map((char) => escapeRegex(char))
      .join('[\\s().-]*')}$`,
    'i',
  );

const findByEmailInModel = async (model, email) => {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) return null;

  const exactMatch = await model.findOne({ email: normalizedEmail });
  if (exactMatch) return exactMatch;

  return model.findOne({
    email: new RegExp(`^${escapeRegex(normalizedEmail)}$`, 'i'),
  });
};

const findByPhoneInModel = async (model, phoneNumber) => {
  const normalizedPhone = normalizePhoneNumber(phoneNumber);
  if (!normalizedPhone) return null;

  const exactMatch = await model.findOne({ phoneNumber: normalizedPhone });
  if (exactMatch) return exactMatch;

  return model.findOne({
    phoneNumber: buildLoosePhoneRegex(normalizedPhone),
  });
};

const findUserByEmailAcrossDb = async (email) => {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) return null;

  for (const entry of EMAIL_MODELS) {
    const user = await findByEmailInModel(entry.model, normalizedEmail);
    if (user) {
      return { user, role: entry.role, model: entry.model };
    }
  }

  return null;
};

const findEmailProfiles = async (email, roles = Object.keys(ROLE_MODELS)) => {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) return [];

  const profiles = await Promise.all(roles.map(async (role) => {
    const model = ROLE_MODELS[role];
    if (!model) return null;
    const user = await findByEmailInModel(model, normalizedEmail);
    return user ? { user, role, model } : null;
  }));
  return profiles.filter(Boolean);
};

const findUserByPhoneAcrossDb = async (phoneNumber) => {
  const normalizedPhone = normalizePhoneNumber(phoneNumber);
  if (!normalizedPhone) return null;

  for (const entry of PHONE_MODELS) {
    const user = await findByPhoneInModel(entry.model, normalizedPhone);
    if (user) {
      return { user, role: entry.role, model: entry.model };
    }
  }

  return null;
};

module.exports = {
  normalizeEmail,
  normalizePhoneNumber,
  findUserByEmailAcrossDb,
  findEmailProfiles,
  findUserByPhoneAcrossDb,
};
