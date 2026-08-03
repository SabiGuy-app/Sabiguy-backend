const contactService = require("./contact.service");

exports.submitContactForm = async (req, res) => {
  try {
    const { firstName, lastName, email, project_description } = req.body;

    const message = await contactService.submitContactForm({
      firstName,
      lastName,
      email,
      project_description,
    });

    return res.status(201).json({
      success: true,
      message: "Contact form submitted successfully",
      data: {
        id: message._id,
      },
    });
  } catch (error) {
    if (error instanceof contactService.ValidationError) {
      return res.status(400).json({
        success: false,
        message: error.message,
      });
    }

    return res.status(500).json({
      success: false,
      message: "Failed to submit contact form",
      error: error.message,
    });
  }
};
