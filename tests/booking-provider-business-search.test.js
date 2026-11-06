const test = require("node:test");
const assert = require("node:assert/strict");

const bookingController = require("../src/modules/bookings/bookings.controller");
const Booking = require("../src/modules/bookings/Bookings.model");
const Business = require("../src/modules/business/business.model");
const Provider = require("../models/ServiceProvider");
const Staff = require("../src/modules/business/staff.model");

const BUSINESS_ID = "64b000000000000000000001";
const STAFF_PROVIDER_ID = "64c000000000000000000001";

test("searchProviders matches BusinessName on provider and business accounts", async () => {
  const originalProviderAggregate = Provider.aggregate;
  const originalBusinessAggregate = Business.aggregate;
  const originalBookingDistinct = Booking.distinct;
  const originalStaffFind = Staff.find;
  const originalStaffDistinct = Staff.distinct;
  const originalProviderDistinct = Provider.distinct;
  const now = new Date();

  Provider.aggregate = async ([geoNear]) => {
    assert.ok(geoNear.$geoNear.query.BusinessName.test("Studio"));
    return [
      {
        _id: "provider-id",
        BusinessName: "Studio Provider",
        fullName: "Provider",
        service: [],
        job: [],
        distanceFromPickup: 1000,
        lastLocationUpdate: now,
      },
    ];
  };
  Business.aggregate = async ([geoNear]) => {
    assert.ok(geoNear.$geoNear.query.BusinessName.test("Studio"));
    return [
      {
        _id: BUSINESS_ID,
        BusinessName: "Studio Business",
        service: [],
        distanceFromPickup: 1500,
        lastLocationUpdate: now,
        currentLocation: {
          type: "Point",
          coordinates: [3.4, 6.5],
        },
      },
    ];
  };
  Booking.distinct = async () => [];
  Staff.find = async () => [{ business: BUSINESS_ID, provider: STAFF_PROVIDER_ID }];
  Staff.distinct = async () => [];
  Provider.distinct = async () => [STAFF_PROVIDER_ID];

  try {
    const response = {
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
    };

    await bookingController.searchProviders(
      {
        body: {
          businessName: "Studio",
          location: { latitude: 6.5, longitude: 3.4 },
        },
      },
      response,
    );

    assert.equal(response.statusCode, 200);
    assert.equal(response.body.count, 2);
    assert.deepEqual(
      response.body.nearbyProviders.map((account) => account.accountType),
      ["provider", "business"],
    );
    assert.equal(
      response.body.nearbyProviders[1].BusinessName,
      "Studio Business",
    );
    assert.deepEqual(
      response.body.nearbyProviders[1].currentLocation.coordinates,
      [3.4, 6.5],
    );
  } finally {
    Provider.aggregate = originalProviderAggregate;
    Business.aggregate = originalBusinessAggregate;
    Booking.distinct = originalBookingDistinct;
    Staff.find = originalStaffFind;
    Staff.distinct = originalStaffDistinct;
    Provider.distinct = originalProviderDistinct;
  }
});

test("findNearbyProviders does not include businesses in booking searches", async () => {
  const originalProviderAggregate = Provider.aggregate;
  const originalBusinessAggregate = Business.aggregate;
  let businessSearchCalled = false;
  Provider.aggregate = async () => [];
  Business.aggregate = async () => {
    businessSearchCalled = true;
    return [];
  };

  try {
    const results = await bookingController.findNearbyProviders(
      { latitude: 6.5, longitude: 3.4 },
      "Cleaning",
    );

    assert.deepEqual(results, []);
    assert.equal(businessSearchCalled, false);
  } finally {
    Provider.aggregate = originalProviderAggregate;
    Business.aggregate = originalBusinessAggregate;
  }
});

