const test = require("node:test");
const assert = require("node:assert/strict");

const {
  getDashboardStats,
  getDashboardActivity,
} = require("../src/modules/business/dashboard.service");

const rejects = (promise, messagePattern) =>
  promise.then(
    () => assert.fail("expected rejection"),
    (error) => {
      assert.equal(error.name, "ValidationError");
      assert.match(error.message, messagePattern);
    },
  );

test("getDashboardStats rejects invalid business ID", () =>
  rejects(getDashboardStats("bad-id"), /Invalid business ID/));

test("getDashboardActivity rejects invalid business ID", () =>
  rejects(getDashboardActivity("bad-id"), /Invalid business ID/));
