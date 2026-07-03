const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Please add a name'],
    trim: true,
  },
  email: {
    type: String,
    required: [true, 'Please add an email'],
    unique: true,
    trim: true,
    lowercase: true,
    match: [
      /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/,
      'Please add a valid email',
    ],
  },
  password: {
    type: String,
    required: [true, 'Please add a password'],
    minlength: [6, 'Password must be at least 6 characters'],
    select: false,
  },
  designation: {
    type: String,
    trim: true,
    default: '',
  },
  company: {
    type: String,
    trim: true,
    default: '',
  },
  phone: {
    type: String,
    trim: true,
    default: '',
  },
  department: {
    type: String,
    trim: true,
    default: '',
  },
  location: {
    type: String,
    trim: true,
    default: '',
  },
  timezone: {
    type: String,
    trim: true,
    default: '',
  },
  status: {
    type: String,
    trim: true,
    default: 'Active',
  },
  twoFactorEnabled: {
    type: Boolean,
    default: false,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

// Encrypt password using bcrypt
userSchema.pre('save', async function () {
  if (!this.isModified('password')) {
    return;
  }
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
});

// Compare password
userSchema.methods.matchPassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

userSchema.index({ name: 'text', email: 'text' });

module.exports = mongoose.model('User', userSchema);