const mockResponse = () => ({
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

// Captures the $geoNear queries for providers and businesses.
const withCapturedQueries = async (run) => {
  const originals = {
    providerAggregate: Provider.aggregate,
    businessAggregate: Business.aggregate,
    bookingDistinct: Booking.distinct,
    staffDistinct: Staff.distinct,
  };
  const captured = {};
  Provider.aggregate = async ([geoNear]) => {
    captured.provider = geoNear.$geoNear.query;
    return [];
  };
  Business.aggregate = async ([geoNear]) => {
    captured.business = geoNear.$geoNear.query;
    return [];
  };
  Booking.distinct = async () => [];
  Staff.distinct = async () => [];
  try {
    await run(captured);
  } finally {
    Provider.aggregate = originals.providerAggregate;
    Business.aggregate = originals.businessAggregate;
    Booking.distinct = originals.bookingDistinct;
    Staff.distinct = originals.staffDistinct;
  }
};

const searchOrFields = (query) => {
  const clause = query.$and.find((c) => c.$or && c.$or.some((o) => "fullName" in o));
  return Object.fromEntries(clause.$or.map((o) => Object.entries(o)[0]));
};

test("searchProviders free-text search matches names and services partially", async () => {
  await withCapturedQueries(async (captured) => {
    const response = mockResponse();
    await bookingController.searchProviders(
      { body: { search: "  tunde ", location: { latitude: 6.5, longitude: 3.4 } } },
      response,
    );

    assert.equal(response.statusCode, 200);
    assert.equal(response.body.search, "tunde");

    const provider = searchOrFields(captured.provider);
    assert.deepEqual(Object.keys(provider).sort(), [
      "BusinessName",
      "fullName",
      "service.serviceName",
    ]);
    assert.ok(provider.fullName.test("Tunde Bakare"));
    assert.ok(provider["service.serviceName"].test("Braids by TUNDE"));

    const business = searchOrFields(captured.business);
    assert.deepEqual(Object.keys(business).sort(), [
      "BusinessName",
      "businessCategory",
      "fullName",
      "service.serviceName",
    ]);
  });
});

test("searchProviders escapes regex characters in search", async () => {
  await withCapturedQueries(async (captured) => {
    await bookingController.searchProviders(
      { body: { search: "a.b", location: { latitude: 6.5, longitude: 3.4 } } },
      mockResponse(),
    );
    const { fullName } = searchOrFields(captured.provider);
    assert.ok(fullName.test("a.b"));
    assert.equal(fullName.test("axb"), false);
  });
});

test("searchProviders keeps existing $or filters when combined with search", async () => {
  await withCapturedQueries(async (captured) => {
    await bookingController.searchProviders(
      {
        body: {
          search: "tunde",
          serviceName: "Braids",
          jobService: "Beauty",
          location: { latitude: 6.5, longitude: 3.4 },
        },
      },
      mockResponse(),
    );
    // serviceName + jobService produce their own top-level $or; it must
    // survive alongside the search $or.
    const [base] = captured.provider.$and;
    assert.ok(Array.isArray(base.$or));
    assert.ok(searchOrFields(captured.provider).fullName.test("Tunde"));
  });
});

test("searchProviders rejects a one-character search", async () => {
  const response = mockResponse();
  await bookingController.searchProviders(
    { body: { search: "t", location: { latitude: 6.5, longitude: 3.4 } } },
    response,
  );
  assert.equal(response.statusCode, 400);
  assert.match(response.body.message, /search must be between 2 and 100/);
});

test("searchGeneralProviders searches without location or geo queries", async () => {
  const originals = {
    providerFind: Provider.find,
    businessFind: Business.find,
    staffDistinct: Staff.distinct,
    bookingDistinct: Booking.distinct,
  };
  let providerQuery;
  let businessQuery;

  Provider.find = (query) => {
    providerQuery = query;
    return {
      select() { return this; },
      lean() { return this; },
      limit: async () => [{
        _id: "general-provider",
        fullName: "General Provider",
        accountType: "individual",
        service: [{ serviceName: "Braids" }],
        rating: { average: 4.8 },
        availability: { isAvailable: true },
        isOnline: true,
        lastLocationUpdate: new Date(),
        kycVerified: true,
      }],
    };
  };
  Business.find = (query) => {
    businessQuery = query;
    return {
      select() { return this; },
      lean() { return this; },
      limit: async () => [{
        _id: BUSINESS_ID,
        BusinessName: "General Studio",
        service: [{ serviceName: "Braids" }],
        rating: { average: 4.5 },
        availability: { isAvailable: true },
        isOnline: true,
        lastSeenAt: new Date(),
        kycVerified: true,
      }],
    };
  };
  Staff.distinct = async () => [];
  Booking.distinct = async () => [];

  try {
    const response = mockResponse();
    await bookingController.searchGeneralProviders(
      { body: { serviceName: "Braids", search: "general" } },
      response,
    );

    assert.equal(response.statusCode, 200);
    assert.equal(response.body.count, 2);
    assert.equal(response.body.location, undefined);
    assert.equal(response.body.providers[0].online, true);
    assert.equal(response.body.providers[1].online, true);
    assert.equal(response.body.providers[0].kycVerified, true);
    assert.equal(response.body.providers[1].kycVerified, true);
    assert.ok(providerQuery.$and);
    assert.ok(businessQuery.$and);
    assert.equal(providerQuery.$and[0].kycVerified, true);
    assert.equal(businessQuery.$and[0].kycVerified, true);
  } finally {
    Provider.find = originals.providerFind;
    Business.find = originals.businessFind;
    Staff.distinct = originals.staffDistinct;
    Booking.distinct = originals.bookingDistinct;
  }
});
