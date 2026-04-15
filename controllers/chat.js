const chatService = require('../src/services/chat.service');

class ChatController {
  async sendMessage(req, res) {
    try {
      const userId = req.user.id;
      const userModel = req.user.role === 'provider' ? 'Provider' : 'Buyer';
      const { bookingId } = req.params;
      const messageData = req.body;

      const result = await chatService.sendMessage(
        bookingId,
        userId,
        userModel,
        messageData
      );

      return res.status(200).json({
        success: true,
        message: 'Message sent',
        data: result.message
      });

    } catch (error) {
      console.error('Send message error:', error);
      return res.status(500).json({
        success: false,
        message: error.message || 'Failed to send message'
      });
    }
  }

  async getMessages(req, res) {
    try {
      const userId = req.user.id;
      const { bookingId } = req.params;
      const { page, limit, status } = req.query;

      const result = await chatService.getMessages(
        bookingId,
        userId,
        { page: parseInt(page), limit: parseInt(limit), status }
      );

      return res.status(200).json({
        success: true,
        data: result
      });

    } catch (error) {
      console.error('Get messages error:', error);
      return res.status(500).json({
        success: false,
        message: error.message || 'Failed to get messages'
      });
    }
  }

  async getUserChats(req, res) {
    try {
      const userId = req.user.id;
      const userModel = req.user.role === 'provider' ? 'Provider' : 'Buyer';
      const statusCategory =
        req.query.statusCategory || req.query.bookingStatusCategory;

      const chats = await chatService.getUserChats(userId, userModel, {
        statusCategory,
      });

      return res.status(200).json({
        success: true,
        data: chats
      });

    } catch (error) {
      console.error('Get user chats error:', error);
      return res.status(500).json({
        success: false,
        message: error.message || 'Failed to get chats'
      });
    }
  }

  async markAsRead(req, res) {
    try {
      const userId = req.user.id;
      const { bookingId } = req.params;

      await chatService.markAsRead(bookingId, userId);

      return res.status(200).json({
        success: true,
        message: 'Messages marked as read'
      });

    } catch (error) {
      console.error('Mark as read error:', error);
      return res.status(500).json({
        success: false,
        message: error.message || 'Failed to mark as read'
      });
    }
  }
}

module.exports = new ChatController();
