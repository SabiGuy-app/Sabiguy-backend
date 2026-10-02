const test = require("node:test");
const assert = require("node:assert/strict");

const pricingService = require("../src/services/pricing.service");

test("service booking pricing adds 5% for the buyer and deducts 7% for the provider", () => {
  const pricing = pricingService.calculateServiceBookingPrice(10000);

  assert.equal(pricing.calculatedPrice, 10500);
  assert.equal(pricing.serviceFee, 500);
  assert.equal(pricing.providerCommission, 700);
  assert.equal(pricing.providerReceives, 9300);
  assert.equal(pricing.platformEarns, 1200);
  assert.equal(pricing.breakdown.subtotal, 10000);
});

test("service booking pricing rejects invalid base fees", () => {
  assert.throws(
    () => pricingService.calculateServiceBookingPrice(Number.NaN),
    /baseFee must be a non-negative number/,
  );
  assert.throws(
    () => pricingService.calculateServiceBookingPrice(-1),
    /baseFee must be a non-negative number/,
  );
});