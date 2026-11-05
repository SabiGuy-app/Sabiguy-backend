const STAFF_STALE_LOCATION_MINUTES = Number(
  process.env.STALE_LOCATION_MINUTES ||
    process.env.STAFF_STALE_LOCATION_MINUTES ||
    10,
);

const isProviderOnlineAndAvailable = (provider, now = new Date()) =>
  Boolean(
    provider &&
      provider.isActive === true &&
      provider.isDeleted !== true &&
      provider.availability?.isAvailable === true &&
      Array.isArray(provider.currentLocation?.coordinates) &&
      provider.currentLocation.coordinates.length === 2 &&
      provider.lastLocationUpdate &&
      new Date(provider.lastLocationUpdate).getTime() >=
        now.getTime() - STAFF_STALE_LOCATION_MINUTES * 60 * 1000,
  );

const getPublicStaffStatus = (membershipStatus, provider, now = new Date()) =>
  membershipStatus === 'ACTIVE' &&
  !isProviderOnlineAndAvailable(provider, now)
    ? 'OFFLINE'
    : membershipStatus;

module.exports = {
  STAFF_STALE_LOCATION_MINUTES,
  isProviderOnlineAndAvailable,
  getPublicStaffStatus,
};
