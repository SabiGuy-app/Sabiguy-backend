const admin = require("firebase-admin");
const Buyer = require("../../models/ServiceUser");
const Provider = require("../../models/ServiceProvider");
const Business = require("../modules/business/business.model");
const Notification = require("../modules/notifications/notification.model");

class NotificationService {
  constructor() {
    this.io = null;
    this.firebaseInitialized = false;

    if (!admin.apps.length) {
      if (!process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
        console.error(
          "❌ FIREBASE_SERVICE_ACCOUNT_KEY environment variable is not set",
        );
        console.error(
          "⚠️ Push notifications will not work until Firebase credentials are configured",
        );
      } else {
        try {
          const serviceAccount = JSON.parse(
            Buffer.from(
              process.env.FIREBASE_SERVICE_ACCOUNT_KEY,
              "base64",
            ).toString("utf8"),
          );
          admin.initializeApp({
            credential: admin.credential.cert(serviceAccount),
          });
          this.firebaseInitialized = true;
          console.log("✅ Firebase Admin initialized");
        } catch (error) {
          console.error("❌ Firebase initialization error:", error.message);
          console.error(
            "⚠️ Make sure FIREBASE_SERVICE_ACCOUNT_KEY is a valid base64-encoded JSON string",
          );
        }
      }
    } else {
      this.firebaseInitialized = true;
    }
  }

  getDefaultPreferences() {
    return {
      bookings: {
        push: true,
        email: true,
        types: [
          "new_booking_request",
          "provider_accepted",
          "booking_selected",
          "booking_cancelled",
          "booking_status_updated",
          "booking_taken",
          "counter_offer",
          "booking_disputed",
          "booking_completed_awaiting_acceptance",
          "booking_auto_completed",
        ],
      },
      jobCompleted: {
        push: true,
        email: true,
        types: ["job_started", "booking_completed", "job_completed_confirmed"],
      },
      chatMessages: {
        push: true,
        email: false,
        types: ["new_message", "message_received"],
      },
      walletPayments: {
        push: true,
        email: true,
        types: [
          "wallet_funded",
          "wallet_payment",
          "payment_received",
          "payment_sent",
        ],
      },
      promotions: {
        push: false,
        email: false,
        types: ["test"],
      },
    };
  }

  getTypeCategory(type) {
    const map = {
      new_booking_request: "bookings",
      provider_accepted: "bookings",
      booking_selected: "bookings",
      booking_cancelled: "bookings",
      booking_status_updated: "bookings",
      booking_taken: "bookings",
      counter_offer: "bookings",
      booking_disputed: "bookings",
      booking_auto_completed: "bookings",
      job_started: "jobCompleted",
      booking_completed: "jobCompleted",
      job_completed_confirmed: "jobCompleted",
      new_message: "chatMessages",
      message_received: "chatMessages",
      wallet_funded: "walletPayments",
      wallet_payment: "walletPayments",
      payment_received: "walletPayments",
      payment_sent: "walletPayments",
      test: "promotions",
      // Fleet/driver-invitation events don't have a dedicated preference
      // category yet, so they ride on "bookings" (closest existing fit).
      driver_invitation_received: "bookings",
      driver_invitation_accepted: "bookings",
      driver_invitation_rejected: "bookings",
    };
    return map[type] || "bookings";
  }

  mergeNotificationPreferences(preferences) {
    const defaults = this.getDefaultPreferences();
    const merged = {};

    for (const key of Object.keys(defaults)) {
      const base = defaults[key];
      const incoming = preferences?.[key] || {};
      const baseTypes = Array.isArray(base.types) ? base.types : [];
      const incomingTypes = Array.isArray(incoming.types) ? incoming.types : [];

      merged[key] = {
        push: typeof incoming.push === "boolean" ? incoming.push : base.push,
        email:
          typeof incoming.email === "boolean" ? incoming.email : base.email,
        types: Array.from(new Set([...baseTypes, ...incomingTypes])),
      };
    }

    return merged;
  }

  async getPreferences(recipientId, recipientModel) {
    if (recipientModel === "Buyer") {
      const user = await Buyer.findById(recipientId).select(
        "notificationPreferences",
      );
      return this.mergeNotificationPreferences(user?.notificationPreferences);
    }
    const provider = await Provider.findById(recipientId).select(
      "notificationPreferences",
    );
    return this.mergeNotificationPreferences(provider?.notificationPreferences);
  }

  shouldNotify(preferences, type) {
    const category = this.getTypeCategory(type);
    const categoryPrefs = preferences?.[category] || {};
    const types = Array.isArray(categoryPrefs.types) ? categoryPrefs.types : [];
    const enabledByType = types.length === 0 || types.includes(type);
    const pushEnabled = Boolean(categoryPrefs.push) && enabledByType;
    const emailEnabled = Boolean(categoryPrefs.email) && enabledByType;
    const allowInApp = pushEnabled || emailEnabled;
    return { allowInApp, allowPush: pushEnabled, allowEmail: emailEnabled };
  }

