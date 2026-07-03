const mongoose = require('mongoose');
const crypto = require('crypto');
const Role = require('../constants/role');

const invitationSchema = new mongoose.Schema({
  workspaceId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Workspace',
    required: true,
  },
  email: {
    type: String,
    required: true,
    lowercase: true,
    trim: true,
  },
  role: {
    type: String,
    enum: Object.values(Role),
    required: true,
    default: Role.MEMBER,
  },
  // For private board invitations
  boardId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Board',
    default: null,
  },
  status: {
    type: String,
    enum: ['PENDING', 'ACCEPTED', 'DECLINED', 'EXPIRED'],
    default: 'PENDING',
  },
  token: {
    type: String,
    unique: true,
    default: () => crypto.randomBytes(32).toString('hex'),
  },
  invitedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  expiresAt: {
    type: Date,
    default: () => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
  },
}, { timestamps: true });

// Index for quick lookups
invitationSchema.index({ workspaceId: 1, email: 1 });
invitationSchema.index({ token: 1 });

module.exports = mongoose.model('Invitation', invitationSchema);
