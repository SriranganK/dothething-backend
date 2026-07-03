const mongoose = require('mongoose');

const labelSchema = new mongoose.Schema({
  workspace_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Workspace',
    required: true,
    index: true,
  },
  name: {
    type: String,
    required: [true, 'Please add a label name'],
    trim: true,
  },
  color: {
    type: String,
    default: '#3b82f6',
  },
  description: {
    type: String,
    default: '',
  }
}, {
  timestamps: true,
});

// Ensure label names are unique per workspace
labelSchema.index({ workspace_id: 1, name: 1 }, { unique: true });

module.exports = mongoose.model('Label', labelSchema);
