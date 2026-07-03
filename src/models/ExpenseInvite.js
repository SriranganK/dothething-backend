const mongoose = require('mongoose');

const expenseInviteSchema = new mongoose.Schema({
  boardId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ExpenseBoard',
    required: true,
  },
  email: {
    type: String,
    required: [true, 'Please add invited email'],
    lowercase: true,
    trim: true,
  },
  invitedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  status: {
    type: String,
    enum: ['pending', 'accepted', 'rejected'],
    default: 'pending',
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
}, { 
  collection: 'expensecalc_invites',
  timestamps: true
});

// Avoid duplicate invites for the same board/email
expenseInviteSchema.index({ boardId: 1, email: 1 }, { unique: true });

module.exports = mongoose.model('ExpenseInvite', expenseInviteSchema);
