const contactRepository = require("./contact.repository");

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = "ValidationError";
  }
}

exports.submitContactForm = async ({
  firstName,
  lastName,
  email,
  project_description,
}) => {
  if (!firstName || !lastName || !email || !project_description) {
    throw new ValidationError(
      "firstName, lastName, email, and project_description are required",
    );
  }

  if (!emailRegex.test(email)) {
    throw new ValidationError("Invalid email format");
  }

  const message = await contactRepository.createContactMessage({
    firstName: String(firstName).trim(),
    lastName: String(lastName).trim(),
    email: String(email).trim().toLowerCase(),
    project_description: String(project_description).trim(),
  });

  return message;
};

exports.ValidationError = ValidationError;
