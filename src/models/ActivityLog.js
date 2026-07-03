const mongoose = require('mongoose');

const activityLogSchema = new mongoose.Schema({
  actorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  workspaceId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Workspace',
    required: true,
    index: true
  },
  boardId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Board',
    index: true
  },
  taskId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Item',
    index: true
  },
  actionType: {
    type: String,
    required: true,
    enum: [
      'TASK_CREATED',
      'TASK_UPDATED',
      'TASK_DELETED',
      'TASK_ASSIGNED',
      'TASK_UNASSIGNED',
      'STATUS_CHANGED',
      'PRIORITY_CHANGED',
      'DUE_DATE_CHANGED',
      'START_DATE_CHANGED',
      'TITLE_CHANGED',
      'DESCRIPTION_CHANGED',
      'COMMENT_ADDED',
      'COMMENT_UPDATED',
      'COMMENT_DELETED',
      'ATTACHMENT_ADDED',
      'ATTACHMENT_REMOVED',
      'LABEL_ADDED',
      'LABEL_REMOVED',
      'MEMBER_ADDED',
      'MEMBER_REMOVED',
      'PROJECT_CREATED',
      'PROJECT_UPDATED'
    ]
  },
  oldValue: {
    type: mongoose.Schema.Types.Mixed,
    default: null
  },
  newValue: {
    type: mongoose.Schema.Types.Mixed,
    default: null
  },
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  createdAt: {
    type: Date,
    default: Date.now,
    index: true
  }
});

// Compound indexes for optimization of feeds and history timelines
activityLogSchema.index({ workspaceId: 1, createdAt: -1 });
activityLogSchema.index({ taskId: 1, createdAt: -1 });
activityLogSchema.index({ actorId: 1, createdAt: -1 });

module.exports = mongoose.model('ActivityLog', activityLogSchema);
