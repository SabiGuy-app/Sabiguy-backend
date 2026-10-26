const test = require("node:test");
const assert = require("node:assert/strict");

const {
  updateBusinessProfile,
  updateBusinessOperatingDefaults,
  updateBusinessPayoutAccount,
  updateBusinessPayoutSchedule,
  ValidationError,
} = require("../src/modules/business/business.service");

const BUSINESS_ID = "000000000000000000000000";

const rejects = (promise, messagePattern) =>
  promise.then(
    () => assert.fail("expected rejection"),
    (error) => {
      assert.ok(error instanceof ValidationError, `expected ValidationError`);
      assert.match(error.message, messagePattern);
    },
  );

test("updateBusinessProfile rejects empty payload before DB access", () => {
  return rejects(
    updateBusinessProfile(BUSINESS_ID, {}),
    /No valid fields provided/,
  );
});

test("updateBusinessProfile rejects blank businessName", () => {
  return rejects(
    updateBusinessProfile(BUSINESS_ID, { businessName: "   " }),
    /businessName must be a non-empty string/,
  );
});

test("updateBusinessProfile rejects non-string businessAddress", () => {
  return rejects(
    updateBusinessProfile(BUSINESS_ID, { businessAddress: 42 }),
    /businessAddress must be a string/,
  );
});

test("updateBusinessProfile rejects invalid location coordinates", () => {
  return rejects(
    updateBusinessProfile(BUSINESS_ID, { latitude: 91, longitude: 3 }),
    /latitude and longitude must be valid coordinates/,
  );
});

test("updateBusinessProfile requires latitude and longitude together", () => {
  return rejects(
    updateBusinessProfile(BUSINESS_ID, { latitude: 6 }),
    /latitude and longitude must be valid coordinates/,
  );
});

test("updateBusinessOperatingDefaults rejects invalid weekStarts", () => {
  return rejects(
    updateBusinessOperatingDefaults(BUSINESS_ID, { weekStarts: "Funday" }),
    /weekStarts must be a weekday name/,
  );
});

test("updateBusinessOperatingDefaults rejects empty payload", () => {
  return rejects(
    updateBusinessOperatingDefaults(BUSINESS_ID, {}),
    /No valid fields provided/,
  );
});

test("updateBusinessPayoutAccount rejects malformed accountNumber", () => {
  return rejects(
    updateBusinessPayoutAccount(BUSINESS_ID, { accountNumber: "12ab" }),
    /accountNumber must be a valid bank account number/,
  );
});

test("updateBusinessPayoutAccount rejects blank bankName", () => {
  return rejects(
    updateBusinessPayoutAccount(BUSINESS_ID, { bankName: "" }),
    /bankName must be a non-empty string/,
  );
});

test("updateBusinessPayoutSchedule rejects non-boolean automatic", () => {
  return rejects(
    updateBusinessPayoutSchedule(BUSINESS_ID, { automatic: "yes" }),
    /automatic must be a boolean/,
  );
});

test("updateBusinessPayoutSchedule rejects negative minimumThreshold", () => {
  return rejects(
    updateBusinessPayoutSchedule(BUSINESS_ID, { minimumThreshold: -5 }),
    /minimumThreshold must be a non-negative number/,
  );
});

test("updateBusinessPayoutSchedule rejects invalid day", () => {
  return rejects(
    updateBusinessPayoutSchedule(BUSINESS_ID, { day: "Sometime" }),
    /day must be a weekday name/,
  );
});
