const nodemailer = require('nodemailer');
const User = require('../models/User');
const ExpenseBoard = require('../models/ExpenseBoard');
const ExpenseMember = require('../models/ExpenseMember');
const ExpenseTransaction = require('../models/ExpenseTransaction');
const ExpenseInvite = require('../models/ExpenseInvite');
const SocketService = require('../services/SocketService');
const emailTemplateService = require('../services/emailTemplateService');

// Helper to send emails
const sendBoardInviteEmail = async (toEmail, inviterName, boardName, boardType) => {
  const smtpUser = process.env.SMTP_USER || 'dothethng@gmail.com';
  const smtpPass = process.env.SMTP_PASS || 'wteb xfrb axwh upkj';

  if (!smtpUser || !smtpPass) {
    console.warn('SMTP credentials not fully configured. Skipping invite email to:', toEmail);
    return;
  }

  const { subject, html, text } = emailTemplateService.renderEmail('EXPENSE_INVITE', {
    inviterName,
    boardName,
    boardType,
    toEmail
  });

  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: smtpUser,
      pass: smtpPass
    }
  });

  const mailOptions = {
    from: `"doTheThing Expense Calc" <${smtpUser}>`,
    to: toEmail,
    subject,
    text,
    html
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`Board invitation email sent to ${toEmail}`);
  } catch (err) {
    console.error(`Failed to send email to ${toEmail}:`, err.message);
  }
};

// @desc    Get all boards for user
// @route   GET /api/expense-calc/boards
// @access  Private
exports.getBoards = async (req, res) => {
  try {
    const userEmail = req.user.email.toLowerCase();

    // Find all memberships of this user
    const memberships = await ExpenseMember.find({ email: userEmail });
    const boardIds = memberships.map(m => m.boardId);

    // Retrieve the boards
    const boards = await ExpenseBoard.find({ _id: { $in: boardIds } }).sort({ lastActivityDate: -1 });

    // For each board, fetch all members to display avatars and details
    const populatedBoards = await Promise.all(boards.map(async (board) => {
      const allMembers = await ExpenseMember.find({ boardId: board._id });
      const userMembership = memberships.find(m => m.boardId.toString() === board._id.toString());
      
      return {
        _id: board._id,
        name: board.name,
        type: board.type,
        ownerId: board.ownerId,
        createdAt: board.createdAt,
        lastActivityDate: board.lastActivityDate,
        members: allMembers,
        joined: userMembership ? userMembership.joined : false,
        role: userMembership ? userMembership.role : 'member'
      };
    }));

    res.status(200).json({ success: true, boards: populatedBoards });
  } catch (error) {
    console.error('getBoards error:', error);
    res.status(500).json({ message: 'Server error retrieving boards' });
  }
};

