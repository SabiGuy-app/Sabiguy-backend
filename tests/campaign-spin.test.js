const test = require("node:test");
const assert = require("node:assert/strict");

const { createApp } = require("../src/app");
const {
  SHIFT_PRIZES,
  getUsableCreditAmount,
} = require("../src/modules/campaigns/campaign.service");

test("SHIFT campaign prize inventory totals 350 outcomes and NGN50,000", () => {
  const outcomeCount = SHIFT_PRIZES.reduce(
    (sum, prize) => sum + prize.remaining,
    0,
  );
  const payout = SHIFT_PRIZES.reduce(
    (sum, prize) => sum + prize.amount * prize.remaining,
    0,
  );
  const winningOutcomes = SHIFT_PRIZES
    .filter((prize) => prize.amount > 0)
    .reduce((sum, prize) => sum + prize.remaining, 0);

  assert.equal(outcomeCount, 350);
  assert.equal(payout, 50000);
  assert.equal(winningOutcomes, 179);
});

test("promotional campaign routes load in the Express app", () => {
  const app = createApp();
  assert.ok(app);
  assert.equal(typeof app.use, "function");
});

test("campaign credit preview helper is exported", () => {
  assert.equal(typeof getUsableCreditAmount, "function");
});
