const test = require("node:test");
const assert = require("node:assert/strict");

const Staff = require("../src/modules/business/staff.model");
const notificationService = require("../src/services/notification.service");
const {
  clockInStaff,
  clockOutStaff,
  respondToClockRequest,
  businessClockOutStaff,
} = require("../src/modules/business/staff.service");

const PROVIDER_ID = "64c000000000000000000001";
const BUSINESS_ID = "64b000000000000000000001";
const STAFF_ID = "64d000000000000000000001";

// Minimal stand-in for a Staff document: supports set() with dotted paths.
const fakeStaff = (overrides = {}) => ({
  _id: STAFF_ID,
  business: BUSINESS_ID,
  provider: PROVIDER_ID,
  email: "tunde@example.com",
  role: "Stylist",
  status: "ACTIVE",
  workStatus: "offline",
  onDuty: { active: false, since: null, lastClockInAt: null, lastClockOutAt: null },
  clockRequest: { action: null, status: null },
  saved: false,
  ...overrides,
  set(values) {
    for (const [path, value] of Object.entries(values)) {
      const [root, key] = path.split(".");
      this[root][key] = value;
    }
  },
  async save() {
    this.saved = true;
  },
});

const pending = (action) => ({
  action,
  status: "pending",
  requestedAt: new Date(),
});

// Mocks Staff lookups and records notifications sent.
const withMocks = async (
  { records = [], staff = null, onDutyElsewhere = null },
  run,
) => {
  const originals = {
    find: Staff.find,
    findOne: Staff.findOne,
    exists: Staff.exists,
    notifyBusiness: notificationService.notifyBusiness,
    notifyProvider: notificationService.notifyProvider,
  };
  const notifications = [];
  Staff.find = async () => records;
  Staff.findOne = async () => staff;
  Staff.exists = async () => onDutyElsewhere;
  notificationService.notifyBusiness = async (id, data) => {
    notifications.push({ to: "business", id, ...data });
  };
  notificationService.notifyProvider = async (id, data) => {
    notifications.push({ to: "provider", id, ...data });
  };
  try {
    await run(notifications);
  } finally {
    Object.assign(Staff, {
      find: originals.find,
      findOne: originals.findOne,
      exists: originals.exists,
    });
    notificationService.notifyBusiness = originals.notifyBusiness;
    notificationService.notifyProvider = originals.notifyProvider;
  }
};

// ── Staff requests ───────────────────────────────────────────────────────────

test("clockInStaff creates a pending request without going on duty", async () => {
  const staff = fakeStaff();
  await withMocks({ records: [staff] }, async (notifications) => {
    const result = await clockInStaff(PROVIDER_ID);
    assert.equal(result.onDuty, false);
    assert.equal(result.clockRequest.action, "clock_in");
    assert.equal(result.clockRequest.status, "pending");
    assert.equal(staff.saved, true);
    assert.equal(notifications.length, 1);
    assert.equal(notifications[0].to, "business");
    assert.equal(notifications[0].type, "staff_clock_in_requested");
  });
});

test("clockInStaff repeats are a no-op while pending", async () => {
  const staff = fakeStaff({ clockRequest: pending("clock_in") });
  await withMocks({ records: [staff] }, async (notifications) => {
    const result = await clockInStaff(PROVIDER_ID);
    assert.equal(result.clockRequest.status, "pending");
    assert.equal(staff.saved, false);
    assert.equal(notifications.length, 0);
  });
});

test("clockInStaff while on duty cancels a pending clock-out", async () => {
  const staff = fakeStaff({
    onDuty: { active: true, since: new Date() },
    clockRequest: pending("clock_out"),
  });
  await withMocks({ records: [staff] }, async () => {
    const result = await clockInStaff(PROVIDER_ID);
    assert.equal(result.onDuty, true);
    assert.equal(result.clockRequest.status, "cancelled");
  });
});

test("clockInStaff rejects when on duty at another business", async () => {
  await withMocks(
    { records: [fakeStaff()], onDutyElsewhere: { _id: "other" } },
    () =>
      assert.rejects(clockInStaff(PROVIDER_ID), {
        name: "ConflictError",
        message: /another business/,
      }),
  );
});

test("clockInStaff requires businessId for multi-business staff", async () => {
  await withMocks({ records: [fakeStaff(), fakeStaff()] }, () =>
    assert.rejects(clockInStaff(PROVIDER_ID), {
      name: "ValidationError",
      message: /businessId is required/,
    }),
  );
});

test("clockInStaff rejects providers who are not active staff", async () => {
  await withMocks({ records: [] }, () =>
    assert.rejects(clockInStaff(PROVIDER_ID), { name: "NotFoundError" }),
  );
});

test("clockInStaff rejects an invalid businessId", () =>
  assert.rejects(clockInStaff(PROVIDER_ID, { businessId: "nope" }), {
    name: "ValidationError",
    message: /Invalid business ID/,
  }));

test("clockOutStaff creates a pending request and stays on duty", async () => {
  const staff = fakeStaff({
    workStatus: "available",
    onDuty: { active: true, since: new Date() },
  });
  await withMocks({ records: [staff] }, async (notifications) => {
    const result = await clockOutStaff(PROVIDER_ID);
    assert.equal(result.onDuty, true);
    assert.equal(result.clockRequest.action, "clock_out");
    assert.equal(notifications[0].type, "staff_clock_out_requested");
  });
});