// @desc    Create a board and invite members
// @route   POST /api/expense-calc/boards
// @access  Private
exports.createBoard = async (req, res) => {
  try {
    const { name, type, members } = req.body;

    if (!name || !type) {
      return res.status(400).json({ message: 'Please provide board name and type' });
    }

    // Case-insensitive board name duplicate check
    const existingBoard = await ExpenseBoard.findOne({
      name: { $regex: new RegExp('^' + name.trim() + '$', 'i') }
    });

    if (existingBoard) {
      return res.status(400).json({ message: 'Board name already exists. Please choose a unique name.' });
    }

    // Create the board
    const board = await ExpenseBoard.create({
      name: name.trim(),
      type,
      ownerId: req.user._id,
      lastActivityDate: new Date()
    });

    // Create owner member record
    await ExpenseMember.create({
      boardId: board._id,
      email: req.user.email.toLowerCase(),
      role: 'owner',
      joined: true,
      joinedAt: new Date(),
      name: req.user.name
    });

    // Handle invited members
    if (members && Array.isArray(members)) {
      const uniqueEmails = [...new Set(members.map(e => e.trim().toLowerCase()))]
        .filter(email => email !== req.user.email.toLowerCase() && email !== '');

      for (const email of uniqueEmails) {
        // Find if user exists to pre-populate name
        const userObj = await User.findOne({ email });
        const nameVal = userObj ? userObj.name : '';

        await ExpenseMember.create({
          boardId: board._id,
          email,
          role: 'member',
          joined: false,
          name: nameVal
        });

        await ExpenseInvite.create({
          boardId: board._id,
          email,
          invitedBy: req.user._id,
          status: 'pending'
        });

        // Send email invite asynchronously
        sendBoardInviteEmail(email, req.user.name, board.name, board.type);
      }
    }

    // Fetch full members list for response
    const allMembers = await ExpenseMember.find({ boardId: board._id });

    res.status(201).json({
      success: true,
      board: {
        _id: board._id,
        name: board.name,
        type: board.type,
        ownerId: board.ownerId,
        createdAt: board.createdAt,
        lastActivityDate: board.lastActivityDate,
        members: allMembers,
        joined: true,
        role: 'owner'
      }
    });
  } catch (error) {
    console.error('createBoard error:', error);
    res.status(500).json({ message: 'Server error creating board' });
  }
};

// @desc    Join an invited board
// @route   POST /api/expense-calc/boards/:boardId/join
// @access  Private
exports.joinBoard = async (req, res) => {
  try {
    const { boardId } = req.params;
    const userEmail = req.user.email.toLowerCase();

    const member = await ExpenseMember.findOne({ boardId, email: userEmail });
    if (!member) {
      return res.status(404).json({ message: 'Invite not found for this board' });
    }

    member.joined = true;
    member.joinedAt = new Date();
    member.name = req.user.name;
    await member.save();

    // Update invite status
    await ExpenseInvite.findOneAndUpdate(
      { boardId, email: userEmail },
      { status: 'accepted' }
    );

    // Update activity
    await ExpenseBoard.findByIdAndUpdate(boardId, { lastActivityDate: new Date() });

    // Broadcast to board room
    SocketService.broadcastToBoard(boardId, 'expensecalc:update', {
      boardId,
      action: 'join',
      email: userEmail,
      name: req.user.name
    });

    res.status(200).json({ success: true, message: 'Joined board successfully' });
  } catch (error) {
    console.error('joinBoard error:', error);
    res.status(500).json({ message: 'Server error joining board' });
  }
};

// @desc    Invite a member to board separately
// @route   POST /api/expense-calc/boards/:boardId/invite
// @access  Private
exports.inviteMember = async (req, res) => {
  try {
    const { boardId } = req.params;
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ message: 'Please provide email to invite' });
    }

    const invitedEmail = email.trim().toLowerCase();

    // Verify requesting user is a joined member
    const requester = await ExpenseMember.findOne({ boardId, email: req.user.email.toLowerCase(), joined: true });
    if (!requester) {
      return res.status(403).json({ message: 'Only active board members can invite others' });
    }

    // Check if user already a member
    const existingMember = await ExpenseMember.findOne({ boardId, email: invitedEmail });
    if (existingMember) {
      return res.status(400).json({ message: 'User is already a member or has a pending invite' });
    }

    const board = await ExpenseBoard.findById(boardId);
    if (!board) {
      return res.status(404).json({ message: 'Board not found' });
    }

    // Check if user exists
    const userObj = await User.findOne({ email: invitedEmail });
    const nameVal = userObj ? userObj.name : '';

    // Create member and invite
    await ExpenseMember.create({
      boardId,
      email: invitedEmail,
      role: 'member',
      joined: false,
      name: nameVal
    });

    await ExpenseInvite.create({
      boardId,
      email: invitedEmail,
      invitedBy: req.user._id,
      status: 'pending'
    });

    // Send email
    sendBoardInviteEmail(invitedEmail, req.user.name, board.name, board.type);

    // Update board activity
    board.lastActivityDate = new Date();
    await board.save();

    // Broadcast
    SocketService.broadcastToBoard(boardId, 'expensecalc:update', {
      boardId,
      action: 'invite',
      email: invitedEmail
    });

    res.status(200).json({ success: true, message: 'Member invited successfully' });
  } catch (error) {
    console.error('inviteMember error:', error);
    res.status(500).json({ message: 'Server error inviting member' });
  }
};

