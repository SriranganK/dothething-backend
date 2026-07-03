const mongoose = require('mongoose');

const otpSchema = new mongoose.Schema({
  email: {
    type: String,
    required: [true, 'Please add an email address'],
    lowercase: true,
    trim: true,
    match: [
      /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/,
      'Please add a valid email',
    ],
  },
  code: {
    type: String,
    required: [true, 'Please add a code'],
  },
  expiresAt: {
    type: Date,
    required: true,
  },
  used: {
    type: Boolean,
    default: false,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

// Automatically delete expired OTPs after 5 minutes using Mongoose expires index (backup to application checks)
otpSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
otpSchema.index({ email: 1 });

module.exports = mongoose.model('OTP', otpSchema);
