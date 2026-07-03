const mongoose = require('mongoose');

const expenseTransactionSchema = new mongoose.Schema({
  boardId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ExpenseBoard',
    required: true,
  },
  type: {
    type: String,
    required: [true, 'Please specify transaction type'],
    enum: ['income', 'expense'],
  },
  amount: {
    type: Number,
    required: [true, 'Please specify transaction amount'],
  },
  description: {
    type: String,
    required: [true, 'Please specify transaction description'],
    trim: true,
  },
  addedBy: {
    type: String,
    required: true, // User email
  },
  addedByName: {
    type: String,
    required: true, // User name
  },
  category: {
    type: String,
    default: '', // Optional (e.g. Software, Infrastructure, Meals, Travel, Marketing)
  },
  date: {
    type: Date,
    required: [true, 'Please specify transaction date'],
  },
  status: {
    type: String,
    enum: ['Pending', 'Done'],
    default: 'Done', // For Monthly board direct add ('Done') vs draft/pending ('Pending')
  },
  paidBy: {
    type: String, // For Trip: user email who paid the bill
  },
  paidByName: {
    type: String, // For Trip: user name who paid
  },
  isPersonal: {
    type: Boolean,
    default: false, // For Trip: personal expense (excluded from settlement, counts towards personal total)
  },
  splitWith: [{
    type: String, // For Trip: array of emails who split this expense. If empty, defaults to everyone in the trip.
  }],
  paymentMode: {
    type: String,
    enum: ['cash', 'account', 'both'],
    default: 'cash',
  },
}, { 
  collection: 'expensecalc_transactions',
  timestamps: true
});

module.exports = mongoose.model('ExpenseTransaction', expenseTransactionSchema);