// @desc    Get transactions of a board
// @route   GET /api/expense-calc/boards/:boardId/transactions
// @access  Private
exports.getTransactions = async (req, res) => {
  try {
    const { boardId } = req.params;

    // Verify access
    const member = await ExpenseMember.findOne({ boardId, email: req.user.email.toLowerCase(), joined: true });
    if (!member) {
      return res.status(403).json({ message: 'Access denied. You are not a joined member of this board.' });
    }

    // Return all transactions sorted by date desc
    const transactions = await ExpenseTransaction.find({ boardId }).sort({ date: -1, createdAt: -1 });

    res.status(200).json({ success: true, transactions });
  } catch (error) {
    console.error('getTransactions error:', error);
    res.status(500).json({ message: 'Server error retrieving transactions' });
  }
};

// @desc    Create a transaction
// @route   POST /api/expense-calc/boards/:boardId/transactions
// @access  Private
exports.createTransaction = async (req, res) => {
  try {
    const { boardId } = req.params;
    const {
      type,
      amount,
      description,
      category,
      date,
      status,
      paidBy,
      paidByName,
      isPersonal,
      splitWith,
      paymentMode
    } = req.body;

    if (!type || !amount || !description || !date) {
      return res.status(400).json({ message: 'Please provide type, amount, description and date' });
    }

    // Verify access
    const requester = await ExpenseMember.findOne({ boardId, email: req.user.email.toLowerCase(), joined: true });
    if (!requester) {
      return res.status(403).json({ message: 'Access denied. You are not a joined member of this board.' });
    }

    // If type is expense and it's a Trip board, paidBy is required. Default to requester if not provided.
    let transactionPaidBy = paidBy || req.user.email.toLowerCase();
    let transactionPaidByName = paidByName || req.user.name;

    const transaction = await ExpenseTransaction.create({
      boardId,
      type,
      amount,
      description,
      addedBy: req.user.email.toLowerCase(),
      addedByName: req.user.name,
      category: category || '',
      date: new Date(date),
      status: status || 'Done',
      paidBy: type === 'expense' ? transactionPaidBy : undefined,
      paidByName: type === 'expense' ? transactionPaidByName : undefined,
      isPersonal: type === 'expense' ? !!isPersonal : false,
      splitWith: type === 'expense' ? splitWith || [] : [],
      paymentMode: paymentMode || 'cash'
    });

    // Update board activity
    await ExpenseBoard.findByIdAndUpdate(boardId, { lastActivityDate: new Date() });

    // Broadcast
    SocketService.broadcastToBoard(boardId, 'expensecalc:update', {
      boardId,
      action: 'create_transaction',
      transaction,
      senderName: req.user.name
    });

    res.status(201).json({ success: true, transaction });
  } catch (error) {
    console.error('createTransaction error:', error);
    res.status(500).json({ message: 'Server error creating transaction' });
  }
};