  resolveNotificationMessage(data) {
    return data?.message || data?.body || "";
  }

  setSocketIO(io) {
    this.io = io;
  }

  logNotificationError(operation, recipientId, recipientModel, error) {
    console.error(
      `[NotificationService] ${operation} failed for ${recipientModel}:${recipientId}`,
      error,
    );
  }

  async notifyUser(userId, data) {
    try {
      const preferences = await this.getPreferences(userId, "Buyer");
      const decision = this.shouldNotify(preferences, data.type);
      if (!decision.allowInApp && !decision.allowPush) {
        console.warn(
          `[NotificationService] Skipping notifyUser for Buyer:${userId} due to notification preferences`,
          {
            type: data.type,
            category: this.getTypeCategory(data.type),
            preferences,
          },
        );
        return null;
      }

      const notification = decision.allowInApp
        ? await this.createNotification(userId, "Buyer", data)
        : null;

      const room = `buyer:${userId}`;

      if (this.io && notification) {
        this.io.to(room).emit("new_notification", notification);
      }

      if (decision.allowPush) {
        try {
          await this.sendPushNotification(userId, "Buyer", data);
        } catch (error) {
          this.logNotificationError("notifyUser:push", userId, "Buyer", error);
        }
      }

      return notification;
    } catch (error) {
      this.logNotificationError("notifyUser", userId, "Buyer", error);
      throw error;
    }
  }

  async notifyProvider(providerId, data) {
    try {
      const preferences = await this.getPreferences(providerId, "Provider");
      const decision = this.shouldNotify(preferences, data.type);
      if (!decision.allowInApp && !decision.allowPush) {
        console.warn(
          `[NotificationService] Skipping notifyProvider for Provider:${providerId} due to notification preferences`,
          {
            type: data.type,
            category: this.getTypeCategory(data.type),
            preferences,
          },
        );
        return null;
      }

      const notification = decision.allowInApp
        ? await this.createNotification(providerId, "Provider", data)
        : null;

      const room = `provider:${providerId}`;

      if (this.io && notification) {
        this.io.to(room).emit("new_notification", notification);
      }

      if (decision.allowPush) {
        try {
          await this.sendPushNotification(providerId, "Provider", data);
        } catch (error) {
          this.logNotificationError(
            "notifyProvider:push",
            providerId,
            "Provider",
            error,
          );
        }
      }

      return notification;
    } catch (error) {
      this.logNotificationError(
        "notifyProvider",
        providerId,
        "Provider",
        error,
      );
      throw error;
    }
  }

  // Business accounts don't have a `notificationPreferences` block on their
  // model (unlike Buyer/Provider), so this intentionally skips the
  // preference-gating that notifyUser/notifyProvider do and always creates
  // the in-app record, sending a push if an fcmToken is present.
  async notifyBusiness(businessId, data) {
    try {
      const notification = await this.createNotification(
        businessId,
        "Business",
        data,
      );

      const room = `business:${businessId}`;
      if (this.io && notification) {
        this.io.to(room).emit("new_notification", notification);
      }

      await this.sendPushNotification(businessId, "Business", data).catch(
        (error) => {
          this.logNotificationError(
            "notifyBusiness:push",
            businessId,
            "Business",
            error,
          );
        },
      );

      return notification;
    } catch (error) {
      this.logNotificationError("notifyBusiness", businessId, "Business", error);
      throw error;
    }
  }

  async sendNotification(userId, userModel, data) {
    try {
      const preferences = await this.getPreferences(userId, userModel);
      const decision = this.shouldNotify(preferences, data.type);
      if (!decision.allowInApp && !decision.allowPush) {
        console.warn(
          `[NotificationService] Skipping sendNotification for ${userModel}:${userId} due to notification preferences`,
          {
            type: data.type,
            category: this.getTypeCategory(data.type),
            preferences,
          },
        );
        return null;
      }

      const notification = decision.allowInApp
        ? await this.createNotification(userId, userModel, data)
        : null;

      const room = `${userModel.toLowerCase()}:${userId}`;

      if (this.io && notification) {
        this.io.to(room).emit("new_notification", notification);
        console.log(`📢 Real-time notification sent to room: ${room}`);
      }

      if (decision.allowPush) {
        try {
          await this.sendPushNotification(userId, userModel, data);
        } catch (error) {
          this.logNotificationError(
            "sendNotification:push",
            userId,
            userModel,
            error,
          );
        }
      }

      return notification;
    } catch (error) {
      this.logNotificationError("sendNotification", userId, userModel, error);
      throw error;
    }
  }

