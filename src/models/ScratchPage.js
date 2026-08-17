const mongoose = require('mongoose');

const scratchPageSchema = new mongoose.Schema(
  {
    workspace: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Workspace',
      required: true,
      index: true,
    },
    title: {
      type: String,
      default: 'Untitled',
      trim: true,
    },
    icon: {
      type: String,
      default: '📄',
    },
    cover: {
      type: String,
      default: '',
    },
    parentPageId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ScratchPage',
      default: null,
      index: true,
    },
    visibility: {
      type: String,
      enum: ['private', 'workspace', 'shared', 'public'],
      default: 'private',
    },
    isFavorite: {
      type: Boolean,
      default: false,
    },
    order: {
      type: Number,
      default: 0,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

scratchPageSchema.index({ workspace: 1, parentPageId: 1, order: 1 });

module.exports = mongoose.model('ScratchPage', scratchPageSchema);
