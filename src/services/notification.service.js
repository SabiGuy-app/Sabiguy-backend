const admin = require("firebase-admin");
const Buyer = require("../../models/ServiceUser");
const Provider = require("../../models/ServiceProvider");
const Notification = require("../../models/Notification");

class NotificationService {
  constructor() {
    // Initialize Firebase Admin SDK
    if (!admin.apps.length) {
      try {
        admin.initializeApp({
          credential: admin.credential.cert({
            projectId: process.env.FIREBASE_PROJECT_ID,
            clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
            privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
          }),
        });
        console.log(process.env.FIREBASE_PROJECT_ID);

        console.log("✅ Firebase Admin initialized");
      } catch (error) {
        console.error("❌ Firebase initialization error:", error.message);
      }
    }

    // Socket.IO instance will be set from server
    this.io = null;
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
    };
    return map[type] || "bookings";
  }

  async getPreferences(recipientId, recipientModel) {
    const defaults = this.getDefaultPreferences();
    if (recipientModel === "Buyer") {
      const user = await Buyer.findById(recipientId).select(
        "notificationPreferences",
      );
      return user?.notificationPreferences || defaults;
    }
    const provider = await Provider.findById(recipientId).select(
      "notificationPreferences",
    );
    return provider?.notificationPreferences || defaults;
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

  /**
   * Set Socket.IO instance
   */
  setSocketIO(io) {
    this.io = io;
  }

  /**
   * Send notification to user
   * @param {String} userId
   * @param {Object} data - { type, title, message, bookingId, ... }
   */
  async notifyUser(userId, data) {
    try {
      const preferences = await this.getPreferences(userId, "Buyer");
      const decision = this.shouldNotify(preferences, data.type);
      if (!decision.allowInApp && !decision.allowPush) return null;

      const notification = decision.allowInApp
        ? await this.createNotification(userId, "Buyer", data)
        : null;

      const room = `buyer:${userId}`;

      // Real-time (Socket.IO)
      if (this.io && notification) {
        this.io.to(room).emit("new_notification", notification);
      }

      // Push (FCM)
      if (decision.allowPush) {
        await this.sendPushNotification(userId, "Buyer", data);
      }

      return notification;
    } catch (error) {
      console.error("Notify user error:", error.message);
    }
  }

  /**
   * Send notification to provider
   * @param {String} providerId
   * @param {Object} data
   */
  async notifyProvider(providerId, data) {
    try {
      const preferences = await this.getPreferences(providerId, "Provider");
      const decision = this.shouldNotify(preferences, data.type);
      if (!decision.allowInApp && !decision.allowPush) return null;

      const notification = decision.allowInApp
        ? await this.createNotification(providerId, "Provider", data)
        : null;

      const room = `provider:${providerId}`;

      // Real-time (Socket.IO)
      if (this.io && notification) {
        this.io.to(room).emit("new_notification", notification);
      }

      // Push (FCM)
      if (decision.allowPush) {
        await this.sendPushNotification(providerId, "Provider", data);
      }

      return notification;
    } catch (error) {
      console.error("Notify provider error:", error.message);
    }
  }

  async sendNotification(userId, userModel, data) {
    try {
      const preferences = await this.getPreferences(userId, userModel);
      const decision = this.shouldNotify(preferences, data.type);
      if (!decision.allowInApp && !decision.allowPush) return null;

      // Create notification in database
      const notification = decision.allowInApp
        ? await this.createNotification(userId, userModel, data)
        : null;

      // Determine the correct room based on userModel
      const room = `${userModel.toLowerCase()}:${userId}`;

      // Real-time notification via Socket.IO
      if (this.io && notification) {
        this.io.to(room).emit("new_notification", notification);
        console.log(`📢 Real-time notification sent to room: ${room}`);
      }

      // Push notification via FCM
      if (decision.allowPush) {
        await this.sendPushNotification(userId, userModel, data);
      }

      return notification;
    } catch (error) {
      console.error("Send notification error:", error.message);
      throw error;
    }
  }

  /**
   * Notify when booking is taken by another provider
   */
  async notifyBookingTaken(bookingId, acceptedProviderId) {
    try {
      // You'd get the list of notified providers from booking
      const Booking = require("../../models/Bookings");
      const booking = await Booking.findById(bookingId);

      if (!booking || !booking.notifiedProviders) return;

      // Notify all other providers
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

  /**
   * Create notification record in database
   * @private
   */
  async createNotification(recipientId, recipientModel, data) {
    try {
      const notification = await Notification.create({
        recipient: recipientId,
        recipientModel,
        type: data.type,
        title: data.title || this.getDefaultTitle(data.type),
        message: data.message,
        data: {
          bookingId: data.bookingId,
          ...data,
        },
        isRead: false,
      });

      return notification;
    } catch (error) {
      console.error("Create notification error:", error.message);
      return null;
    }
  }

  /**
   * Send push notification via Firebase Cloud Messaging
   * @private
   */
  async sendPushNotification(recipientId, recipientModel, data) {
    try {
      // Get user/provider FCM token from database
      let fcmToken;

      if (recipientModel === "Buyer") {
        const user = await Buyer.findById(recipientId).select("fcmToken");
        fcmToken = user?.fcmToken;
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
          body: data.message,
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
      console.error("Push notification error:", error.message);

      // If token is invalid, remove it from database
      if (
        error.code === "messaging/invalid-registration-token" ||
        error.code === "messaging/registration-token-not-registered"
      ) {
        await this.removeInvalidFCMToken(recipientId, recipientModel);
      }
    }
  }

  /**
   * Remove invalid FCM token
   * @private
   */
  async removeInvalidFCMToken(recipientId, recipientModel) {
    try {
      if (recipientModel === "Buyer") {
        await Buyer.findByIdAndUpdate(recipientId, { $unset: { fcmToken: 1 } });
      } else {
        await Provider.findByIdAndUpdate(recipientId, {
          $unset: { fcmToken: 1 },
        });
      }
    } catch (error) {
      console.error("Remove FCM token error:", error.message);
    }
  }

  /**
   * Get default notification title based on type
   * @private
   */
  getDefaultTitle(type) {
    const titles = {
      new_booking_request: "🔔 New Booking Request",
      provider_accepted: "✅ Provider Accepted",
      booking_selected: "🎉 You've Been Selected",
      booking_taken: "⚠️ Booking Taken",
      booking_cancelled: "❌ Booking Cancelled",
      payment_received: "💰 Payment Received",
      booking_completed: "✅ Booking Completed",
    };

    return titles[type] || "Notification";
  }

  /**
   * Mark notification as read
   */
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
