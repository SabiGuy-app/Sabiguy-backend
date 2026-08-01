const test = require('node:test');
const assert = require('node:assert/strict');

const { createApp } = require('../src/app');
const authService = require('../src/modules/auth/auth.service');
const usersService = require('../src/modules/users/users.service');

test('createApp exposes an Express app instance', () => {
  const app = createApp();
  assert.ok(app);
  assert.equal(typeof app.use, 'function');
});

test('auth and users services expose their module entrypoints', () => {
  assert.equal(typeof authService.normalizeEmail, 'function');
  assert.equal(typeof usersService.getPagination, 'function');
});
