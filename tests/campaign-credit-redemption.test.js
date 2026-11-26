const test = require("node:test");
const assert = require("node:assert/strict");

const PromotionalCredit = require("../src/modules/campaigns/PromotionalCredit.model");
const Wallet = require("../src/modules/wallet/Wallet.model");
const campaignService = require("../src/modules/campaigns/campaign.service");

test("campaign credits redeem in expiry order inside the supplied transaction", async () => {
  const originalFind = PromotionalCredit.find;
  const originalWalletUpdate = Wallet.updateOne;
  const session = { id: "product-order-session" };
  const credits = [
    {
      _id: "expires-first",
      remainingAmount: 500,
      usedAmount: 0,
      status: "active",
      async save(options) {
        assert.equal(options.session, session);
      },
    },
    {
      _id: "expires-next",
      remainingAmount: 200,
      usedAmount: 0,
      status: "active",
      async save(options) {
        assert.equal(options.session, session);
      },
    },
  ];

  PromotionalCredit.find = () => ({
    session(receivedSession) {
      assert.equal(receivedSession, session);
      return this;
    },
    sort(sortOrder) {
      assert.deepEqual(sortOrder, { expiresAt: 1 });
      return Promise.resolve(credits);
    },
  });
  Wallet.updateOne = async (filter, update, options) => {
    assert.deepEqual(filter, { ownerId: "buyer-id", ownerModel: "Buyer" });
    assert.deepEqual(update, {
      $inc: { "balance.bonus": -550, "balance.total": -550 },
    });
    assert.equal(options.session, session);
  };

  try {
    const result = await campaignService.consumeCredits(
      "buyer-id",
      550,
      "order-id",
      { session },
    );

    assert.deepEqual(result, {
      applied: 550,
      cashAmount: 0,
      redemptions: [
        { creditId: "expires-first", amount: 500 },
        { creditId: "expires-next", amount: 50 },
      ],
    });
    assert.equal(credits[0].remainingAmount, 0);
    assert.equal(credits[0].usedAmount, 500);
    assert.equal(credits[0].status, "used");
    assert.equal(credits[1].remainingAmount, 150);
    assert.equal(credits[1].usedAmount, 50);
    assert.equal(credits[1].status, "active");
  } finally {
    PromotionalCredit.find = originalFind;
    Wallet.updateOne = originalWalletUpdate;
  }
});
