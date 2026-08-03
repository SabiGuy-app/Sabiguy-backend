const usersService = require('./users.service');

const getPagination = (req) => usersService.getPagination(req);

exports.getAllBuyers = async (req, res) => {
  try {
    const payload = await usersService.getAllBuyers(req);
    res.status(200).json(payload);
  } catch (err) {
    const statusCode = err.statusCode || 500;
    res.status(statusCode).json({ success: false, message: err.message });
  }
};

exports.getAllProviders = async (req, res) => {
  try {
    const payload = await usersService.getAllProviders(req);
    res.status(200).json(payload);
  } catch (err) {
    const statusCode = err.statusCode || 500;
    res.status(statusCode).json({ success: false, message: err.message });
  }
};

exports.getAllUsers = async (req, res) => {
  try {
    const payload = await usersService.getAllUsers(req);
    res.status(200).json(payload);
  } catch (err) {
    const statusCode = err.statusCode || 500;
    res.status(statusCode).json({ success: false, message: err.message });
  }
};

exports.getUserByEmail = async (req, res) => {
  try {
    const { email } = req.params;
    const user = await usersService.getUserByEmail(email);

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    res.status(200).json({ success: true, data: user });
  } catch (err) {
    const statusCode = err.statusCode || 500;
    res.status(statusCode).json({ success: false, message: err.message });
  }
};

exports.getUserById = async (req, res) => {
  try {
    const { id } = req.params;
    const user = await usersService.getUserById(id);

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    res.status(200).json({ success: true, data: user });
  } catch (err) {
    const statusCode = err.statusCode || 500;
    res.status(statusCode).json({ success: false, message: err.message });
  }
};

exports.uploadUserNin = async (req, res) => {
  try {
    const buyerId = req.user.id;
    const { ninSlip } = req.body;

    if (!ninSlip) {
      return res.status(400).json({ success: false, message: 'NIN slip is required' });
    }

    const payload = await usersService.uploadUserNin(buyerId, ninSlip);
    res.status(200).json(payload);
  } catch (err) {
    const statusCode = err.statusCode || 500;
    res.status(statusCode).json({ success: false, message: err.message });
  }
};

exports.updateUserLocation = async (req, res) => {
  try {
    const buyerId = req.user.id;
    const payload = await usersService.updateUserLocation(buyerId, req.body);
    return res.status(200).json(payload);
  } catch (err) {
    const statusCode = err.statusCode || 500;
    return res.status(statusCode).json({ success: false, message: err.message });
  }
};

module.exports = {
  getPagination,
  ...exports,
};
