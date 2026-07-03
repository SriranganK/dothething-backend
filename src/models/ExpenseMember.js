const mongoose = require('mongoose');

const expenseMemberSchema = new mongoose.Schema({
  boardId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ExpenseBoard',
    required: true,
  },
  email: {
    type: String,
    required: [true, 'Please add a member email'],
    trim: true,
    lowercase: true,
  },
  role: {
    type: String,
    required: true,
    enum: ['owner', 'member'],
    default: 'member',
  },
  joined: {
    type: Boolean,
    default: false,
  },
  joinedAt: {
    type: Date,
  },
  name: {
    type: String,
    trim: true,
  },
}, { 
  collection: 'expensecalc_members',
  timestamps: true
});

// A user can only be added to a board once
expenseMemberSchema.index({ boardId: 1, email: 1 }, { unique: true });

module.exports = mongoose.model('ExpenseMember', expenseMemberSchema);
