const Business = require("./business.model");
const FleetInvitation = require("./fleetInvitation.model");
const Provider = require("../../../models/ServiceProvider");

const escapeRegex = (value) =>
  String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const findBusinessById = (businessId) => Business.findById(businessId);

const findDriverByEmail = async (email) => {
  const normalizedEmail = String(email || "").trim().toLowerCase();
  if (!normalizedEmail) return null;

  const exactMatch = await Provider.findOne({ email: normalizedEmail });
  if (exactMatch) return exactMatch;

  return Provider.findOne({
    email: new RegExp(`^${escapeRegex(normalizedEmail)}$`, "i"),
  });
};

const isDriverLinked = (business, driverId) =>
  (business.drivers || []).some((id) => id.toString() === driverId.toString());

const findPendingInvitation = (businessId, driverId) =>
  FleetInvitation.findOne({
    business: businessId,
    driver: driverId,
    status: "PENDING",
  });

const createInvitation = (data) => FleetInvitation.create(data);

const findInvitationById = (invitationId) =>
  FleetInvitation.findById(invitationId);

const getInvitationsByBusiness = async (
  businessId,
  { status, skip, limit },
) => {
  const query = { business: businessId };
  if (status) query.status = status;

  const [invitations, total] = await Promise.all([
    FleetInvitation.find(query)
      .populate(
        "driver",
        "fullName email phoneNumber profilePicture rating isActive",
      )
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    FleetInvitation.countDocuments(query),
  ]);

  return { invitations, total };
};

// Vehicles are embedded on the Business document rather than living in
// their own collection, so pagination is applied in-memory after slicing
// the requested page out of the array.
const getBusinessVehiclesPage = async (businessId, { skip, limit }) => {
  const business = await Business.findById(businessId)
    .select("vehicles")
    .populate(
      "vehicles.assignedDriver",
      "fullName email phoneNumber profilePicture",
    )
    .lean();

  const allVehicles = business?.vehicles || [];
  const total = allVehicles.length;
  const vehicles = allVehicles.slice(skip, skip + limit);

  return { vehicles, total };
};

const addDriverToBusiness = (businessId, driverId, session) =>
  Business.updateOne(
    { _id: businessId },
    { $addToSet: { drivers: driverId } },
    { session },
  );
  
const saveBusinessDetails = (businessId, details) =>
  Business.findByIdAndUpdate(
    businessId,
    { $set: details },
    { new: true, runValidators: true },
  );

const addVehiclesToBusiness = (businessId, vehicles, updates = {}) =>
  Business.findByIdAndUpdate(
    businessId,
    {
      $push: { vehicles: { $each: vehicles } },
      $set: updates,
    },
    { new: true, runValidators: true },
  );

module.exports = {
  findBusinessById,
  findDriverByEmail,
  isDriverLinked,
  findPendingInvitation,
  createInvitation,
  findInvitationById,
  getInvitationsByBusiness,
  getBusinessVehiclesPage,
  addDriverToBusiness,
  saveBusinessDetails,
  addVehiclesToBusiness,
};
