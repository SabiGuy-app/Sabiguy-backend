const test = require("node:test");
const assert = require("node:assert/strict");

const {
  updateBusinessServices,
  updateBusinessAvailableDays,
  updateBusinessServicePlace,
  updateBusinessHours,
  updateBusinessStudioImages,
  ValidationError,
} = require("../src/modules/business/business.service");

const BUSINESS_ID = "000000000000000000000000";

const rejects = (promise, messagePattern) =>
  promise.then(
    () => assert.fail("expected rejection"),
    (error) => {
      assert.ok(error instanceof ValidationError, "expected ValidationError");
      assert.match(error.message, messagePattern);
    },
  );

test("updateBusinessServices rejects missing service before DB access", () => {
  return rejects(
    updateBusinessServices(BUSINESS_ID, {}),
    /service must be an array/,
  );
});

test("updateBusinessServices rejects non-object service items", () => {
  return rejects(
    updateBusinessServices(BUSINESS_ID, { service: ["Haircut"] }),
    /service\[0\] must be an object/,
  );
});

test("updateBusinessAvailableDays rejects non-array", () => {
  return rejects(
    updateBusinessAvailableDays(BUSINESS_ID, { availableDays: "Mon" }),
    /availableDays must be an array/,
  );
});

test("updateBusinessAvailableDays rejects blank entries", () => {
  return rejects(
    updateBusinessAvailableDays(BUSINESS_ID, { availableDays: ["  "] }),
    /availableDays\[0\] must be a non-empty string/,
  );
});

test("updateBusinessServicePlace rejects non-array", () => {
  return rejects(
    updateBusinessServicePlace(BUSINESS_ID, {}),
    /servicePlace must be an array/,
  );
});

test("updateBusinessHours rejects empty payload", () => {
  return rejects(
    updateBusinessHours(BUSINESS_ID, {}),
    /No valid fields provided/,
  );
});

test("updateBusinessHours rejects non-string start", () => {
  return rejects(
    updateBusinessHours(BUSINESS_ID, { start: 5 }),
    /start must be a string/,
  );
});

test("updateBusinessStudioImages rejects non-array", () => {
  return rejects(
    updateBusinessStudioImages(BUSINESS_ID, {}),
    /studioImages must be an array/,
  );
});

test("updateBusinessStudioImages rejects non-object items", () => {
  return rejects(
    updateBusinessStudioImages(BUSINESS_ID, { studioImages: ["clip.mp4"] }),
    /studioImages\[0\] must be an object/,
  );
});
