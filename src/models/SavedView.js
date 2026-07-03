const mongoose = require('mongoose');

const savedViewSchema = new mongoose.Schema({
  workspace_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Workspace',
    required: true,
    index: true,
  },
  name: {
    type: String,
    required: [true, 'Please add a view name'],
    trim: true,
  },
  filters: {
    labels: {
      type: [String],
      default: [],
    },
    status: {
      type: [String],
      default: [],
    },
    assignee: {
      type: [String],
      default: [],
    },
    priority: {
      type: [String],
      default: [],
    },
    type: {
      type: [String],
      default: [],
    },
    milestone: {
      type: String,
      default: null,
    },
    dueDate: {
      type: String,
      default: null,
    }
  },
  created_by: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  }
}, {
  timestamps: true,
});

module.exports = mongoose.model('SavedView', savedViewSchema);
