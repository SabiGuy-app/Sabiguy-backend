const ContactMessage = require("./contact.model");

exports.createContactMessage = (data) => ContactMessage.create(data);
