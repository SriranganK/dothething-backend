const mongoose = require('mongoose');

const notificationPreferenceSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true,
    index: true,
  },
  emailMentions: {
    type: Boolean,
    default: true,
  },
  emailAssignments: {
    type: Boolean,
    default: true,
  },
  emailReminders: {
    type: Boolean,
    default: true,
  },
  emailAnnouncements: {
    type: Boolean,
    default: true,
  },
  pushEnabled: {
    type: Boolean,
    default: true,
  },
  soundEnabled: {
    type: Boolean,
    default: true,
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('NotificationPreference', notificationPreferenceSchema);
