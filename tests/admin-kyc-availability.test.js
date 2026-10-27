const test = require("node:test");
const assert = require("node:assert/strict");

const Admin = require("../src/modules/admin/Admin.model");
const Provider = require("../models/ServiceProvider");
const Business = require("../src/modules/business/business.model");
const emailVerification = require("../src/config/emailVerification");

const originalSendProviderEmail = emailVerification.sendKycVerificationEmail;
const originalSendBusinessEmail =
  emailVerification.sendBusinessKycVerificationEmail;
emailVerification.sendKycVerificationEmail = async () => {};
emailVerification.sendBusinessKycVerificationEmail = async () => {};
const adminController = require("../src/modules/admin/admin.controller");
emailVerification.sendKycVerificationEmail = originalSendProviderEmail;
emailVerification.sendBusinessKycVerificationEmail = originalSendBusinessEmail;

const createResponse = () => ({
  statusCode: null,
  body: null,
  status(statusCode) {
    this.statusCode = statusCode;
    return this;
  },
  json(body) {
    this.body = body;
    return this;
  },
});

test("admin KYC verification enables provider and business availability", async () => {
  const originals = {
    adminFindById: Admin.findById,
    providerFindById: Provider.findById,
    businessFindById: Business.findById,
  };
  const admin = {
    _id: "64b000000000000000000010",
    email: "admin@example.com",
    fullName: "Admin",
  };
  const provider = {
    email: "provider@example.com",
    fullName: "Provider",
    availability: { isAvailable: false },
    async save() {},
  };
  const business = {
    email: "business@example.com",
    BusinessName: "Business",
    availability: { isAvailable: false },
    async save() {},
  };
  Admin.findById = async () => admin;
  Provider.findById = async () => provider;
  Business.findById = async () => business;

  try {
    const providerResponse = createResponse();
    await adminController.verifyKyc(
      {
        user: { id: admin._id, role: "admin" },
        params: { providerId: "64b000000000000000000011" },
        body: {},
      },
      providerResponse,
    );

    assert.equal(providerResponse.statusCode, 200);
    assert.equal(provider.kycVerified, true);
    assert.equal(provider.availability.isAvailable, true);
    assert.equal(provider.availability.lastUpdated, provider.kycVerifiedAt);
    assert.equal(
      providerResponse.body.data.availability.isAvailable,
      true,
    );

    const businessResponse = createResponse();
    await adminController.verifyBusinessKyc(
      {
        user: { id: admin._id, role: "admin" },
        params: { businessId: "64b000000000000000000012" },
        body: {},
      },
      businessResponse,
    );

    assert.equal(businessResponse.statusCode, 200);
    assert.equal(business.kycVerified, true);
    assert.equal(business.availability.isAvailable, true);
    assert.equal(business.availability.lastUpdated, business.kycVerifiedAt);
    assert.equal(
      businessResponse.body.data.availability.isAvailable,
      true,
    );
  } finally {
    Admin.findById = originals.adminFindById;
    Provider.findById = originals.providerFindById;
    Business.findById = originals.businessFindById;
  }
});
