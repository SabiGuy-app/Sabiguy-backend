const mongoose = require("mongoose");

const accountLinkSchema = new mongoose.Schema(
  {
    profiles: [
      {
        role: {
          type: String,
          enum: ["buyer", "provider", "businessOwner"],
          required: true,
        },
        profileId: {
          type: mongoose.Schema.Types.ObjectId,
          required: true,
        },
      },
    ],
  },
  { timestamps: true },
);

accountLinkSchema.index(
  { "profiles.role": 1, "profiles.profileId": 1 },
);

module.exports = mongoose.model("AccountLink", accountLinkSchema);
