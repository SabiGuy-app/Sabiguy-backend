const test = require("node:test");
const assert = require("node:assert/strict");

const {
  normalizeFundingEntries,
} = require("../src/modules/wallet/adminWalletFunding.service");
const {
  AdminWalletFundingService,
} = require("../src/modules/wallet/adminWalletFunding.service");
const AdminWalletFundingController = require("../src/modules/wallet/adminWalletFunding.controller");
const onlyRole = require("../middleware/roleMiddleware");
const { swaggerSpec } = require("../src/config/swagger");

test("normalizes buyer emails and totals per-buyer amounts", () => {
  const result = normalizeFundingEntries([
    { email: "  Buyer@One.com ", amount: 5000 },
    { email: "buyer.two@example.com", amount: 2500 },
  ]);

  assert.deepEqual(result, {
    entries: [
      { email: "buyer@one.com", amount: 5000 },
      { email: "buyer.two@example.com", amount: 2500 },
    ],
    totalAmount: 7500,
  });
});

test("rejects duplicate buyer emails regardless of case", () => {
  assert.throws(
    () =>
      normalizeFundingEntries([
        { email: "buyer@example.com", amount: 1000 },
        { email: "BUYER@example.com", amount: 2000 },
      ]),
    /appears more than once/,
  );
});

test("rejects non-whole or non-positive amounts", () => {
  assert.throws(
    () =>
      normalizeFundingEntries([
        { email: "buyer@example.com", amount: 1000.5 },
      ]),
    /positive whole number/,
  );
});

test("restricts wallet funding to finance admins and super admins", () => {
  const runRoleCheck = (adminRole) => {
    let statusCode;
    let nextCalled = false;
    const req = {
      user: { role: "admin", adminRole },
      path: "/wallet/funding-batches",
    };
    const res = {
      status(code) {
        statusCode = code;
        return this;
      },
      json() {
        return this;
      },
    };

    onlyRole("admin")(req, res, () => {
      nextCalled = true;
    });
    return { statusCode, nextCalled };
  };

  assert.deepEqual(runRoleCheck("finance_admin"), {
    statusCode: undefined,
    nextCalled: true,
  });
  assert.deepEqual(runRoleCheck("operations_admin"), {
    statusCode: 403,
    nextCalled: false,
  });
  assert.deepEqual(runRoleCheck("super_admin"), {
    statusCode: undefined,
    nextCalled: true,
  });
});

test("documents all wallet funding routes and their authentication modes", () => {
  const paths = swaggerSpec.paths;
  assert.ok(paths["/api/v1/admin/wallet/funding-batches"]?.post);
  assert.ok(paths["/api/v1/admin/wallet/funding-batches/{reference}"]?.get);
  assert.ok(
    paths["/api/v1/admin/wallet/funding-batches/{reference}/verify"]?.post,
  );
  assert.deepEqual(
    paths["/api/v1/admin/wallet/funding-batches/paystack-callback"].get.security,
    [],
  );
  assert.ok(
    swaggerSpec.components.schemas.AdminWalletFundingBatchResponse,
  );
});

test("Paystack callback verifies and redirects with the batch reference and status", async () => {
  const originalFrontendUrl = process.env.FRONTEND_URL;
  const originalVerifyBatch = AdminWalletFundingService.verifyBatch;
  const originalGetBatch = AdminWalletFundingService.getBatch;
  process.env.FRONTEND_URL = "https://admin.example.com/";
  AdminWalletFundingService.verifyBatch = async () => {};
  AdminWalletFundingService.getBatch = async () => ({
    reference: "AWF_test_reference",
    status: "completed",
  });

  try {
    let redirectStatus;
    let redirectLocation;
    const res = {
      redirect(status, location) {
        redirectStatus = status;
        redirectLocation = location;
        return this;
      },
    };

    await AdminWalletFundingController.paystackCallback(
      { query: { reference: "AWF_test_reference" } },
      res,
    );

    const redirectUrl = new URL(redirectLocation);
    assert.equal(redirectStatus, 303);
    assert.equal(
      redirectUrl.searchParams.get("walletFundingReference"),
      "AWF_test_reference",
    );
    assert.equal(
      redirectUrl.searchParams.get("walletFundingStatus"),
      "completed",
    );
  } finally {
    AdminWalletFundingService.verifyBatch = originalVerifyBatch;
    AdminWalletFundingService.getBatch = originalGetBatch;
    if (originalFrontendUrl === undefined) {
      delete process.env.FRONTEND_URL;
    } else {
      process.env.FRONTEND_URL = originalFrontendUrl;
    }
  }
});

test("Express create handler builds callback URL without relying on this", async () => {
  const originalApiBaseUrl = process.env.API_BASE_URL;
  const originalCreateBatch = AdminWalletFundingService.createBatch;
  delete process.env.API_BASE_URL;
  let receivedInput;
  AdminWalletFundingService.createBatch = async (input) => {
    receivedInput = input;
    return { reference: "AWF_test_reference" };
  };

  try {
    let responseBody;
    const res = {
      status() {
        return this;
      },
      json(body) {
        responseBody = body;
        return this;
      },
    };

    await AdminWalletFundingController.createBatch(
      {
        protocol: "https",
        get: () => "api.example.com",
        user: { id: "admin-id", email: "admin@example.com" },
        body: { entries: [], reason: "test" },
      },
      res,
    );

    assert.equal(responseBody.success, true);
    assert.equal(
      receivedInput.callbackUrl,
      "https://api.example.com/api/v1/admin/wallet/funding-batches/paystack-callback",
    );
  } finally {
    AdminWalletFundingService.createBatch = originalCreateBatch;
    if (originalApiBaseUrl === undefined) {
      delete process.env.API_BASE_URL;
    } else {
      process.env.API_BASE_URL = originalApiBaseUrl;
    }
  }
});
