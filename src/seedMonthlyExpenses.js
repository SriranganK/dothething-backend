const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '../.env') });

const mongoUri = process.env.MONGO_URI || 'mongodb+srv://dothething:dothething@cluster0.3iayb.mongodb.net/';

async function run() {
  try {
    await mongoose.connect(mongoUri);
    console.log('Connected to MongoDB');

    const User = require('./models/User');
    const ExpenseBoard = require('./models/ExpenseBoard');
    const ExpenseTransaction = require('./models/ExpenseTransaction');
    const ExpenseMember = require('./models/ExpenseMember');

    // Find a primary user to assign transactions to
    let primaryUser = await User.findOne({ email: 'srirangankannan31@gmail.com' });
    if (!primaryUser) {
      primaryUser = await User.findOne();
    }
    
    if (!primaryUser) {
      console.error('No users found in the database. Please register a user first.');
      process.exit(1);
    }

    console.log(`Using primary user: ${primaryUser.name} (${primaryUser.email})`);

    // Find all monthly boards
    const monthlyBoards = await ExpenseBoard.find({ type: 'monthly' });
    if (monthlyBoards.length === 0) {
      console.log('No monthly boards found. Creating a test monthly board...');
      
      const newBoard = await ExpenseBoard.create({
        name: 'Family Budget 2026',
        type: 'monthly',
        ownerId: primaryUser._id,
        lastActivityDate: new Date()
      });

      await ExpenseMember.create({
        boardId: newBoard._id,
        email: primaryUser.email.toLowerCase(),
        role: 'owner',
        joined: true,
        joinedAt: new Date(),
        name: primaryUser.name
      });

      monthlyBoards.push(newBoard);
    }

    console.log(`Found ${monthlyBoards.length} monthly boards to seed.`);

    const sampleData = [
      {
        month: 1, // February (0-indexed represents Feb as index 1)
        year: 2026,
        items: [
          { type: 'income', amount: 95000, description: 'Salary Deposit', category: 'Freelance' },
          { type: 'income', amount: 8500, description: 'Stock Dividend', category: 'Investment' },
          { type: 'expense', amount: 22000, description: 'Monthly Rent', category: 'Rent', status: 'Done' },
          { type: 'expense', amount: 4800, description: 'Electricity Bill', category: 'Utilities', status: 'Done' },
          { type: 'expense', amount: 7200, description: 'Groceries supermarket', category: 'Groceries', status: 'Done' },
          { type: 'expense', amount: 1500, description: 'AWS Subscription', category: 'Software', status: 'Done' },
          { type: 'expense', amount: 3200, description: 'Family Dinner Outing', category: 'Meals/Dinout', status: 'Done' },
        ]
      },
      {
        month: 2, // March
        year: 2026,
        items: [
          { type: 'income', amount: 95000, description: 'Salary Deposit', category: 'Freelance' },
          { type: 'income', amount: 12000, description: 'Consulting gig', category: 'Freelance' },
          { type: 'expense', amount: 22000, description: 'Monthly Rent', category: 'Rent', status: 'Done' },
          { type: 'expense', amount: 5100, description: 'Electricity & Gas', category: 'Utilities', status: 'Done' },
          { type: 'expense', amount: 9100, description: 'D-Mart shopping run', category: 'Groceries', status: 'Done' },
          { type: 'expense', amount: 1500, description: 'Copilot Subscription', category: 'Software', status: 'Done' },
          { type: 'expense', amount: 4200, description: 'Weekend Buffet', category: 'Meals/Dinout', status: 'Done' },
        ]
      },
      {
        month: 4, // May
        year: 2026,
        items: [
          { type: 'income', amount: 95000, description: 'Salary Deposit', category: 'Freelance' },
          { type: 'expense', amount: 22000, description: 'Monthly Rent', category: 'Rent', status: 'Done' },
          { type: 'expense', amount: 6200, description: 'Internet & Power bill', category: 'Utilities', status: 'Done' },
          { type: 'expense', amount: 8300, description: 'Weekly groceries', category: 'Groceries', status: 'Done' },
          { type: 'expense', amount: 1500, description: 'Vercel Pro', category: 'Software', status: 'Done' },
          { type: 'expense', amount: 11000, description: 'Flight to Mumbai', category: 'Travel', status: 'Done' },
          { type: 'expense', amount: 5500, description: 'Shopping mall clothes', category: 'Entertainment', status: 'Done' },
        ]
      },
      {
        month: 5, // June
        year: 2026,
        items: [
          { type: 'income', amount: 95000, description: 'Salary Deposit', category: 'Freelance' },
          { type: 'income', amount: 15000, description: 'Project bonus', category: 'Freelance' },
          { type: 'expense', amount: 22000, description: 'Monthly Rent', category: 'Rent', status: 'Done' },
          { type: 'expense', amount: 4500, description: 'Water & Power bills', category: 'Utilities', status: 'Done' },
          { type: 'expense', amount: 10200, description: 'Whole Food Groceries', category: 'Groceries', status: 'Done' },
          { type: 'expense', amount: 1500, description: 'Claude Pro subscription', category: 'Software', status: 'Done' },
          { type: 'expense', amount: 6800, description: 'Birthday Party Dinner', category: 'Meals/Dinout', status: 'Done' },
          { type: 'expense', amount: 3500, description: 'Movie Tickets & snacks', category: 'Entertainment', status: 'Done' },
        ]
      },
      {
        month: 6, // July (Current Month)
        year: 2026,
        items: [
          { type: 'income', amount: 95000, description: 'Salary Deposit', category: 'Freelance' },
          { type: 'expense', amount: 22000, description: 'Monthly Rent', category: 'Rent', status: 'Done' },
          { type: 'expense', amount: 5300, description: 'Broadband & electricity', category: 'Utilities', status: 'Done' },
          { type: 'expense', amount: 7900, description: 'Groceries list', category: 'Groceries', status: 'Done' },
          { type: 'expense', amount: 1500, description: 'Vite Premium', category: 'Software', status: 'Done' },
          { type: 'expense', amount: 8000, description: 'Weekend Resort Booking', category: 'Travel', status: 'Pending' },
        ]
      }
    ];

    for (const board of monthlyBoards) {
      console.log(`Seeding board: ${board.name} (${board._id})`);
      
      // Delete existing transactions for this board to avoid duplicate seeding
      await ExpenseTransaction.deleteMany({ boardId: board._id });
      console.log(`Cleaned existing transactions for board ${board.name}`);

      for (const group of sampleData) {
        const baseDate = new Date(group.year, group.month, 10); // 10th of that month

        for (const item of group.items) {
          await ExpenseTransaction.create({
            boardId: board._id,
            type: item.type,
            amount: item.amount,
            description: item.description,
            addedBy: primaryUser.email.toLowerCase(),
            addedByName: primaryUser.name,
            category: item.category,
            date: baseDate,
            status: item.status || 'Done',
            paidBy: item.type === 'expense' ? primaryUser.email.toLowerCase() : undefined,
            paidByName: item.type === 'expense' ? primaryUser.name : undefined,
            isPersonal: false,
            splitWith: []
          });
        }
      }
      
      console.log(`Finished seeding board ${board.name}`);
    }

    console.log('Database seeded successfully!');
  } catch (err) {
    console.error('Seeding failed:', err);
  } finally {
    await mongoose.connection.close();
    console.log('MongoDB connection closed.');
  }
}

run();
