const mongoose = require('mongoose');

const scratchBlockSchema = new mongoose.Schema(
  {
    pageId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ScratchPage',
      required: true,
      index: true,
    },
    workspace: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Workspace',
      required: true,
      index: true,
    },
    type: {
      type: String,
      required: true,
      enum: [
        'paragraph',
        'heading1',
        'heading2',
        'heading3',
        'bulletList',
        'numberedList',
        'todo',
        'toggle',
        'quote',
        'divider',
        'code',
        'image',
        'file',
        'link',
        'table',
        'kanban',
        'taskReference',
        'boardReference',
      ],
      default: 'paragraph',
    },
    content: {
      type: String,
      default: '',
    },
    properties: {
      checked: { type: Boolean, default: false },
      dueDate: { type: Date, default: null },
      priority: { type: String, enum: ['Low', 'Medium', 'High', 'Urgent'], default: 'Medium' },
      assignee: { type: String, default: '' },
      tags: [{ type: String }],
      language: { type: String, default: 'text' },
      linkedEntityType: { type: String, enum: ['task', 'board', null], default: null },
      linkedEntityId: { type: String, default: null },
    },
    order: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  }
);

scratchBlockSchema.index({ pageId: 1, order: 1 });

module.exports = mongoose.model('ScratchBlock', scratchBlockSchema);
