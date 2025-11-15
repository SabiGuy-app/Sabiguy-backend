const mongoose = require ('mongoose');

const fileSchema = new mongoose.Schema({
  filename: String,
  url: String,
  resource_type: String,
  createdAt: {
    type: Date,
    default: Date.now,
  },
email:  String,
category:  String,
provider: { type: mongoose.Schema.Types.ObjectId, ref: "Provider", default: null },
buyer: { type: mongoose.Schema.Types.ObjectId, ref: "Buyer", default: null },
//   admin: { type: mongoose.Schema.Types.ObjectId, ref: "Admin", default: null },

});

module.exports= mongoose.model('File', fileSchema);
