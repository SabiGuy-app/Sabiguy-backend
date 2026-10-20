const SUPPORTED_PLATFORMS = new Set(["web", "android", "ios", "mobile"]);

const getClientPlatform = (req) => {
  const value = String(req.get("x-client-platform") || "")
    .trim()
    .toLowerCase();

  return SUPPORTED_PLATFORMS.has(value) ? value : "unknown";
};

module.exports = { getClientPlatform, SUPPORTED_PLATFORMS };
