const mongoose = require('mongoose');
const Role = require('../constants/role');

const workspaceMemberSchema = new mongoose.Schema({
  workspaceId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Workspace',
    required: true,
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  role: {
    type: String,
    enum: Object.values(Role),
    required: true,
    default: Role.MEMBER,
  },
}, { timestamps: true });

// Ensure a user can only have one membership per workspace
workspaceMemberSchema.index({ workspaceId: 1, userId: 1 }, { unique: true });

module.exports = mongoose.model('WorkspaceMember', workspaceMemberSchema);
