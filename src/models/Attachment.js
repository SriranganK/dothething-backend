const mongoose = require('mongoose');

const attachmentSchema = new mongoose.Schema({
  issueId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Item',
    required: true,
    index: true,
  },
  type: {
    type: String,
    enum: ['file', 'link'],
    default: 'file',
    required: true,
  },
  fileName: {
    type: String,
    required: true,
  },
  originalName: {
    type: String,
    required: true,
  },
  mimeType: {
    type: String,
  },
  size: {
    type: Number,
  },
  storageKey: {
    type: String,
  },
  publicUrl: {
    type: String,
  },
  uploadedBy: {
    type: String, // email or name of the uploader
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('Attachment', attachmentSchema);
