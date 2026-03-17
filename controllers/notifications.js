const Notification = require("../models/Notification");
const notificationService = require("../src/services/notification.service.js");
const Buyer = require("../models/ServiceUser");
const Provider = require("../models/ServiceProvider");

const DEFAULT_PREFERENCES = {
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
    types: ["wallet_funded", "wallet_payment", "payment_received", "payment_sent"],
  },
  promotions: {
    push: false,
    email: false,
    types: ["test"],
  },
};

class notificationController {
  /**
   * Get user/provider notifications with pagination
   */
  async getNotifications(req, res) {
    try {
      const userId = req.user.id;
      const { page = 1, limit = 20, type } = req.query;

      const skip = (parseInt(page) - 1) * parseInt(limit);

      // Build query
      const query = { recipient: userId };
      if (type) {
        query.type = type;
      }

      const notifications = await Notification.find(query)
        .sort({ createdAt: -1 })
        .limit(parseInt(limit))
        .skip(skip)
        .populate('data.bookingId', 'serviceType status createdAt');

      const total = await Notification.countDocuments(query);
      const unreadCount = await Notification.countDocuments({
        recipient: userId,
        isRead: false
      });

      return res.status(200).json({
        success: true,
        data: {
          notifications,
          pagination: {
            page: parseInt(page),
            limit: parseInt(limit),
            total,
            pages: Math.ceil(total / parseInt(limit))
          },
          unreadCount
        }
      });

    } catch (error) {
      console.error('Get notifications error:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch notifications',
        error: error.message
      });
    }
  }

  /**
   * Mark notification as read
   */
  async markAsRead(req, res) {
    try {
      const notificationId = req.params.id;
      const userId = req.user.id;

      const notification = await Notification.findOneAndUpdate(
        { _id: notificationId, recipient: userId },
        { isRead: true, readAt: new Date() },
        { new: true }
      );

      if (!notification) {
        return res.status(404).json({
          success: false,
          message: 'Notification not found'
        });
      }

      return res.status(200).json({
        success: true,
        message: 'Notification marked as read',
        data: { notification }
      });

    } catch (error) {
      console.error('Mark as read error:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to mark notification as read',
        error: error.message
      });
    }
  }

  /**
   * Mark all notifications as read
   */
  async markAllAsRead(req, res) {
    try {
      const userId = req.user.id;

      const result = await Notification.updateMany(
        { recipient: userId, isRead: false },
        { isRead: true, readAt: new Date() }
      );

      return res.status(200).json({
        success: true,
        message: 'All notifications marked as read',
        data: { updatedCount: result.modifiedCount }
      });

    } catch (error) {
      console.error('Mark all as read error:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to mark all notifications as read',
        error: error.message
      });
    }
  }

  /**
   * Delete notification
   */
  async deleteNotification(req, res) {
    try {
      const notificationId = req.params.id;
      const userId = req.user.id;

      const notification = await Notification.findOneAndDelete({
        _id: notificationId,
        recipient: userId
      });

      if (!notification) {
        return res.status(404).json({
          success: false,
          message: 'Notification not found'
        });
      }

      return res.status(200).json({
        success: true,
        message: 'Notification deleted'
      });

    } catch (error) {
      console.error('Delete notification error:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to delete notification',
        error: error.message
      });
    }
  }

  /**
   * Get unread count
   */
  async getUnreadCount(req, res) {
    try {
      const userId = req.user.id;

      const unreadCount = await Notification.countDocuments({
        recipient: userId,
        isRead: false
      });

      return res.status(200).json({
        success: true,
        data: { unreadCount }
      });

    } catch (error) {
      console.error('Get unread count error:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to get unread count',
        error: error.message
      });
    }
  }

  async getNotificationPreferences(req, res) {
    try {
      const userId = req.user.id;
      const role = req.user.role;
      const Model = role === "provider" ? Provider : Buyer;

      const user = await Model.findById(userId).select(
        "notificationPreferences",
      );
      if (!user) {
        return res.status(404).json({
          success: false,
          message: "User not found",
        });
      }

      return res.status(200).json({
        success: true,
        data: {
          notificationPreferences:
            user.notificationPreferences || DEFAULT_PREFERENCES,
        },
      });
    } catch (error) {
      console.error("Get notification preferences error:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to fetch notification preferences",
        error: error.message,
      });
    }
  }

  async updateNotificationPreferences(req, res) {
    try {
      const userId = req.user.id;
      const role = req.user.role;
      const Model = role === "provider" ? Provider : Buyer;
      const { notificationPreferences } = req.body;

      if (!notificationPreferences || typeof notificationPreferences !== "object") {
        return res.status(400).json({
          success: false,
          message: "notificationPreferences is required",
        });
      }

      const user = await Model.findById(userId).select(
        "notificationPreferences",
      );
      if (!user) {
        return res.status(404).json({
          success: false,
          message: "User not found",
        });
      }

      const current = user.notificationPreferences || DEFAULT_PREFERENCES;
      const merged = { ...current };

      Object.keys(DEFAULT_PREFERENCES).forEach((key) => {
        if (!notificationPreferences[key]) return;
        const incoming = notificationPreferences[key];
        const base = current[key] || DEFAULT_PREFERENCES[key];

        merged[key] = {
          push:
            typeof incoming.push === "boolean" ? incoming.push : base.push,
          email:
            typeof incoming.email === "boolean" ? incoming.email : base.email,
          types: Array.isArray(incoming.types) ? incoming.types : base.types,
        };
      });

      user.notificationPreferences = merged;
      await user.save();

      return res.status(200).json({
        success: true,
        message: "Notification preferences updated",
        data: { notificationPreferences: merged },
      });
    } catch (error) {
      console.error("Update notification preferences error:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to update notification preferences",
        error: error.message,
      });
    }
  }
}

module.exports = new notificationController();
