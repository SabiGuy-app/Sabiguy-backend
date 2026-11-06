const UpdatePolicy = require("./updatePolicy.model");

const PLATFORMS = ["ios", "android", "both"];
const TRIGGERS = ["app_launch", "after_login", "on_home_screen"];
const UPDATE_TYPES = ["none", "soft_store_update", "force_store_update"];
const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

function compareVersions(left, right) {
  const a = left.split(/[+-]/, 1)[0].split(".").map(Number);
  const b = right.split(/[+-]/, 1)[0].split(".").map(Number);
  for (let i = 0; i < 3; i += 1) {
    if (a[i] !== b[i]) return a[i] - b[i];
  }
  return 0;
}

function validUrl(value) {
  if (value === "") return true;
  try {
    return ["http:", "https:"].includes(new URL(value).protocol);
  } catch {
    return false;
  }
}

function serialize(policy) {
  if (!policy) return null;
  return {
    id: policy._id.toString(),
    active: policy.active,
    platform: policy.platform,
    update_type: policy.update_type,
    trigger_timing: policy.trigger_timing,
    minimum_required_version: policy.minimum_required_version,
    latest_version: policy.latest_version,
    title: policy.title || "",
    message: policy.message || "",
    ios_store_url: policy.ios_store_url || "",
    android_store_url: policy.android_store_url || "",
    allow_dismiss: policy.allow_dismiss,
    updated_at: policy.updated_at,
    updated_by: policy.updated_by?._id?.toString?.() || policy.updated_by?.toString?.() || null,
  };
}

exports.getPublicPolicy = async (req, res) => {
  const { platform, trigger_timing: trigger } = req.query;
  if (!["ios", "android"].includes(platform) || !TRIGGERS.includes(trigger)) {
    return res.status(400).json({ success: false, message: "Valid platform and trigger_timing query parameters are required" });
  }
  try {
    const exact = await UpdatePolicy.findOne({ platform, trigger_timing: trigger, active: true }).lean();
    const policy = exact || await UpdatePolicy.findOne({ platform: "both", trigger_timing: trigger, active: true }).lean();
    return res.json({ success: true, message: "OK", data: serialize(policy) });
  } catch (error) {
    console.error("Failed to fetch mobile update policy:", error);
    return res.status(500).json({ success: false, message: "Failed to fetch update policy" });
  }
};

exports.getAdminPolicies = async (req, res) => {
  try {
    const query = {};
    if (req.query.platform) {
      if (!PLATFORMS.includes(req.query.platform)) return res.status(400).json({ success: false, message: "Invalid platform" });
      query.platform = req.query.platform;
    }
    if (req.query.trigger_timing) {
      if (!TRIGGERS.includes(req.query.trigger_timing)) return res.status(400).json({ success: false, message: "Invalid trigger_timing" });
      query.trigger_timing = req.query.trigger_timing;
    }
    const policies = await UpdatePolicy.find(query).sort({ platform: 1, trigger_timing: 1 }).lean();
    return res.json({ success: true, message: "OK", data: policies.map(serialize) });
  } catch (error) {
    console.error("Failed to fetch admin update policies:", error);
    return res.status(500).json({ success: false, message: "Failed to fetch update policies" });
  }
};

exports.upsertPolicy = async (req, res) => {
  const body = req.body || {};
  const required = ["active", "platform", "update_type", "trigger_timing", "minimum_required_version", "latest_version", "allow_dismiss"];
  const missing = required.filter((key) => body[key] === undefined);
  if (missing.length) return res.status(400).json({ success: false, message: `Missing required fields: ${missing.join(", ")}` });
  if (typeof body.active !== "boolean" || typeof body.allow_dismiss !== "boolean") {
    return res.status(400).json({ success: false, message: "active and allow_dismiss must be booleans" });
  }
  if (!PLATFORMS.includes(body.platform) || !TRIGGERS.includes(body.trigger_timing) || !UPDATE_TYPES.includes(body.update_type)) {
    return res.status(400).json({ success: false, message: "Invalid platform, trigger_timing, or update_type" });
  }
  if (!SEMVER.test(body.minimum_required_version) || !SEMVER.test(body.latest_version)) {
    return res.status(400).json({ success: false, message: "Versions must be valid semver strings (for example, 1.2.0)" });
  }
  if (compareVersions(body.minimum_required_version, body.latest_version) > 0) {
    return res.status(400).json({ success: false, message: "minimum_required_version cannot be greater than latest_version" });
  }
  if (body.update_type === "force_store_update" && body.allow_dismiss) {
    return res.status(400).json({ success: false, message: "allow_dismiss must be false for force updates" });
  }
  for (const key of ["ios_store_url", "android_store_url"]) {
    if (body[key] !== undefined && (typeof body[key] !== "string" || !validUrl(body[key]))) {
      return res.status(400).json({ success: false, message: `${key} must be a valid http or https URL` });
    }
  }
  for (const key of ["title", "message"]) {
    if (body[key] !== undefined && typeof body[key] !== "string") {
      return res.status(400).json({ success: false, message: `${key} must be a string` });
    }
  }

  try {
    const update = {
      active: body.active,
      platform: body.platform,
      update_type: body.update_type,
      trigger_timing: body.trigger_timing,
      minimum_required_version: body.minimum_required_version,
      latest_version: body.latest_version,
      title: body.title?.trim() || "",
      message: body.message?.trim() || "",
      ios_store_url: body.ios_store_url || "",
      android_store_url: body.android_store_url || "",
      allow_dismiss: body.allow_dismiss,
      updated_by: req.user.id,
    };
    const policy = await UpdatePolicy.findOneAndUpdate(
      { platform: body.platform, trigger_timing: body.trigger_timing },
      { $set: update },
      { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true },
    ).populate("updated_by", "_id");
    return res.json({ success: true, message: "Update policy saved", data: serialize(policy) });
  } catch (error) {
    console.error("Failed to save mobile update policy:", error);
    return res.status(500).json({ success: false, message: "Failed to save update policy" });
  }
};
