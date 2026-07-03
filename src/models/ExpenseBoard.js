const mongoose = require('mongoose');

const expenseBoardSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Please add a board name'],
    trim: true,
  },
  type: {
    type: String,
    required: [true, 'Please specify board type'],
    enum: ['monthly', 'trip'],
  },
  ownerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  lastActivityDate: {
    type: Date,
    default: Date.now,
  },
}, { 
  collection: 'expensecalc_boards',
  timestamps: true
});

// Case-insensitive unique index on board name
expenseBoardSchema.index({ name: 1 }, { unique: true, collation: { locale: 'en', strength: 2 } });

module.exports = mongoose.model('ExpenseBoard', expenseBoardSchema);
