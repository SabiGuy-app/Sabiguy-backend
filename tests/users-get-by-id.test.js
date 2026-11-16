const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');

const Buyer = require('../models/ServiceUser');
const Provider = require('../models/ServiceProvider');
const Business = require('../src/modules/business/business.model');
const Staff = require('../src/modules/business/staff.model');
const Product = require('../src/modules/products/product.model');
const { getUserById } = require('../src/modules/users/users.service');

test('getUserById returns invitation status on an invited provider account', async (t) => {
  const providerId = new mongoose.Types.ObjectId();
  const businessId = new mongoose.Types.ObjectId();
  const provider = {
    _id: providerId,
    email: 'provider@example.com',
    invitedBy: businessId,
    role: 'provider',
    toObject: () => ({
      _id: providerId,
      email: 'provider@example.com',
      invitedBy: businessId,
      role: 'provider',
    }),
  };
  const originals = {
    buyerFindById: Buyer.findById,
    providerFindById: Provider.findById,
    businessFindById: Business.findById,
    staffFind: Staff.find,
    staffFindOne: Staff.findOne,
    productFind: Product.find,
  };

  t.after(() => {
    Buyer.findById = originals.buyerFindById;
    Provider.findById = originals.providerFindById;
    Business.findById = originals.businessFindById;
    Staff.find = originals.staffFind;
    Staff.findOne = originals.staffFindOne;
    Product.find = originals.productFind;
  });

  Buyer.findById = () => ({ select: async () => null });
  Provider.findById = () => ({ select: async () => provider });
  Business.findById = () => ({ select: async () => null });
  Product.find = () => ({ sort: () => ({ lean: async () => [] }) });
  Staff.find = (query) => {
    assert.deepEqual(query, { provider: providerId, status: 'ACTIVE' });
    return {
      select: () => ({ lean: async () => [] }),
    };
  };
  Staff.findOne = (query) => {
    assert.deepEqual(query, { business: businessId, email: provider.email });
    return {
      select: () => ({ lean: async () => ({ status: 'DECLINED' }) }),
    };
  };

  const user = await getUserById(providerId.toString());

  assert.equal(user.status, 'DECLINED');
  assert.equal(user.staffId, null);
  assert.equal(user.staffCode, null);
  assert.deepEqual(user.staffMemberships, []);
});
