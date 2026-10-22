const test = require("node:test");
const assert = require("node:assert/strict");

const {
  evaluateStaffEligibility,
  updateStaffRole,
  getStaffOnDuty,
  getAllStaff,
  getStaffDetail,
  respondToStaffInvite,
} = require("../src/modules/business/staff.service");

const BIZ_ID = "000000000000000000000000";
const STAFF_ID = "000000000000000000000001";

const staff = (overrides = {}) => ({
  services: ["Haircut", "Fade"],
  onDuty: { active: true },
  ...overrides,
});

test("eligible when active, on-duty and offers the service", () => {
  assert.deepEqual(
    evaluateStaffEligibility(staff(), { serviceName: "Haircut" }),
    { eligible: true, reason: null },
  );
});

test("service match is case-insensitive and trims", () => {
  assert.equal(
    evaluateStaffEligibility(staff(), { serviceName: "  haircut " }).eligible,
    true,
  );
});

test("ineligible when staff does not offer the service", () => {
  assert.deepEqual(
    evaluateStaffEligibility(staff(), { serviceName: "Braids" }),
    { eligible: false, reason: "does_not_do_service" },
  );
});

test("ineligible when off duty", () => {
  assert.deepEqual(
    evaluateStaffEligibility(staff({ onDuty: { active: false } }), {
      serviceName: "Haircut",
    }),
    { eligible: false, reason: "off_duty" },
  );
});

test("on-duty requirement can be relaxed", () => {
  assert.equal(
    evaluateStaffEligibility(staff({ onDuty: { active: false } }), {
      serviceName: "Haircut",
      requireOnDuty: false,
    }).eligible,
    true,
  );
});

test("already-assigned takes precedence over other reasons", () => {
  assert.deepEqual(
    evaluateStaffEligibility(staff({ services: [], onDuty: { active: false } }), {
      serviceName: "Haircut",
      alreadyAssigned: true,
    }),
    { eligible: false, reason: "already_assigned" },
  );
});

test("missing/blank service name is treated as no match", () => {
  assert.deepEqual(
    evaluateStaffEligibility(staff(), { serviceName: "" }),
    { eligible: false, reason: "does_not_do_service" },
  );
});

const rejects = (promise, messagePattern) =>
  promise.then(
    () => assert.fail("expected rejection"),
    (error) => {
      assert.equal(error.name, "ValidationError");
      assert.match(error.message, messagePattern);
    },
  );

test("updateStaffRole rejects invalid business ID", () =>
  rejects(updateStaffRole("bad-id", STAFF_ID, { role: "Barber" }), /Invalid business ID/));

test("updateStaffRole rejects empty payload before DB access", () =>
  rejects(updateStaffRole(BIZ_ID, STAFF_ID, {}), /No valid fields provided/));

test("updateStaffRole rejects blank role", () =>
  rejects(updateStaffRole(BIZ_ID, STAFF_ID, { role: "   " }), /role must be a non-empty string/));

test("updateStaffRole rejects non-boolean canDoHomeService", () =>
  rejects(
    updateStaffRole(BIZ_ID, STAFF_ID, { canDoHomeService: "yes" }),
    /canDoHomeService must be a boolean/,
  ));

test("updateStaffRole rejects non-array services", () =>
  rejects(
    updateStaffRole(BIZ_ID, STAFF_ID, { services: "Haircut" }),
    /services must be an array/,
  ));

test("getStaffOnDuty rejects invalid business ID", () =>
  rejects(getStaffOnDuty("bad-id"), /Invalid business ID/));

test("getAllStaff rejects invalid business ID", () =>
  rejects(getAllStaff("bad-id"), /Invalid business ID/));

test("getAllStaff rejects an unknown status before DB access", () =>
  rejects(getAllStaff(BIZ_ID, { status: "BOGUS" }), /status must be one of/));

test("getStaffDetail rejects invalid business ID", () =>
  rejects(getStaffDetail("bad-id", "SGD-1"), /Invalid business ID/));

test("getStaffDetail rejects a blank identifier before DB access", () =>
  rejects(getStaffDetail(BIZ_ID, "   "), /staff identifier is required/));

const rejectsNamed = (promise, name, messagePattern) =>
  promise.then(
    () => assert.fail("expected rejection"),
    (error) => {
      assert.equal(error.name, name);
      assert.match(error.message, messagePattern);
    },
  );

const PROVIDER = { id: STAFF_ID, email: "tunde@example.com" };

test("respondToStaffInvite rejects a bad status", () =>
  rejects(
    respondToStaffInvite(
      { staffEmail: "tunde@example.com", businessEmail: "biz@example.com", status: "maybe" },
      PROVIDER,
    ),
    /status must be/,
  ));

test("respondToStaffInvite rejects an invalid staff email", () =>
  rejects(
    respondToStaffInvite(
      { staffEmail: "not-an-email", businessEmail: "biz@example.com", status: "accept" },
      PROVIDER,
    ),
    /valid staff email/,
  ));

test("respondToStaffInvite rejects an invalid business email", () =>
  rejects(
    respondToStaffInvite(
      { staffEmail: "tunde@example.com", businessEmail: "nope", status: "accept" },
      PROVIDER,
    ),
    /valid business email/,
  ));

test("respondToStaffInvite rejects an unauthenticated caller", () =>
  rejectsNamed(
    respondToStaffInvite(
      { staffEmail: "tunde@example.com", businessEmail: "biz@example.com", status: "accept" },
      {},
    ),
    "ForbiddenError",
    /Authentication required/,
  ));

test("respondToStaffInvite rejects responding to someone else's invite", () =>
  rejectsNamed(
    respondToStaffInvite(
      { staffEmail: "someone.else@example.com", businessEmail: "biz@example.com", status: "accept" },
      PROVIDER,
    ),
    "ForbiddenError",
    /only respond to your own invitation/,
  ));
