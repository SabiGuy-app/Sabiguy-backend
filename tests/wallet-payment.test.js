const test = require("node:test");
const assert = require("node:assert/strict");

const Booking = require("../src/modules/bookings/Bookings.model.js");
const WalletController = require("../src/modules/wallet/wallet.controller.js");
const WalletService = require("../src/modules/wallet/wallet.service.js");

const createResponse = () => ({
  statusCode: null,
  body: null,
  status(code) {
    this.statusCode = code;
    return this;
  },
  json(body) {
    this.body = body;
    return this;
  },
});

test("wallet payment accepts a booking assigned to either a provider or business", async () => {
  const originalFindById = Booking.findById;
  const originalPayFromWallet = WalletService.payFromWallet;
  const recipients = [];
  WalletService.payFromWallet = async (...args) => {
    recipients.push(args[1]);
    return {
      booking: {},
      transaction: {},
      wallet: { balance: { available: 0, pending: 0, total: 0 } },
    };
  };

  try {
    for (const assignment of [
      { providerId: "provider-id", businessId: null },
      { providerId: null, businessId: "business-id" },
    ]) {
      Booking.findById = async () => ({
        userId: "buyer-id",
        ...assignment,
        pricingBreakdown: { riderPaysFinal: 1000 },
      });
      const response = createResponse();

      await WalletController.payFromWallet(
        { user: { id: "buyer-id" }, body: { bookingId: "booking-id" } },
        response,
      );

      assert.equal(response.statusCode, 200);
      assert.equal(response.body.success, true);
    }

    assert.deepEqual(recipients, ["provider-id", null]);
  } finally {
    Booking.findById = originalFindById;
    WalletService.payFromWallet = originalPayFromWallet;
  }
});

test("wallet payment rejects a booking with no provider or business assigned", async () => {
  const originalFindById = Booking.findById;
  const originalPayFromWallet = WalletService.payFromWallet;
  let paymentCalled = false;
  Booking.findById = async () => ({
    userId: "buyer-id",
    providerId: null,
    businessId: null,
  });
  WalletService.payFromWallet = async () => {
    paymentCalled = true;
  };

  try {
    const response = createResponse();

    await WalletController.payFromWallet(
      { user: { id: "buyer-id" }, body: { bookingId: "booking-id" } },
      response,
    );

    assert.equal(response.statusCode, 400);
    assert.equal(paymentCalled, false);
  } finally {
    Booking.findById = originalFindById;
    WalletService.payFromWallet = originalPayFromWallet;
  }
});

test("wallet payment returns a clear insufficient-funds response", async () => {
  const originalFindById = Booking.findById;
  const originalPayFromWallet = WalletService.payFromWallet;
  Booking.findById = async () => ({
    userId: "buyer-id",
    providerId: "provider-id",
    businessId: null,
    pricingBreakdown: { riderPaysFinal: 5000 },
  });
  WalletService.payFromWallet = async () => {
    const error = new Error(
      "Your NGN2,000 promotional credit will remain available. Add NGN500 to your wallet to complete this booking.",
    );
    error.statusCode = 400;
    error.code = "INSUFFICIENT_WALLET_BALANCE";
    error.details = {
      amountDueAfterPromo: 3000,
      walletAvailable: 2500,
      shortfallAmount: 500,
      promotionalCreditApplied: 2000,
    };
    throw error;
  };

  try {
    const response = createResponse();
    await WalletController.payFromWallet(
      { user: { id: "buyer-id" }, body: { bookingId: "booking-id" } },
      response,
    );

    assert.equal(response.statusCode, 400);
    assert.equal(response.body.code, "INSUFFICIENT_WALLET_BALANCE");
    assert.match(response.body.message, /Add NGN500 to your wallet/);
    assert.match(response.body.message, /credit will remain available/);
    assert.equal(response.body.data.shortfallAmount, 500);
    assert.equal(response.body.data.promotionalCreditApplied, 2000);
  } finally {
    Booking.findById = originalFindById;
    WalletService.payFromWallet = originalPayFromWallet;
  }
});
