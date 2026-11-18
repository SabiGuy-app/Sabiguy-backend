const test = require("node:test");
const assert = require("node:assert/strict");

const Provider = require("../models/ServiceProvider");
const providerController = require("../src/modules/provider/provider.controller");

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

test("editProfilePicture rejects providers whose KYC is not verified", async () => {
  const originalFindById = Provider.findById;
  let saveCalled = false;
  const provider = {
    kycVerified: false,
    profilePicture: "https://cdn.com/profile/old.jpg",
    async save() {
      saveCalled = true;
    },
  };
  Provider.findById = async () => provider;

  try {
    const response = createResponse();
    await providerController.editProfilePicture(
      {
        user: { id: "provider-id" },
        body: { imageUrl: "https://cdn.com/profile/new.jpg" },
      },
      response,
    );

    assert.equal(response.statusCode, 403);
    assert.deepEqual(response.body, {
      success: false,
      message:
        "You will only be able to update your profile picture once your account is verified",
    });
    assert.equal(provider.profilePicture, "https://cdn.com/profile/old.jpg");
    assert.equal(saveCalled, false);
  } finally {
    Provider.findById = originalFindById;
  }
});

test("editProfilePicture updates the picture when KYC is verified", async () => {
  const originalFindById = Provider.findById;
  let saveCalled = false;
  const provider = {
    kycVerified: true,
    profilePicture: "https://cdn.com/profile/old.jpg",
    async save() {
      saveCalled = true;
    },
  };
  Provider.findById = async () => provider;

  try {
    const response = createResponse();
    await providerController.editProfilePicture(
      {
        user: { id: "provider-id" },
        body: { imageUrl: "https://cdn.com/profile/new.jpg" },
      },
      response,
    );

    assert.equal(response.statusCode, 200);
    assert.equal(provider.profilePicture, "https://cdn.com/profile/new.jpg");
    assert.equal(saveCalled, true);
  } finally {
    Provider.findById = originalFindById;
  }
});