// @desc    Update a transaction
// @route   PUT /api/expense-calc/boards/:boardId/transactions/:transactionId
// @access  Private
exports.updateTransaction = async (req, res) => {
  try {
    const { boardId, transactionId } = req.params;

    // Verify access
    const requester = await ExpenseMember.findOne({ boardId, email: req.user.email.toLowerCase(), joined: true });
    if (!requester) {
      return res.status(403).json({ message: 'Access denied' });
    }

    let transaction = await ExpenseTransaction.findById(transactionId);
    if (!transaction || transaction.boardId.toString() !== boardId) {
      return res.status(404).json({ message: 'Transaction not found' });
    }

    const {
      amount,
      description,
      category,
      date,
      status,
      paidBy,
      paidByName,
      isPersonal,
      splitWith,
      paymentMode
    } = req.body;

    if (amount !== undefined) transaction.amount = amount;
    if (description !== undefined) transaction.description = description;
    if (category !== undefined) transaction.category = category;
    if (date !== undefined) transaction.date = new Date(date);
    if (status !== undefined) transaction.status = status;
    if (paidBy !== undefined && transaction.type === 'expense') transaction.paidBy = paidBy;
    if (paidByName !== undefined && transaction.type === 'expense') transaction.paidByName = paidByName;
    if (isPersonal !== undefined && transaction.type === 'expense') transaction.isPersonal = isPersonal;
    if (splitWith !== undefined && transaction.type === 'expense') transaction.splitWith = splitWith;
    if (paymentMode !== undefined) transaction.paymentMode = paymentMode;

    await transaction.save();

    // Update board activity
    await ExpenseBoard.findByIdAndUpdate(boardId, { lastActivityDate: new Date() });

    // Broadcast
    SocketService.broadcastToBoard(boardId, 'expensecalc:update', {
      boardId,
      action: 'update_transaction',
      transaction,
      senderName: req.user.name
    });

    res.status(200).json({ success: true, transaction });
  } catch (error) {
    console.error('updateTransaction error:', error);
    res.status(500).json({ message: 'Server error updating transaction' });
  }
};

// @desc    Delete a transaction
// @route   DELETE /api/expense-calc/boards/:boardId/transactions/:transactionId
// @access  Private
exports.deleteTransaction = async (req, res) => {
  try {
    const { boardId, transactionId } = req.params;

    // Verify access
    const requester = await ExpenseMember.findOne({ boardId, email: req.user.email.toLowerCase(), joined: true });
    if (!requester) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const transaction = await ExpenseTransaction.findById(transactionId);
    if (!transaction || transaction.boardId.toString() !== boardId) {
      return res.status(404).json({ message: 'Transaction not found' });
    }

    await transaction.deleteOne();

    // Update board activity
    await ExpenseBoard.findByIdAndUpdate(boardId, { lastActivityDate: new Date() });

    // Broadcast
    SocketService.broadcastToBoard(boardId, 'expensecalc:update', {
      boardId,
      action: 'delete_transaction',
      transactionId,
      senderName: req.user.name
    });

    res.status(200).json({ success: true, message: 'Transaction deleted successfully' });
  } catch (error) {
    console.error('deleteTransaction error:', error);
    res.status(500).json({ message: 'Server error deleting transaction' });
  }
};

// @desc    Delete a board
// @route   DELETE /api/expense-calc/boards/:boardId
// @access  Private
exports.deleteBoard = async (req, res) => {
  try {
    const { boardId } = req.params;
    const board = await ExpenseBoard.findById(boardId);
    
    if (!board) {
      return res.status(404).json({ message: 'Board not found' });
    }
    
    // Check if requester is the owner of the board
    if (board.ownerId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Access denied. Only the board owner can delete the board.' });
    }
    
    // Delete the board
    await board.deleteOne();
    
    // Clean up related records: members, transactions, invites
    await ExpenseMember.deleteMany({ boardId });
    await ExpenseTransaction.deleteMany({ boardId });
    await ExpenseInvite.deleteMany({ boardId });
    
    // Broadcast update to anyone in the board room
    SocketService.broadcastToBoard(boardId, 'expensecalc:update', {
      boardId,
      action: 'delete_board'
    });
    
    res.status(200).json({ success: true, message: 'Board deleted successfully' });
  } catch (error) {
    console.error('deleteBoard error:', error);
    res.status(500).json({ message: 'Server error deleting board' });
  }
};
