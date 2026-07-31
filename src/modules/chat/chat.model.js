const mongoose = require ('mongoose');

const messageSchema = new mongoose.Schema({
    senderId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    refPath: 'senderModel'
  },
  senderModel: {
    type: String,
    required: true,
    enum: ['User', 'Buyer', 'Provider']
  },
  message: {
    type: String,
    required: true,
    trim: true
  },
  messageType: {
    type: String,
    enum: ['text', 'image', 'file', 'location', 'system'],
    default: 'text'
  },
  attachments: [{
    url: String,
    type: String, // image, document, etc.
    size: Number,
    name: String
  }],
  readBy: [{
    userId: mongoose.Schema.Types.ObjectId,
    readAt: Date
  }],
  isEdited: {
    type: Boolean,
    default: false
  },
  editedAt: Date
}, {
  timestamps: true
});

const chatSchema = new mongoose.Schema ({
    bookingId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Booking',
    required: true,
    unique: true // One chat per booking
  },
  participants: [{
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      refPath: 'participants.userModel'
    },
    userModel: {
      type: String,
      required: true,
      enum: ['User', 'Buyer', 'Provider']
    },
    name: String,
    avatar: String,
    lastReadAt: Date
  }],
  messages: [messageSchema],
  lastMessage: {
    text: String,
    senderId: mongoose.Schema.Types.ObjectId,
    timestamp: Date
  },
  status: {
    type: String,
    enum: ['active', 'archived', 'blocked'],
    default: 'active'
  }
}, {
  timestamps: true
});

// Index for efficient queries
chatSchema.index({ bookingId: 1 });
chatSchema.index({ 'participants.userId': 1 });
chatSchema.index({ 'messages.createdAt': -1 });

module.exports = mongoose.model('Chat', chatSchema);
