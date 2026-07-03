const mongoose = require('mongoose');

const taskLabelSchema = new mongoose.Schema({
  task_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Item',
    required: true,
    index: true,
  },
  label_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Label',
    required: true,
    index: true,
  }
}, {
  timestamps: true,
});

// Ensure unique task-label mappings
taskLabelSchema.index({ task_id: 1, label_id: 1 }, { unique: true });

module.exports = mongoose.model('TaskLabel', taskLabelSchema);
