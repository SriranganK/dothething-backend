const mongoose = require('mongoose');

const milestoneSchema = new mongoose.Schema({
  workspace_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Workspace',
    required: true,
    index: true,
  },
  name: {
    type: String,
    required: [true, 'Please add a milestone name'],
    trim: true,
  },
  description: {
    type: String,
    default: '',
  },
  color: {
    type: String,
    default: '#3b82f6',
  },
  start_date: {
    type: Date,
    default: null,
  },
  due_date: {
    type: Date,
    default: null,
  },
  status: {
    type: String,
    enum: ['Planned', 'Active', 'Completed', 'Archived'],
    default: 'Planned',
  },
  created_by: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  }
}, {
  timestamps: true,
});

module.exports = mongoose.model('Milestone', milestoneSchema);
