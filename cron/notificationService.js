/**
 * Notification Service Wrapper for Cron Jobs
 * This module wraps the main notification service for use in cron jobs
 * Uses HTTP to notify the main server to broadcast notifications via Socket.io
 */

const notificationService = require("../src/services/notification.service");
const axios = require("axios");

class CronNotificationService {
  constructor() {
    this.notificationService = notificationService;
  }

  async broadcastNotificationViaHttp(room, notification) {
    try {
      const internalSecret =
        process.env.INTERNAL_API_SECRET || "internal-secret";
      const serverUrl = process.env.SERVER_URL || "http://localhost:5000";

      await axios.post(
        `${serverUrl}/api/v1/notifications/broadcast`,
        {
          room,
          notification,
        },
        {
          headers: {
            Authorization: `Bearer ${internalSecret}`,
          },
        },
      );
      console.log(`📡 Notification broadcasted to room: ${room}`);
    } catch (error) {
      console.warn(
        `⚠️ Could not broadcast via HTTP (Socket.io may still work if Redis is connected): ${error.message}`,
      );
    }
  }

  /**
   * Notify a user (service user/buyer)
   * @param {String} userId - The user's ID
   * @param {Object} data - Notification data
   */
  async notifyUser(userId, data) {
    try {
      // Use the notifyUser method from the main notification service
      const notification = await this.notificationService.notifyUser(
        userId,
        data,
      );

      // Broadcast to Socket.io via HTTP
      if (notification) {
        const room = `buyer:${userId}`;
        await this.broadcastNotificationViaHttp(room, notification);
      }

      return true;
    } catch (error) {
      console.error(`Error notifying user ${userId}:`, error.message);
      throw error;
    }
  }

  /**
   * Notify a provider
   * @param {String} providerId - The provider's ID
   * @param {Object} data - Notification data
   */
  async notifyProvider(providerId, data) {
    try {
      // Use the notifyProvider method from the main notification service
      const notification = await this.notificationService.notifyProvider(
        providerId,
        data,
      );

      // Broadcast to Socket.io via HTTP
      if (notification) {
        const room = `provider:${providerId}`;
        await this.broadcastNotificationViaHttp(room, notification);
      }

      return true;
    } catch (error) {
      console.error(`Error notifying provider ${providerId}:`, error.message);
      throw error;
    }
  }

  /**
   * Send a generic notification
   * @param {String} recipientId - The recipient's ID
   * @param {String} recipientModel - The model type ('User' or 'Provider')
   * @param {Object} data - Notification data
   */
  async sendNotification(recipientId, recipientModel, data) {
    try {
      const notification = await this.notificationService.sendNotification(
        recipientId,
        recipientModel,
        data,
      );

      // Broadcast to Socket.io via HTTP
      if (notification) {
        const room = `${recipientModel.toLowerCase()}:${recipientId}`;
        await this.broadcastNotificationViaHttp(room, notification);
      }

      return true;
    } catch (error) {
      console.error(
        `Error sending notification to ${recipientModel} ${recipientId}:`,
        error.message,
      );
      throw error;
    }
  }
}

module.exports = new CronNotificationService();
