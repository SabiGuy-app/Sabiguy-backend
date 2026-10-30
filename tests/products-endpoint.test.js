const test = require('node:test');
const assert = require('node:assert/strict');

const { getProducts } = require('../src/modules/products/product.controller');
const Product = require('../src/modules/products/product.model');

const withRes = () => {
  const res = {};
  res.status = (code) => {
    res.statusCode = code;
    return res;
  };
  res.json = (body) => {
    res.body = body;
    return res;
  };
  return res;
};

test('GET /products defaults to pending for owner', async () => {
  const origFind = Product.find;
  let filterUsed;
  Product.find = (filter) => {
    filterUsed = filter;
    return {
      sort: () => ({
        lean: async () => [{ name: 'Test', status: 'pending' }],
      }),
    };
  };

  try {
    const req = { user: { id: 'u1', role: 'provider' }, query: {} };
    const res = withRes();
    await getProducts(req, res);
    assert.equal(res.statusCode, 200);
    assert.equal(filterUsed.status, 'pending');
    assert.equal(filterUsed.owner, 'u1');
    assert.equal(filterUsed.ownerModel, 'Provider');
  } finally {
    Product.find = origFind;
  }
});

test('GET /products accepts status filter for owner', async () => {
  const origFind = Product.find;
  let filterUsed;
  Product.find = (filter) => {
    filterUsed = filter;
    return {
      sort: () => ({
        lean: async () => [],
      }),
    };
  };

  try {
    const req = { user: { id: 'b1', role: 'businessOwner' }, query: { status: 'approved' } };
    const res = withRes();
    await getProducts(req, res);
    assert.equal(res.statusCode, 200);
    assert.equal(filterUsed.status, 'approved');
    assert.equal(filterUsed.ownerModel, 'Business');
  } finally {
    Product.find = origFind;
  }
});

test('GET /products allows admin and uses status filter', async () => {
  const origFind = Product.find;
  let filterUsed;
  Product.find = (filter) => {
    filterUsed = filter;
    return {
      populate: () => ({
        sort: () => ({
          lean: async () => [],
        }),
      }),
    };
  };

  try {
    const req = { user: { role: 'admin' }, query: { status: 'rejected' } };
    const res = withRes();
    await getProducts(req, res);
    assert.equal(res.statusCode, 200);
    assert.equal(filterUsed.status, 'rejected');
  } finally {
    Product.find = origFind;
  }
});
