const mongoose = require('mongoose');

const commentSchema = new mongoose.Schema({
  role: { type: String, enum: ['user', 'assistant'], required: true },
  text: { type: String, required: true },
  createdAt: { type: Date, default: Date.now }
});

const questionSchema = new mongoose.Schema({
  questionText: { type: String, required: true },
  answerText: { type: String, default: '' },
  isAnswered: { type: Boolean, default: false }
});

const aiBoardSessionSchema = new mongoose.Schema({
  workspace: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Workspace',
    required: true
  },
  board: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Board',
    default: null
  },
  documentName: {
    type: String,
    required: true
  },
  documentText: {
    type: String,
    required: true
  },
  status: {
    type: String,
    enum: ['summary', 'question', 'preview', 'completed', 'cancelled'],
    default: 'summary'
  },
  summary: {
    projectName: { type: String, default: '' },
    description: { type: String, default: '' },
    features: [{ type: String }],
    teamMembers: [{
      name: { type: String },
      role: { type: String }
    }],
    potentialTasks: [{
      title: { type: String },
      description: { type: String },
      feature: { type: String }
    }],
    newTasks: [{ type: String }],
    updates: [{ type: String }],
    duplicates: [{ type: String }]
  },
  comments: [commentSchema],
  questions: [questionSchema],
  currentQuestionIndex: {
    type: Number,
    default: 0
  },
  prdMarkdown: {
    type: String,
    default: ''
  },
  preview: {
    boardName: { type: String },
    description: { type: String },
    columns: [{
      id: { type: String },
      name: { type: String },
      order: { type: Number },
      isDone: { type: Boolean }
    }],
    tasks: [{
      title: { type: String, required: true },
      description: { type: String, default: '' },
      columnId: { type: String, default: 'todo' },
      type: { type: String, default: 'Task' },
      priority: { type: String, default: 'Medium' },
      assignee: { type: String, default: '' },
      source: { type: String, default: '' },
      isNew: { type: Boolean, default: true },
      existingTaskId: { type: String, default: '' }
    }]
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('AIBoardSession', aiBoardSessionSchema);
