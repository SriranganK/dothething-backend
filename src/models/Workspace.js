const mongoose = require('mongoose');

const workspaceSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Please add a workspace name'],
    trim: true,
  },
  type: {
    type: String,
    required: [true, 'Please select a workspace type'],
    enum: ['Personal', 'Team', 'Company'],
  },
  teamSize: {
    type: String,
    required: [true, 'Please select team size'],
    enum: ['Just me', '2–10', '11–50', '50+'],
  },
  industry: {
    type: String,
    required: [true, 'Please specify an industry'],
    trim: true,
  },
  owner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  // Legacy field — kept for backward compatibility during migration.
  // New membership is managed via the WorkspaceMember collection.
  members: {
    type: [String],
    default: [],
  },
  ssoEnabled: {
    type: Boolean,
    default: false,
  },
  mfaEnforced: {
    type: Boolean,
    default: false,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

workspaceSchema.index({ name: 'text' });

module.exports = mongoose.model('Workspace', workspaceSchema);

