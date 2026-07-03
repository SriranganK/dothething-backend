const mongoose = require('mongoose');
const Role = require('../constants/role');

const boardMemberSchema = new mongoose.Schema({
  boardId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Board',
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
    default: Role.MEMBER,
  },
}, { timestamps: true });

// Compound index to ensure a user can only be added once per board
boardMemberSchema.index({ boardId: 1, userId: 1 }, { unique: true });

module.exports = mongoose.model('BoardMember', boardMemberSchema);
