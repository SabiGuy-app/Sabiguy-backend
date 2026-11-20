const axios = require("axios");

const DOJAH_NIN_URL =
  process.env.DOJAH_NIN_URL || "https://sandbox.dojah.io/api/v1/kyc/nin/";

async function verifyNin(nin) {
  const authorization = process.env.DOJAH_SECRET_KEY;
  const appId = process.env.DOJAH_APP_ID;

  if (!authorization || !appId) {
    const error = new Error("Dojah NIN verification is not configured");
    error.statusCode = 503;
    throw error;
  }

  const response = await axios.get(DOJAH_NIN_URL, {
    params: { nin },
    headers: { Authorization: authorization, AppId: appId },
    timeout: 15000,
  });

  return response.data;
}

module.exports = { verifyNin };
