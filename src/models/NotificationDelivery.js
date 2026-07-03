const mongoose = require('mongoose');

const notificationDeliverySchema = new mongoose.Schema({
  notificationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Notification',
    required: true,
    index: true,
  },
  channel: {
    type: String,
    required: true,
    enum: ['IN_APP', 'EMAIL', 'PUSH'],
  },
  status: {
    type: String,
    required: true,
    enum: ['PENDING', 'PROCESSING', 'SENT', 'FAILED'],
    default: 'PENDING',
  },
  attempts: {
    type: Number,
    default: 0,
  },
  sentAt: {
    type: Date,
    default: null,
  },
  errorMessage: {
    type: String,
    default: null,
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('NotificationDelivery', notificationDeliverySchema);
