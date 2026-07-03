const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '../.env') });

const mongoUri = process.env.MONGO_URI || 'mongodb+srv://dothething:dothething@cluster0.3iayb.mongodb.net/';

async function run() {
  try {
    await mongoose.connect(mongoUri);
    console.log('Connected to MongoDB');

    // Load actual models
    require('./models/User');
    require('./models/Workspace');

    const User = mongoose.model('User');
    const Workspace = mongoose.model('Workspace');

    const users = await User.find({});
    console.log('--- USERS ---');
    users.forEach(u => console.log(`ID: ${u._id}, Name: ${u.name}, Email: ${u.email}`));

    const workspaces = await Workspace.find({});
    console.log('--- WORKSPACES ---');
    workspaces.forEach(w => console.log(`ID: ${w._id}, Name: ${w.name}, Owner: ${w.owner}`));

  } catch (err) {
    console.error(err);
  } finally {
    await mongoose.connection.close();
  }
}

run();
