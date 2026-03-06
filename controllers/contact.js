const ContactMessage = require("../models/ContactMessage");

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

exports.submitContactForm = async (req, res) => {
  try {
    const { firstName, lastName, email, project_description } = req.body;

    if (!firstName || !lastName || !email || !project_description) {
      return res.status(400).json({
        success: false,
        message:
          "firstName, lastName, email, and project_description are required",
      });
    }

    if (!emailRegex.test(email)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid email format" });
    }

    const message = await ContactMessage.create({
      firstName: String(firstName).trim(),
      lastName: String(lastName).trim(),
      email: String(email).trim().toLowerCase(),
      project_description: String(project_description).trim(),
    });

    return res.status(201).json({
      success: true,
      message: "Contact form submitted successfully",
      data: {
        id: message._id,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to submit contact form",
      error: error.message,
    });
  }
};
