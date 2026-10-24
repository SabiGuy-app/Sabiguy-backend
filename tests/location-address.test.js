const test = require("node:test");
const assert = require("node:assert/strict");

const geolocationService = require("../src/services/geolocation.service");
const businessRepository = require("../src/modules/business/business.repository");
const {
  updateBusinessLocation,
  ForbiddenError,
} = require("../src/modules/business/business.service");

const Buyer = require("../models/ServiceUser");
const { updateUserLocation } = require("../src/modules/users/users.service");

const BUSINESS_ID = "64b000000000000000000001";
const BUYER_ID = "64e000000000000000000001";
const CACHED = {
  address: "12 Admiralty Way, Lekki Phase 1, Lagos",
  coordinates: [3.4723, 6.4474], // [lng, lat]
};

// Replaces reverseGeocode for the duration of a test, counting calls.
const withGeocode = async (impl, run) => {
  const original = geolocationService.reverseGeocode;
  const calls = [];
  geolocationService.reverseGeocode = async (...args) => {
    calls.push(args);
    return impl(...args);
  };
  try {
    await run(calls);
  } finally {
    geolocationService.reverseGeocode = original;
  }
};

test("stationary heartbeat reuses the cached address (was null)", async () => {
  await withGeocode(
    () => assert.fail("should not geocode"),
    async () => {
      const address = await geolocationService.resolveLocationAddress({
        latitude: 6.4475, // ~10m away
        longitude: 3.4723,
        existingLocation: CACHED,
      });
      assert.equal(address, CACHED.address);
    },
  );
});

test("an address sent by the app wins", async () => {
  await withGeocode(
    () => assert.fail("should not geocode"),
    async () => {
      const address = await geolocationService.resolveLocationAddress({
        latitude: 6.5,
        longitude: 3.4,
        providedAddress: "  5 Allen Avenue, Ikeja ",
        existingLocation: CACHED,
      });
      assert.equal(address, "5 Allen Avenue, Ikeja");
    },
  );
});

test("a raw 'lat, lng' address from the app is ignored", async () => {
  await withGeocode(
    async () => ({ formattedAddress: "Ikeja, Lagos" }),
    async (calls) => {
      const address = await geolocationService.resolveLocationAddress({
        latitude: 6.6,
        longitude: 3.35,
        providedAddress: "6.6, 3.35",
      });
      assert.equal(address, "Ikeja, Lagos");
      assert.equal(calls.length, 1);
    },
  );
});

test("moving more than 500m re-geocodes", async () => {
  await withGeocode(
    async () => ({ formattedAddress: "Victoria Island, Lagos" }),
    async (calls) => {
      const address = await geolocationService.resolveLocationAddress({
        latitude: 6.4281,
        longitude: 3.4219, // ~5km away
        existingLocation: CACHED,
      });
      assert.equal(address, "Victoria Island, Lagos");
      assert.equal(calls.length, 1);
    },
  );
});

test("geocode failure falls back to the cache, then to coordinates", async () => {
  await withGeocode(
    async () => {
      throw new Error("quota");
    },
    async () => {
      assert.equal(
        await geolocationService.resolveLocationAddress({
          latitude: 6.4281,
          longitude: 3.4219,
          existingLocation: CACHED,
        }),
        CACHED.address,
      );
      assert.equal(
        await geolocationService.resolveLocationAddress({
          latitude: 6.4281,
          longitude: 3.4219,
        }),
        "6.4281, 3.4219",
      );
    },
  );
});

test("updateUserLocation keeps a stationary buyer's address without geocoding", async () => {
  const originalFindById = Buyer.findById;
  const originalUpdate = Buyer.findByIdAndUpdate;
  let saved;
  Buyer.findById = async () => ({ currentLocation: CACHED });
  Buyer.findByIdAndUpdate = async (id, update) => {
    saved = update.$set;
    return {
      currentLocation: { address: update.$set["currentLocation.address"] },
      lastLocationUpdate: update.$set.lastLocationUpdate,
    };
  };

  try {
    await withGeocode(
      () => assert.fail("should not geocode"),
      async () => {
        const result = await updateUserLocation(BUYER_ID, {
          latitude: 6.4475,
          longitude: 3.4723,
        });
        assert.equal(saved["currentLocation.address"], CACHED.address);
        assert.equal(result.data.currentLocation.address, CACHED.address);
      },
    );
  } finally {
    Buyer.findById = originalFindById;
    Buyer.findByIdAndUpdate = originalUpdate;
  }
});

test("updateBusinessLocation requires verified KYC", async () => {
  const originalFind = businessRepository.findBusinessById;
  businessRepository.findBusinessById = async () => ({ kycVerified: false });
  try {
    await assert.rejects(
      updateBusinessLocation(BUSINESS_ID, { latitude: 6.5, longitude: 3.4 }),
      (error) =>
        error instanceof ForbiddenError &&
        /KYC verification required/.test(error.message),
    );
  } finally {
    businessRepository.findBusinessById = originalFind;
  }
});

test("updateBusinessLocation saves the resolved address", async () => {
  const originalFind = businessRepository.findBusinessById;
  const originalSave = businessRepository.saveBusinessDetails;
  let saved;
  businessRepository.findBusinessById = async () => ({
    kycVerified: true,
    currentLocation: CACHED,
  });
  businessRepository.saveBusinessDetails = async (id, updates) => {
    saved = updates;
    return {
      currentLocation: {
        type: "Point",
        coordinates: updates["currentLocation.coordinates"],
        address: updates["currentLocation.address"],
      },
      lastLocationUpdate: updates.lastLocationUpdate,
      isOnline: true,
      lastSeenAt: updates.lastSeenAt,
    };
  };

  try {
    await withGeocode(
      () => assert.fail("should not geocode"),
      async () => {
        const result = await updateBusinessLocation(BUSINESS_ID, {
          latitude: "6.4475",
          longitude: "3.4723",
        });
        assert.equal(saved["currentLocation.address"], CACHED.address);
        assert.deepEqual(saved["currentLocation.coordinates"], [3.4723, 6.4475]);
        assert.equal(result.currentLocation.address, CACHED.address);
      },
    );
  } finally {
    businessRepository.findBusinessById = originalFind;
    businessRepository.saveBusinessDetails = originalSave;
  }
});
