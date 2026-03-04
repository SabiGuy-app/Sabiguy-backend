const Chat = require ('../../models/Chat');
const notificationService = require ('./notification.service');
const Booking = require ('../../models/Bookings');

class ChatService {

    async canAccessChat(bookingId, userId) {
    try {
      const booking = await Booking.findById(bookingId)
        .populate('userId', 'fullName')
        .populate('providerId', 'fullName');

      if (!booking) {
        throw new Error('Booking not found');
      }

      // Define which statuses allow chatting
      const chatAllowedStatuses = [
        'provider_accepted',
        'confirmed',
        'in_progress',
        'completed',
        'awaiting_provider_acceptance',
        'pending_payment',
        'paid_escrow',
        'arrived_at_pickup',              
        'enroute_to_dropoff',             
        'arrived_at_dropoff',
      ];

      if (!chatAllowedStatuses.includes(booking.status)) {
        throw new Error(`Chat not available for booking status: ${booking.status}`);
      }

      // Check if user is either the customer or the provider
      const isCustomer = booking.userId._id.toString() === userId.toString();
      const isProvider = booking.providerId?._id.toString() === userId.toString();

      if (!isCustomer && !isProvider) {
        throw new Error('You are not authorized to access this chat');
      }

      return {
        allowed: true,
        booking,
        isCustomer,
        isProvider
      };

    } catch (error) {
      console.error('Can access chat error:', error);
      throw error;
    }
  }
  
    async getOrCreateChat(bookingId, userId = null) {
    try {
      // Get booking details
      const booking = await Booking.findById(bookingId)
        .populate('userId', 'fullName profilePicture email')
        .populate('providerId', 'fullName profilePicture email');

      if (!booking) {
        throw new Error('Booking not found');
      }

      // Check if chat already exists
      let chat = await Chat.findOne({ bookingId });

      if (!chat) {
        // Only create chat if provider has been assigned
        if (!booking.providerId) {
          throw new Error('Chat not available - no provider assigned yet');
        }

        // Create participants array
        const participants = [
          {
            userId: booking.userId._id,
            userModel: 'Buyer',
            name: booking.userId.fullName,
            avatar: booking.userId.profilePicture
          },
          {
            userId: booking.providerId._id,
            userModel: 'Provider',
            name: booking.providerId.fullName,
            avatar: booking.providerId.profilePicture
          }
        ];

        chat = await Chat.create({
          bookingId,
          participants
        });

        console.log(`✅ Chat created for booking: ${bookingId}`);
      }

      return chat;
    } catch (error) {
      console.error('Get or create chat error:', error);
      throw error;
    }
  }

  /**
   * Send a message
   */
  async sendMessage(bookingId, senderId, senderModel, messageData) {
    try {
      const { message, messageType = 'text', attachments = [] } = messageData;

      // Check if user can access this chat
      await this.canAccessChat(bookingId, senderId);

      // Get or create chat
      const chat = await this.getOrCreateChat(bookingId, senderId);

      // Create new message
      const newMessage = {
        senderId,
        senderModel,
        message,
        messageType,
        attachments,
        readBy: [{ userId: senderId, readAt: new Date() }]
      };

      chat.messages.push(newMessage);
      chat.lastMessage = {
        text: message,
        senderId,
        timestamp: new Date()
      };

      await chat.save();

      const savedMessage = chat.messages[chat.messages.length - 1];

      // Get receiver info
      const receiver = chat.participants.find(
        p => p.userId.toString() !== senderId.toString()
      );

      const sender = chat.participants.find(
        p => p.userId.toString() === senderId.toString()
      );

      // Send notification to receiver
      if (receiver) {
        await notificationService.sendNotification(
          receiver.userId,
          receiver.userModel,
          {
            type: 'new_message',
            title: '💬 New Message',
            message: `${sender?.name}: ${message.substring(0, 50)}${message.length > 50 ? '...' : ''}`,
            bookingId,
            chatId: chat._id,
            data: {
              messageId: savedMessage._id,
              senderId,
              senderName: sender?.name
            }
          }
        );
      }

      return {
        chat,
        message: savedMessage
      };

    } catch (error) {
      console.error('Send message error:', error);
      throw error;
    }
  }

  /**
   * Get chat messages with access validation
   */
  async getMessages(bookingId, userId, options = {}) {
    try {
      const { page = 1, limit = 50 } = options;

      // Check access
      await this.canAccessChat(bookingId, userId);

      const chat = await Chat.findOne({ bookingId });

      if (!chat) {
        // Return empty chat if it doesn't exist yet
        return {
          messages: [],
          pagination: { page, limit, total: 0, pages: 0 },
          participants: [],
          bookingId,
          chatAvailable: false
        };
      }

      // Get paginated messages
      const totalMessages = chat.messages.length;
      const skip = (page - 1) * limit;
      const messages = chat.messages
        .slice(Math.max(0, totalMessages - skip - limit), totalMessages - skip)
        .reverse();

      return {
        messages,
        pagination: {
          page,
          limit,
          total: totalMessages,
          pages: Math.ceil(totalMessages / limit)
        },
        participants: chat.participants,
        bookingId: chat.bookingId,
        chatAvailable: true
      };

    } catch (error) {
      console.error('Get messages error:', error);
      throw error;
    }
  }

  /**
   * Mark messages as read
   */
  async markAsRead(bookingId, userId) {
    try {
      const chat = await Chat.findOne({ bookingId });

      if (!chat) {
        throw new Error('Chat not found');
      }

      let updated = false;

      chat.messages.forEach(msg => {
        const alreadyRead = msg.readBy.some(
          r => r.userId.toString() === userId.toString()
        );

        if (!alreadyRead) {
          msg.readBy.push({ userId, readAt: new Date() });
          updated = true;
        }
      });

      // Update last read timestamp for participant
      const participant = chat.participants.find(
        p => p.userId.toString() === userId.toString()
      );

      if (participant) {
        participant.lastReadAt = new Date();
      }

      if (updated) {
        await chat.save();
      }

      return chat;

    } catch (error) {
      console.error('Mark as read error:', error);
      throw error;
    }
  }
  async getUserChats(userId, userModel) {
    try {
      const chats = await Chat.find({
        'participants.userId': userId,
        status: 'active'
      })
        .populate('bookingId', 'serviceType status subCategory')
         .populate({
        path: 'participants.userId',
        select: 'fullName profilePicture email avatar' // ✅ Add the fields you need
      })
        .sort({ 'lastMessage.timestamp': -1 })
        .lean();

      // Add unread count for each chat
      const chatsWithUnread = chats.map(chat => {
        const unreadCount = chat.messages.filter(msg => {
          const isRead = msg.readBy.some(
            r => r.userId.toString() === userId.toString()
          );
          return !isRead && msg.senderId.toString() !== userId.toString();
        }).length;

        const otherParticipant = chat.participants.find(
          p => p.userId.toString() !== userId.toString()
        );

        return {
          ...chat,
          unreadCount,
          otherParticipant,
          lastMessageTime: chat.lastMessage?.timestamp
        };
      });

      return chatsWithUnread;

    } catch (error) {
      console.error('Get user chats error:', error);
      throw error;
    }
  }
}

module.exports = new ChatService();
