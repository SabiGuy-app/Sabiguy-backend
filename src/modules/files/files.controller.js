const filesService = require("./files.service");

exports.uploadFile = async (req, res) => {
  try {
    const { email, category: rawCategory } = req.params;

    const savedFile = await filesService.uploadFile({
      email,
      rawCategory,
      file: req.file,
    });

    res.status(201).json({ success: true, file: savedFile });
  } catch (err) {
    if (err instanceof filesService.ValidationError) {
      return res.status(400).json({ message: err.message });
    }
    if (err instanceof filesService.NotFoundError) {
      return res.status(404).json({ message: err.message });
    }
    console.error("Upload error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};
