const mongoose = require('mongoose');

const commentSchema = new mongoose.Schema({
  authorName: { type: String, required: true },
  authorEmail: { type: String, required: true },
  text: { type: String, required: true },
  createdAt: { type: Date, default: Date.now }
});

const checklistItemSchema = new mongoose.Schema({
  id: { type: String, required: true },
  text: { type: String, required: true },
  completed: { type: Boolean, default: false }
});

const itemSchema = new mongoose.Schema({
  board: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Board',
    required: true,
    index: true,
  },
  columnId: {
    type: String,
    required: true,
  },
  title: {
    type: String,
    required: [true, 'Please add an item title'],
    trim: true,
  },
  description: {
    type: String,
    default: '',
  },
  type: {
    type: String,
    required: true,
    enum: ['Task', 'Bug', 'Lead', 'Idea', 'Issue', 'Event', 'Feature', 'Research', 'Documentation'],
    default: 'Task',
  },
  priority: {
    type: String,
    required: true,
    enum: ['Lowest', 'Low', 'Medium', 'High', 'Highest', 'Critical'],
    default: 'Medium',
  },
  archived: {
    type: Boolean,
    default: false,
  },
  assignee: {
    type: String, // email or name
    default: '',
  },
  storyPoints: {
    type: Number,
    default: null,
  },
  dueDate: {
    type: Date,
    default: null,
  },
  startDate: {
    type: Date,
    default: null,
  },
  labels: {
    type: [String],
    default: [],
  },
  milestone_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Milestone',
    default: null,
    index: true,
  },
  attachments: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Attachment',
  }],
  checklist: {
    type: [checklistItemSchema],
    default: [],
  },
  comments: {
    type: [commentSchema],
    default: [],
  },
  linkedRepo: {
    type: String,
    default: '',
  },
  githubBranchName: {
    type: String,
    default: '',
  },
  gitlabBranchName: {
    type: String,
    default: '',
  },
  order: {
    type: Number,
    default: 0,
  },
  source: {
    type: String,
    default: ''
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

itemSchema.index({ title: 'text', description: 'text', 'checklist.text': 'text' });

module.exports = mongoose.model('Item', itemSchema);
