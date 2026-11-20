const test = require('node:test');
const assert = require('node:assert/strict');

const {
  updateBuyerProfile,
  BuyerProfileValidationError,
} = require('../src/modules/users/users.service');

const BUYER_ID = '000000000000000000000000';

const rejects = (promise, messagePattern) =>
  promise.then(
    () => assert.fail('expected rejection'),
    (error) => {
      assert.ok(error instanceof BuyerProfileValidationError);
      assert.equal(error.statusCode, 400);
      assert.match(error.message, messagePattern);
    },
  );

test('updateBuyerProfile rejects empty payload before DB access', () => {
  return rejects(updateBuyerProfile(BUYER_ID, {}), /No valid fields provided/);
});

test('updateBuyerProfile rejects a malformed NIN', () => {
  return rejects(updateBuyerProfile(BUYER_ID, { nin: '1234' }), /nin must be exactly 11 digits/);
});

test('updateBuyerProfile rejects a non-boolean ninVerified value', () => {
  return rejects(
    updateBuyerProfile(BUYER_ID, { ninVerified: 'yes' }),
    /ninVerified must be a boolean/,
  );
});

test('updateBuyerProfile rejects an invalid ninVerifiedAt date', () => {
  return rejects(
    updateBuyerProfile(BUYER_ID, { ninVerifiedAt: 'not-a-date' }),
    /ninVerifiedAt must be a valid date-time/,
  );
});
