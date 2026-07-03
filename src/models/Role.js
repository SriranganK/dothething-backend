const mongoose = require('mongoose');
const Role = require('../constants/role');

const roleSchema = new mongoose.Schema({
  name: {
    type: String,
    enum: Object.values(Role),
    required: true,
    unique: true,
  },
  description: {
    type: String,
    default: '',
  },
});

module.exports = mongoose.model('Role', roleSchema);
