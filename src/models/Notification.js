const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  workspaceId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Workspace',
    required: false, // Some notifications might be global/welcome
    index: true,
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  type: {
    type: String,
    required: true,
    enum: [
      'WELCOME',
      'MENTION',
      'TASK_ASSIGNED',
      'TASK_UPDATED',
      'TASK_COMMENT',
      'DEADLINE_REMINDER',
      'STATUS_CHANGED',
      'TEAM_ANNOUNCEMENT',
      'PROJECT_UPDATE',
      'WORKSPACE_INVITATION'
    ],
  },
  title: {
    type: String,
    required: true,
  },
  message: {
    type: String,
    required: true,
  },
  entityType: {
    type: String,
    required: false, // e.g. TASK, COMMENT, WORKSPACE, ANNOUNCEMENT
  },
  entityId: {
    type: String,
    required: false, // ID of the referenced entity
  },
  isRead: {
    type: Boolean,
    default: false,
    index: true,
  },
  readAt: {
    type: Date,
    default: null,
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('Notification', notificationSchema);
