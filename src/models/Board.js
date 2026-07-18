const mongoose = require('mongoose');
const Visibility = require('../constants/visibility');

const boardSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Please add a board name'],
    trim: true,
  },
  workspace: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Workspace',
    required: true,
  },
  columns: [
    {
      id: { type: String, required: true },
      name: { type: String, required: true },
      order: { type: Number, default: 0 },
      isDone: { type: Boolean, default: false },
      statusMapping: { type: String }
    }
  ],
  visibility: {
    type: String,
    enum: Object.values(Visibility),
    default: Visibility.WORKSPACE,
  },
  owner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  sourceDocuments: [
    {
      fileName: { type: String, required: true },
      uploadedAt: { type: Date, default: Date.now }
    }
  ],
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

boardSchema.index({ name: 'text' });

module.exports = mongoose.model('Board', boardSchema);
