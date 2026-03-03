const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  recipient: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    refPath: 'recipientModel'
  },
  recipientModel: {
    type: String,
    required: true,
    enum: ['Buyer', 'Provider']
  },
  type: {
    type: String,
    required: true,
    enum: [
      'new_booking_request',
      'provider_accepted',
      'booking_selected',
      'wallet_funded',
      'wallet_payment',
      'booking_taken',
      'booking_cancelled',
      'job_started',
      'payment_received',
       'payment_sent',
      'booking_completed',
      'message_received',
      'test',
      'counter_offer',
      'job_completed_confirmed',
      'new_message',
      'booking_status_updated'
    ]
  },
  title: {
    type: String,
    required: true
  },
  message: {
    type: String,
    required: true
  },
  data: {
    bookingId: mongoose.Schema.Types.ObjectId,
    // Other dynamic data
    type: mongoose.Schema.Types.Mixed
  },
  isRead: {
    type: Boolean,
    default: false
  },
  readAt: Date
}, {
  timestamps: true
});

notificationSchema.index({ recipient: 1, createdAt: -1 });
notificationSchema.index({ recipient: 1, isRead: 1 });

module.exports = mongoose.model('Notification', notificationSchema);