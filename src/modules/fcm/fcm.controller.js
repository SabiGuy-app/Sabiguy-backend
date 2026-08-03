const fcmService = require("./fcm.service");

class FCMController {
  async registerFCMDevice(req, res) {
    try {
      const { fcmToken, deviceType, deviceId } = req.body;
      const { id, role } = req.user;

      await fcmService.registerFCMDevice(id, role, {
        fcmToken,
        deviceType,
        deviceId,
      });

      return res.status(200).json({
        success: true,
        message: "FCM device registered successfully",
      });
    } catch (error) {
      if (error instanceof fcmService.ValidationError) {
        return res.status(400).json({
          success: false,
          message: error.message,
        });
      }
      console.error("FCM registration error:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to register FCM device",
      });
    }
  }

  async removeToken(req, res) {
    try {
      const { id, role } = req.user;

      await fcmService.removeToken(id, role);

      return res.status(200).json({
        success: true,
        message: "FCM token removed successfully",
      });
    } catch (error) {
      console.error("Remove FCM token error:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to remove FCM token",
        error: error.message,
      });
    }
  }

  async testNotification(req, res) {
    try {
      const { id, role } = req.user;
      const { title, message } = req.body;

      await fcmService.testNotification(id, role, { title, message });

      return res.status(200).json({
        success: true,
        message: "Test notification sent",
      });
    } catch (error) {
      console.error("Test notification error:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to send test notification",
        error: error.message,
      });
    }
  }
}

module.exports = new FCMController();
