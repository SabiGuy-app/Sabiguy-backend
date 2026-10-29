const service = require("./category.service");

exports.createCategory = async (req, res) => {
  try {
    const categories = await service.createFromPayload(req.body);
    const hasPayload = req.body && Object.keys(req.body).length > 0;
    return res.status(hasPayload ? 201 : 200).json({ success: true, data: categories });
  } catch (error) {
    const status = error.code === 11000 ? 409 : 400;
    return res.status(status).json({ success: false, message: error.message });
  }
};

exports.updateCategory = async (req, res) => {
  try {
    const category = await service.updateCategory(req.params.id, req.body);
    return res.status(200).json({ success: true, data: category });
  } catch (error) {
    const status = error.statusCode || (error.code === 11000 ? 409 : error.name === "CastError" ? 400 : 400);
    return res.status(status).json({ success: false, message: error.message });
  }
};

exports.deleteCategory = async (req, res) => {
  try {
    const category = await service.deleteCategory(req.params.id);
    return res.status(200).json({ success: true, message: "Category deleted successfully", data: category });
  } catch (error) {
    const status = error.statusCode || (error.name === "CastError" ? 400 : 500);
    return res.status(status).json({ success: false, message: error.message });
  }
};

exports.getCategories = async (req, res) => {
  try {
    const categories = await service.getCategories();
    return res.status(200).json({ success: true, count: categories.length, data: categories });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};