  async notifyBookingTaken(bookingId, acceptedProviderId) {
    try {
      const Booking = require("../modules/bookings/bookings.model");
      const booking = await Booking.findById(bookingId);

      if (!booking || !booking.notifiedProviders) return;

      const otherProviders = booking.notifiedProviders.filter(
        (id) => id.toString() !== acceptedProviderId.toString(),
      );

      const notifications = otherProviders.map((providerId) =>
        this.notifyProvider(providerId, {
          type: "booking_taken",
          bookingId,
          message: "This booking has been accepted by another provider",
        }),
      );

      await Promise.all(notifications);
    } catch (error) {
      console.error("Notify booking taken error:", error.message);
    }
  }

  async createNotification(recipientId, recipientModel, data) {
    try {
      const notification = await Notification.create({
        recipient: recipientId,
        recipientModel,
        type: data.type,
        title: data.title || this.getDefaultTitle(data.type),
        message: this.resolveNotificationMessage(data),
        data: {
          bookingId: data.bookingId,
          ...data,
        },
        isRead: false,
      });

      return notification;
    } catch (error) {
      this.logNotificationError(
        "createNotification",
        recipientId,
        recipientModel,
        error,
      );
      throw error;
    }
  }

  async sendPushNotification(recipientId, recipientModel, data) {
    try {
      if (!this.firebaseInitialized) {
        console.warn(
          `⚠️ Firebase not initialized. Push notification skipped for ${recipientModel}:${recipientId}`,
        );
        return;
      }

      let fcmToken;

      if (recipientModel === "Buyer") {
        const user = await Buyer.findById(recipientId).select("fcmToken");
        fcmToken = user?.fcmToken;
      } else if (recipientModel === "Business") {
        const business =
          await Business.findById(recipientId).select("fcmToken");
        fcmToken = business?.fcmToken;
      } else {
        const provider =
          await Provider.findById(recipientId).select("fcmToken");
        fcmToken = provider?.fcmToken;
      }

      if (!fcmToken) {
        console.log(`No FCM token for ${recipientModel}:${recipientId}`);
        return;
      }

      const message = {
        token: fcmToken,
        notification: {
          title: data.title || this.getDefaultTitle(data.type),
          body: this.resolveNotificationMessage(data),
        },
        data: {
          type: data.type,
          bookingId: data.bookingId?.toString() || "",
          click_action: "FLUTTER_NOTIFICATION_CLICK",
        },
        android: {
          priority: "high",
          notification: {
            sound: "default",
            channelId: "bookings",
          },
        },
        apns: {
          payload: {
            aps: {
              sound: "default",
              badge: 1,
            },
          },
        },
      };

      await admin.messaging().send(message);
      console.log(
        `✅ Push notification sent to ${recipientModel}:${recipientId}`,
      );
    } catch (error) {
      this.logNotificationError(
        "sendPushNotification",
        recipientId,
        recipientModel,
        error,
      );

      if (
        error.code === "messaging/invalid-registration-token" ||
        error.code === "messaging/registration-token-not-registered"
      ) {
        await this.removeInvalidFCMToken(recipientId, recipientModel);
      }

      throw error;
    }
  }

  async removeInvalidFCMToken(recipientId, recipientModel) {
    try {
      if (recipientModel === "Buyer") {
        await Buyer.findByIdAndUpdate(recipientId, { $unset: { fcmToken: 1 } });
      } else if (recipientModel === "Business") {
        await Business.findByIdAndUpdate(recipientId, {
          $unset: { fcmToken: 1 },
        });
      } else {
        await Provider.findByIdAndUpdate(recipientId, {
          $unset: { fcmToken: 1 },
        });
      }
    } catch (error) {
      console.error("Remove FCM token error:", error.message);
    }
  }

  getDefaultTitle(type) {
    const titles = {
      new_booking_request: "🔔 New Booking Request",
      provider_accepted: "✅ Provider Accepted",
      booking_selected: "🎉 You've Been Selected",
      booking_taken: "⚠️ Booking Taken",
      booking_cancelled: "❌ Booking Cancelled",
      payment_received: "💰 Payment Received",
      booking_completed: "✅ Booking Completed",
      booking_disputed: "⚠️ Booking Disputed",
      booking_auto_completed: " ⚠️ Booking Auto completed",
      booking_completed_awaiting_acceptance:
        "⚠️ Booking Completed - Awaiting Your Acceptance",
      driver_invitation_received: "🚚 New Fleet Invitation",
      driver_invitation_accepted: "✅ Driver Accepted Invitation",
      driver_invitation_rejected: "❌ Driver Declined Invitation",
    };

    return titles[type] || "Notification";
  }

  async markAsRead(notificationId) {
    try {
      await Notification.findByIdAndUpdate(notificationId, {
        isRead: true,
        readAt: new Date(),
      });
    } catch (error) {
      console.error("Mark as read error:", error.message);
    }
  }
}

module.exports = new NotificationService();
