const getPagination = (req, { defaultPage = 1, defaultLimit = 20, maxLimit = 100 } = {}) => {
  const page = Math.max(parseInt(req?.query?.page, 10) || defaultPage, 1);
  const limit = Math.max(parseInt(req?.query?.limit, 10) || defaultLimit, 1);
  const safeLimit = Math.min(limit, maxLimit);
  const skip = (page - 1) * safeLimit;

  return { page, limit: safeLimit, skip };
};

module.exports = {
  getPagination,
};
