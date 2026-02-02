const Buyer = require ('../models/ServiceUser');
const Provider = require ('../models/ServiceProvider');

class FCMController {
  async registerFCMDevice (req, res) {
  try {
    const { fcmToken, deviceType, deviceId } = req.body;
    const { id, role } = req.user;

    if (!fcmToken) {
      return res.status(400).json({
        success: false,
        message: 'FCM token is required'
      });
    }

    const Model = role === 'buyer' ? Buyer : Provider;

    const update = {
      fcmToken,
      'device.type': deviceType || 'unknown',
     'device.id': deviceId,
     'device.updatedAt': new Date()

    };

    await Model.findByIdAndUpdate(id, update, { new: true });

    return res.status(200).json({
      success: true,
      message: 'FCM device registered successfully'
    });

  } catch (error) {
    console.error('FCM registration error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to register FCM device'
    });
  }
};
async removeToken(req, res) {
    try {
      const { id, role } = req.user;

     const Model = role === 'provider' ? Provider : Buyer;

    await Model.findByIdAndUpdate(id, {
      $unset: { fcmToken: 1 }
    });
      

      return res.status(200).json({
        success: true,
        message: 'FCM token removed successfully'
      });

    } catch (error) {
      console.error('Remove FCM token error:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to remove FCM token',
        error: error.message
      });
    }
  }

  async testNotification(req, res) {
    try {
    const { id, role } = req.user;
      const { title, message } = req.body;

      const notificationService = require('../src/services/notification.service');

     if (role === 'provider') {
      await notificationService.notifyProvider(id, {
        type: 'test',
        title: title || 'Test Notification',
        message: message || 'This is a test notification'
      });
    } else {
      await notificationService.notifyUser(id, {
        type: 'test',
        title: title || 'Test Notification',
        message: message || 'This is a test notification'
      });
    }
    return res.status(200).json({
      success: true,
      message: 'Test notification sent'
    });

    } catch (error) {
      console.error('Test notification error:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to send test notification',
        error: error.message
      });
    }
  }
}

module.exports = new FCMController();

