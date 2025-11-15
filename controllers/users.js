const Provider = require ('../models/ServiceProvider');
const Buyer = require ('../models/ServiceUser');


exports.getAllBuyers = async (req, res) => {
  try {
    const buyers = await Buyer.find().select("-password");
    res.status(200).json({
      success: true,
      count: buyers.length,
      data: buyers,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.getAllProviders = async (req, res) => {
  try {
    const providers = await Provider.find().select("-password");
    res.status(200).json({
      success: true,
      count: providers.length,
      data: providers,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.getAllUsers = async (req, res) => {
  try {
    const buyers = await Buyer.find().select("-password");
    const providers = await Provider.find().select("-password");
    const users = [...buyers, ...providers];
    res.status(200).json({
      success: true,
      count: users.length,
      data: users,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.getUserByEmail = async (req, res) => {
  try {
    const { email } = req.params;
    const buyer = await Buyer.findOne({ email }).select("-password");
    const provider = await Provider.findOne({ email }).select("-password");

    if (!buyer && !provider) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    res.status(200).json({
      success: true,
      data: buyer || provider,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.getUserById = async (req, res) => {
  try {
    const { id } = req.params;
    const buyer = await Buyer.findById(id).select("-password");
    const provider = await Provider.findById(id).select("-password");

    if (!buyer && !provider) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    res.status(200).json({
      success: true,
      data: buyer || provider,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
