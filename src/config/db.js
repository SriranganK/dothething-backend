const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGO_URI);
    console.log(`MongoDB Connected: ${conn.connection.host}`);

    // Ensure all models are registered
    require('../models/User');
    require('../models/Workspace');
    require('../models/Board');
    require('../models/Item');
    require('../models/OTP');
    require('../models/ExpenseBoard');
    require('../models/ExpenseMember');
    require('../models/ExpenseTransaction');
    require('../models/ExpenseInvite');

    // Sync indexes
    await Promise.all([
      mongoose.model('User').syncIndexes(),
      mongoose.model('Workspace').syncIndexes(),
      mongoose.model('Board').syncIndexes(),
      mongoose.model('Item').syncIndexes(),
      mongoose.model('OTP').syncIndexes(),
      mongoose.model('ExpenseBoard').syncIndexes(),
      mongoose.model('ExpenseMember').syncIndexes(),
      mongoose.model('ExpenseTransaction').syncIndexes(),
      mongoose.model('ExpenseInvite').syncIndexes()
    ]);
    console.log('MongoDB Indexes Synchronized');
  } catch (error) {
    console.error(`Error connecting to MongoDB: ${error.message}`);
    process.exit(1);
  }
};


module.exports = connectDB;
