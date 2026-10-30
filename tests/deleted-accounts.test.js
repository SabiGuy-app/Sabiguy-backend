const test = require('node:test');
const assert = require('node:assert/strict');

const DeletedAccount = require('../src/modules/admin/deletedAccount.model');
const AdminController = require('../src/modules/admin/admin.controller');

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

test('getDeletedAccounts returns paginated deleted accounts for admin', async () => {
  const origFind = DeletedAccount.find;
  const origCount = DeletedAccount.countDocuments;
  DeletedAccount.find = () => ({
    sort: () => ({
      skip: () => ({
        limit: () => ({
          lean: async () => [{ originalId: '1', userType: 'provider', email: 'p@test.com', data: {} }],
        }),
      }),
    }),
  });
  DeletedAccount.countDocuments = async () => 1;

  try {
    const req = { user: { role: 'admin' }, query: { userType: 'provider', email: 'P@TEST.COM' } };
    const res = withRes();
    await AdminController.getDeletedAccounts(req, res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.total, 1);
    assert.equal(Array.isArray(res.body.data), true);
  } finally {
    DeletedAccount.find = origFind;
    DeletedAccount.countDocuments = origCount;
  }
});
