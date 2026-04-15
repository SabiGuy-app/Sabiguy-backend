import admin from "firebase-admin";
import dotenv from "dotenv";

dotenv.config();

let firebaseAdmin;

if (!admin.apps.length) {
  if (!process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
    console.error(
      "❌ FIREBASE_SERVICE_ACCOUNT_KEY environment variable is not set",
    );
    console.error(
      "⚠️  Firebase Admin SDK will not be initialized. Push notifications will not work.",
    );
  } else {
    try {
      const serviceAccount = JSON.parse(
        Buffer.from(
          process.env.FIREBASE_SERVICE_ACCOUNT_KEY,
          "base64",
        ).toString("utf8"),
      );

      firebaseAdmin = admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      });
      console.log("✅ Firebase Admin initialized successfully");
    } catch (error) {
      console.error("❌ Firebase initialization error:", error.message);
      console.error(
        "⚠️  Make sure FIREBASE_SERVICE_ACCOUNT_KEY is a valid base64-encoded JSON string",
      );
    }
  }
} else {
  firebaseAdmin = admin.apps[0];
}

export { admin };
