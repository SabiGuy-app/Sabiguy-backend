const admin = require ('firebase-admin');
const Buyer = require ('../../models/ServiceUser');
const Provider = require ('../../models/ServiceProvider');
const Notification = require ('../../models/Notification');

class NotificationService {
  constructor() {
    // Initialize Firebase Admin SDK
    if (!admin.apps.length) {
      try {
        admin.initializeApp({
          credential: admin.credential.cert({
            projectId: process.env.FIREBASE_PROJECT_ID,
            clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
            privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n')
          })
        });
        console.log(
  process.env.FIREBASE_PROJECT_ID
);

        console.log('✅ Firebase Admin initialized');
      } catch (error) {
        console.error('❌ Firebase initialization error:', error.message);
      }
    }

    // Socket.IO instance will be set from server
    this.io = null;
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
    const notification = await this.createNotification(
      userId,
      'Buyer',
      data
    );

    const room = `buyer:${userId}`;

    // Real-time (Socket.IO)
    if (this.io) {
      this.io.to(room).emit('notification', notification);
    }

    // Push (FCM)
    await this.sendPushNotification(userId, 'Buyer', data);

    return notification;
  } catch (error) {
    console.error('Notify user error:', error.message);
  }
}

  /**
   * Send notification to provider
   * @param {String} providerId
   * @param {Object} data
   */
  async notifyProvider(providerId, data) {
  try {
    const notification = await this.createNotification(
      providerId,
      'Provider',
      data
    );

    const room = `provider:${providerId}`;

    // Real-time (Socket.IO)
    if (this.io) {
      this.io.to(room).emit('notification', notification);
    }

    // Push (FCM)
    await this.sendPushNotification(providerId, 'Provider', data);

    return notification;
  } catch (error) {
    console.error('Notify provider error:', error.message);
  }
}

async sendNotification(userId, userModel, data) {
    try {
      // Create notification in database
      const notification = await this.createNotification(userId, userModel, data);

      // Determine the correct room based on userModel
      const room = `${userModel.toLowerCase()}:${userId}`;

      // Real-time notification via Socket.IO
      if (this.io) {
        this.io.to(room).emit('notification', notification);
        console.log(`📢 Real-time notification sent to room: ${room}`);
      }

      // Push notification via FCM
      await this.sendPushNotification(userId, userModel, data);

      return notification;
    } catch (error) {
      console.error('Send notification error:', error.message);
      throw error;
    }
  }

  /**
   * Notify when booking is taken by another provider
   */
  async notifyBookingTaken(bookingId, acceptedProviderId) {
    try {
      // You'd get the list of notified providers from booking
      const Booking = require ('../../models/Bookings')
      const booking = await Booking.findById(bookingId);

      if (!booking || !booking.notifiedProviders) return;

      // Notify all other providers
      const otherProviders = booking.notifiedProviders.filter(
        id => id.toString() !== acceptedProviderId.toString()
      );

      const notifications = otherProviders.map(providerId =>
        this.notifyProvider(providerId, {
          type: 'booking_taken',
          bookingId,
          message: 'This booking has been accepted by another provider'
        })
      );

      await Promise.all(notifications);
    } catch (error) {
      console.error('Notify booking taken error:', error.message);
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
          ...data
        },
        isRead: false
      });

      return notification;
    } catch (error) {
      console.error('Create notification error:', error.message);
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
      
      if (recipientModel === 'Buyer') {
        const user = await Buyer.findById(recipientId).select('fcmToken');
        fcmToken = user?.fcmToken;
      } else {
        const provider = await Provider.findById(recipientId).select('fcmToken');
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
          body: data.message
        },
        data: {
          type: data.type,
          bookingId: data.bookingId?.toString() || '',
          click_action: 'FLUTTER_NOTIFICATION_CLICK'
        },
        android: {
          priority: 'high',
          notification: {
            sound: 'default',
            channelId: 'bookings'
          }
        },
        apns: {
          payload: {
            aps: {
              sound: 'default',
              badge: 1
            }
          }
        }
      };

      await admin.messaging().send(message);
      console.log(`✅ Push notification sent to ${recipientModel}:${recipientId}`);
    } catch (error) {
      console.error('Push notification error:', error.message);
      
      // If token is invalid, remove it from database
      if (error.code === 'messaging/invalid-registration-token' ||
          error.code === 'messaging/registration-token-not-registered') {
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
      if (recipientModel === 'Buyer') {
        await Buyer.findByIdAndUpdate(recipientId, { $unset: { fcmToken: 1 } });
      } else {
        await Provider.findByIdAndUpdate(recipientId, { $unset: { fcmToken: 1 } });
      }
    } catch (error) {
      console.error('Remove FCM token error:', error.message);
    }
  }

  /**
   * Get default notification title based on type
   * @private
   */
  getDefaultTitle(type) {
    const titles = {
      new_booking_request: '🔔 New Booking Request',
      provider_accepted: '✅ Provider Accepted',
      booking_selected: '🎉 You\'ve Been Selected',
      booking_taken: '⚠️ Booking Taken',
      booking_cancelled: '❌ Booking Cancelled',
      payment_received: '💰 Payment Received',
      booking_completed: '✅ Booking Completed'
    };

    return titles[type] || 'Notification';
  }

  /**
   * Mark notification as read
   */
  async markAsRead(notificationId) {
    try {
      await Notification.findByIdAndUpdate(notificationId, {
        isRead: true,
        readAt: new Date()
      });
    } catch (error) {
      console.error('Mark as read error:', error.message);
    }
  }
}

module.exports = new NotificationService();