// ── Owner responses ─────────────────────────────────────────────────────────

test("respondToClockRequest approve puts staff on duty and notifies them", async () => {
  const staff = fakeStaff({ clockRequest: pending("clock_in") });
  await withMocks({ staff }, async (notifications) => {
    const result = await respondToClockRequest(BUSINESS_ID, STAFF_ID, {
      action: "approve",
    });
    assert.equal(result.onDuty, true);
    assert.ok(result.since instanceof Date);
    assert.equal(result.workStatus, "available");
    assert.equal(result.clockRequest.status, "approved");
    assert.equal(staff.clockRequest.respondedBy, BUSINESS_ID);
    assert.equal(notifications[0].to, "provider");
    assert.equal(notifications[0].type, "staff_clock_request_approved");
  });
});

test("respondToClockRequest approve keeps a busy work status", async () => {
  const staff = fakeStaff({
    workStatus: "in_service",
    clockRequest: pending("clock_in"),
  });
  await withMocks({ staff }, async () => {
    const result = await respondToClockRequest(BUSINESS_ID, STAFF_ID, {
      action: "approve",
    });
    assert.equal(result.workStatus, "in_service");
  });
});

test("respondToClockRequest approve of clock-out takes staff off duty", async () => {
  const staff = fakeStaff({
    workStatus: "available",
    onDuty: { active: true, since: new Date() },
    clockRequest: pending("clock_out"),
  });
  await withMocks({ staff }, async () => {
    const result = await respondToClockRequest(BUSINESS_ID, STAFF_ID, {
      action: "approve",
    });
    assert.equal(result.onDuty, false);
    assert.ok(result.lastClockOutAt instanceof Date);
    assert.equal(result.workStatus, "offline");
  });
});

test("respondToClockRequest reject leaves duty unchanged and records reason", async () => {
  const staff = fakeStaff({ clockRequest: pending("clock_in") });
  await withMocks({ staff }, async (notifications) => {
    const result = await respondToClockRequest(BUSINESS_ID, STAFF_ID, {
      action: "reject",
      reason: " Not on the rota today ",
    });
    assert.equal(result.onDuty, false);
    assert.equal(result.clockRequest.status, "rejected");
    assert.equal(result.clockRequest.reason, "Not on the rota today");
    assert.equal(notifications[0].type, "staff_clock_request_rejected");
  });
});

test("respondToClockRequest rejects when nothing is pending", async () => {
  await withMocks({ staff: fakeStaff() }, () =>
    assert.rejects(
      respondToClockRequest(BUSINESS_ID, STAFF_ID, { action: "approve" }),
      { name: "ConflictError", message: /no pending clock request/ },
    ),
  );
});

test("respondToClockRequest rejects an invalid action", () =>
  assert.rejects(
    respondToClockRequest(BUSINESS_ID, STAFF_ID, { action: "maybe" }),
    { name: "ValidationError", message: /action must be/ },
  ));

test("respondToClockRequest rejects staff from another business", async () => {
  await withMocks({ staff: null }, () =>
    assert.rejects(
      respondToClockRequest(BUSINESS_ID, STAFF_ID, { action: "approve" }),
      { name: "NotFoundError" },
    ),
  );
});

test("respondToClockRequest re-checks duty elsewhere on clock-in approval", async () => {
  const staff = fakeStaff({ clockRequest: pending("clock_in") });
  await withMocks({ staff, onDutyElsewhere: { _id: "other" } }, () =>
    assert.rejects(
      respondToClockRequest(BUSINESS_ID, STAFF_ID, { action: "approve" }),
      { name: "ConflictError" },
    ),
  );
});

test("businessClockOutStaff clocks out directly and resolves a pending clock-out", async () => {
  const staff = fakeStaff({
    workStatus: "available",
    onDuty: { active: true, since: new Date() },
    clockRequest: pending("clock_out"),
  });
  await withMocks({ staff }, async (notifications) => {
    const result = await businessClockOutStaff(BUSINESS_ID, STAFF_ID, {
      reason: "Forgot to clock out",
    });
    assert.equal(result.onDuty, false);
    assert.equal(result.workStatus, "offline");
    assert.equal(result.clockRequest.status, "approved");
    assert.equal(notifications[0].type, "staff_clocked_out_by_business");
  });
});

test("businessClockOutStaff is a no-op when already off duty", async () => {
  const staff = fakeStaff();
  await withMocks({ staff }, async (notifications) => {
    const result = await businessClockOutStaff(BUSINESS_ID, STAFF_ID);
    assert.equal(result.onDuty, false);
    assert.equal(staff.saved, false);
    assert.equal(notifications.length, 0);
  });
});

test("businessClockOutStaff rejects removed staff", async () => {
  await withMocks({ staff: fakeStaff({ status: "REMOVED" }) }, () =>
    assert.rejects(businessClockOutStaff(BUSINESS_ID, STAFF_ID), {
      name: "ConflictError",
    }),
  );
});
