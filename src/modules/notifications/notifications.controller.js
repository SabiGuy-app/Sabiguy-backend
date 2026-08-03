const notificationsService = require("./notifications.service");

class NotificationController {
  async getNotifications(req, res) {
    try {
      const userId = req.user.id;
      const { page = 1, limit = 20, type } = req.query;

      const result = await notificationsService.getNotifications(userId, {
        page,
        limit,
        type,
      });

      return res.status(200).json({
        success: true,
        data: result,
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

  async markAsRead(req, res) {
    try {
      const notificationId = req.params.id;
      const userId = req.user.id;

      const notification = await notificationsService.markAsRead(
        notificationId,
        userId,
      );

      return res.status(200).json({
        success: true,
        message: 'Notification marked as read',
        data: { notification }
      });
    } catch (error) {
      if (error instanceof notificationsService.NotFoundError) {
        return res.status(404).json({
          success: false,
          message: error.message
        });
      }
      console.error('Mark as read error:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to mark notification as read',
        error: error.message
      });
    }
  }

  async markAllAsRead(req, res) {
    try {
      const userId = req.user.id;

      const updatedCount = await notificationsService.markAllAsRead(userId);

      return res.status(200).json({
        success: true,
        message: 'All notifications marked as read',
        data: { updatedCount }
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

  async deleteNotification(req, res) {
    try {
      const notificationId = req.params.id;
      const userId = req.user.id;

      await notificationsService.deleteNotification(notificationId, userId);

      return res.status(200).json({
        success: true,
        message: 'Notification deleted'
      });
    } catch (error) {
      if (error instanceof notificationsService.NotFoundError) {
        return res.status(404).json({
          success: false,
          message: error.message
        });
      }
      console.error('Delete notification error:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to delete notification',
        error: error.message
      });
    }
  }

  async getUnreadCount(req, res) {
    try {
      const userId = req.user.id;

      const unreadCount = await notificationsService.getUnreadCount(userId);

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

      const notificationPreferences =
        await notificationsService.getNotificationPreferences(userId, role);

      return res.status(200).json({
        success: true,
        data: { notificationPreferences },
      });
    } catch (error) {
      if (error instanceof notificationsService.NotFoundError) {
        return res.status(404).json({
          success: false,
          message: error.message,
        });
      }
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
      const { notificationPreferences } = req.body;

      const merged = await notificationsService.updateNotificationPreferences(
        userId,
        role,
        notificationPreferences,
      );

      return res.status(200).json({
        success: true,
        message: "Notification preferences updated",
        data: { notificationPreferences: merged },
      });
    } catch (error) {
      if (error instanceof notificationsService.ValidationError) {
        return res.status(400).json({
          success: false,
          message: error.message,
        });
      }
      if (error instanceof notificationsService.NotFoundError) {
        return res.status(404).json({
          success: false,
          message: error.message,
        });
      }
      console.error("Update notification preferences error:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to update notification preferences",
        error: error.message,
      });
    }
  }
}

module.exports = new NotificationController();
