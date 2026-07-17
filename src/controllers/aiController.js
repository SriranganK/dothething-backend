const Board = require('../models/Board');
const Item = require('../models/Item');
const WorkspaceMember = require('../models/WorkspaceMember');
const User = require('../models/User');
const ActivityService = require('../services/ActivityService');
const SocketService = require('../services/SocketService');
const aiService = require('../services/aiService');

/**
 * Helper to enrich item details (labels, milestone, and attachments)
 * mimicking the logic from itemController to match frontend expectations.
 */
const enrichItemWithDetails = async (item) => {
  const itemObj = item.toObject ? item.toObject() : item;
  const TaskLabel = require('../models/TaskLabel');
  
  const taskLabels = await TaskLabel.find({ task_id: item._id }).populate('label_id');
  itemObj.labels = taskLabels
    .map(tl => tl.label_id)
    .filter(l => l !== null)
    .map(l => ({
      _id: l._id,
      name: l.name,
      color: l.color,
      description: l.description
    }));

  itemObj.milestone = null;
  itemObj.attachments = [];
  return itemObj;
};

/**
 * @desc    Generate a complete board from prompt
 * @route   POST /api/ai/workspace/:workspaceId/generate-board
 * @access  Private
 */
const generateBoard = async (req, res) => {
  try {
    const workspaceId = req.params.workspaceId || req.body.workspaceId;
    const { prompt } = req.body;
    if (!workspaceId || !prompt) {
      return res.status(400).json({ message: 'Workspace ID and prompt are required' });
    }

    console.log('[AI Controller] Generating board for prompt:', prompt);
    const result = await aiService.generateBoard(prompt);

    let boardName = result.boardName || 'New AI Board';
    const columns = result.columns || [
      { id: 'todo', name: 'To Do', order: 0, isDone: false },
      { id: 'progress', name: 'In Progress', order: 1, isDone: false },
      { id: 'done', name: 'Done', order: 2, isDone: true }
    ];
    const items = result.items || [];

    // Ensure board name is unique in this workspace
    let finalBoardName = boardName;
    let existing = await Board.findOne({ workspace: workspaceId, name: { $regex: new RegExp(`^${finalBoardName}$`, 'i') } });
    let counter = 1;
    while (existing) {
      finalBoardName = `${boardName} (${counter})`;
      existing = await Board.findOne({ workspace: workspaceId, name: { $regex: new RegExp(`^${finalBoardName}$`, 'i') } });
      counter++;
    }

    // Create the board
    const board = await Board.create({
      name: finalBoardName,
      workspace: workspaceId,
      columns,
      owner: req.user._id,
      createdBy: req.user._id
    });

    // Create tasks
    if (items.length > 0) {
      const itemsToCreate = items.map((item, index) => ({
        board: board._id,
        columnId: item.columnId || columns[0].id,
        title: item.title,
        description: item.description || '',
        type: item.type || 'Task',
        priority: item.priority || 'Medium',
        order: index
      }));
      await Item.insertMany(itemsToCreate);
    }

    // Log Activity
    await ActivityService.log({
      actorId: req.user._id,
      workspaceId,
      boardId: board._id,
      actionType: 'PROJECT_CREATED',
      newValue: finalBoardName,
      metadata: { projectName: finalBoardName }
    });

    // Broadcast Update
    SocketService.broadcastToWorkspace(workspaceId.toString(), 'workspace:updated', {
      action: 'BOARD_CREATED',
      workspaceId: workspaceId.toString(),
      boardId: board._id.toString(),
      senderId: req.user._id.toString()
    });

    res.status(201).json({ success: true, board });
  } catch (error) {
    console.error('[AI Controller] Error in generateBoard:', error);
    res.status(500).json({ message: error.message });
  }
};

/**
 * @desc    Generate relevant workflow columns
 * @route   POST /api/ai/board/:boardId/generate-columns
 * @access  Private
 */
const generateColumns = async (req, res) => {
  try {
    const boardId = req.params.boardId || req.body.boardId;
    const { prompt } = req.body;
    if (!boardId || !prompt) {
      return res.status(400).json({ message: 'Board ID and prompt are required' });
    }

    const board = await Board.findById(boardId);
    if (!board) {
      return res.status(404).json({ message: 'Board not found' });
    }

    console.log('[AI Controller] Generating columns for board:', board.name);
    const result = await aiService.generateColumns(board.name, prompt);

    if (result.columns && Array.isArray(result.columns)) {
      board.columns = result.columns;
      await board.save();

      // Log board update
      await ActivityService.log({
        actorId: req.user._id,
        boardId: board._id,
        actionType: 'BOARD_UPDATED',
        newValue: 'Columns updated via AI',
        metadata: { boardName: board.name }
      });

      // Broadcast board update
      SocketService.broadcastToBoard(boardId.toString(), 'board:updated', {
        action: 'COLUMNS_UPDATED',
        boardId: boardId.toString(),
        senderId: req.user._id.toString()
      });

      return res.status(200).json({ success: true, board });
    }

    res.status(400).json({ message: 'Failed to generate columns' });
  } catch (error) {
    console.error('[AI Controller] Error in generateColumns:', error);
    res.status(500).json({ message: error.message });
  }
};

/**
 * @desc    Suggest priorities, labels, and due dates
 * @route   POST /api/ai/board/:boardId/suggest-meta
 * @access  Private
 */
const suggestTaskMeta = async (req, res) => {
  try {
    const { title, description } = req.body;
    if (!title) {
      return res.status(400).json({ message: 'Task title is required' });
    }

    console.log('[AI Controller] Suggesting metadata for task:', title);
    const suggestions = await aiService.suggestTaskMeta(title, description || '');

    res.status(200).json({ success: true, suggestions });
  } catch (error) {
    console.error('[AI Controller] Error in suggestTaskMeta:', error);
    res.status(500).json({ message: error.message });
  }
};

/**
 * @desc    Break down task into checklist items
 * @route   POST /api/ai/item/:id/break-task
 * @access  Private
 */
const breakTask = async (req, res) => {
  try {
    const itemId = req.params.id || req.body.itemId;
    if (!itemId) {
      return res.status(400).json({ message: 'Item ID is required' });
    }

    const item = await Item.findById(itemId);
    if (!item) {
      return res.status(404).json({ message: 'Task not found' });
    }

    console.log('[AI Controller] Breaking down task:', item.title);
    const result = await aiService.breakTask(item.title, item.description || '');

    if (result.checklist && Array.isArray(result.checklist)) {
      const generated = result.checklist.map(c => ({
        id: Math.random().toString(36).substring(2, 9),
        text: c.text,
        completed: false
      }));

      item.checklist = [...(item.checklist || []), ...generated];
      await item.save();

      // Log activity
      await ActivityService.log({
        actorId: req.user._id,
        boardId: item.board,
        taskId: item._id,
        actionType: 'CHECKLIST_ADDED',
        newValue: `Added ${generated.length} checklist items via AI`,
        metadata: { taskTitle: item.title }
      });

      // Broadcast
      SocketService.broadcastToBoard(item.board.toString(), 'board:updated', {
        action: 'ITEM_UPDATED',
        boardId: item.board.toString(),
        itemId: item._id.toString(),
        senderId: req.user._id.toString()
      });

      const enriched = await enrichItemWithDetails(item);
      return res.status(200).json({ success: true, item: enriched });
    }

    res.status(400).json({ message: 'Failed to break task' });
  } catch (error) {
    console.error('[AI Controller] Error in breakTask:', error);
    res.status(500).json({ message: error.message });
  }
};

/**
 * @desc    Improve or rewrite task description
 * @route   POST /api/ai/item/:id/rewrite-description
 * @access  Private
 */
const rewriteDescription = async (req, res) => {
  try {
    const itemId = req.params.id || req.body.itemId;
    const { tone } = req.body;
    if (!itemId || !tone) {
      return res.status(400).json({ message: 'Item ID and tone instructions are required' });
    }

    const item = await Item.findById(itemId);
    if (!item) {
      return res.status(404).json({ message: 'Task not found' });
    }

    console.log('[AI Controller] Rewriting description for task:', item.title);
    const result = await aiService.rewriteDescription(item.title, item.description || '', tone);

    if (result.description !== undefined) {
      item.description = result.description;
      await item.save();

      // Log activity
      await ActivityService.log({
        actorId: req.user._id,
        boardId: item.board,
        taskId: item._id,
        actionType: 'DESCRIPTION_CHANGED',
        newValue: 'Description updated via AI',
        metadata: { taskTitle: item.title }
      });

      // Broadcast
      SocketService.broadcastToBoard(item.board.toString(), 'board:updated', {
        action: 'ITEM_UPDATED',
        boardId: item.board.toString(),
        itemId: item._id.toString(),
        senderId: req.user._id.toString()
      });

      return res.status(200).json({ success: true, description: item.description });
    }

    res.status(400).json({ message: 'Failed to rewrite description' });
  } catch (error) {
    console.error('[AI Controller] Error in rewriteDescription:', error);
    res.status(500).json({ message: error.message });
  }
};

/**
 * @desc    Chat based on board and its tasks
 * @route   POST /api/ai/board/:boardId/chat
 * @access  Private
 */
const boardChat = async (req, res) => {
  try {
    const boardId = req.params.boardId || req.body.boardId;
    const { message } = req.body;
    if (!boardId || !message) {
      return res.status(400).json({ message: 'Board ID and message are required' });
    }

    const board = await Board.findById(boardId);
    if (!board) {
      return res.status(404).json({ message: 'Board not found' });
    }

    const tasks = await Item.find({ board: boardId });

    console.log('[AI Controller] Board chat query for board:', board.name);
    const result = await aiService.boardChat(board.name, board.columns, tasks, message);

    res.status(200).json({ success: true, reply: result.reply || '' });
  } catch (error) {
    console.error('[AI Controller] Error in boardChat:', error);
    res.status(500).json({ message: error.message });
  }
};

/**
 * @desc    Generate a detailed task from title and long story
 * @route   POST /api/ai/board/:boardId/column/:columnId/generate-task
 * @access  Private
 */
const generateTask = async (req, res) => {
  try {
    const boardId = req.params.boardId || req.body.boardId;
    const columnId = req.params.columnId || req.body.columnId;
    const { title, story } = req.body;
    if (!boardId || !columnId || !title || !story) {
      return res.status(400).json({ message: 'Board ID, Column ID, Title, and Story are required' });
    }

    const board = await Board.findById(boardId);
    if (!board) {
      return res.status(404).json({ message: 'Board not found' });
    }

    // Load workspace members
    const members = await WorkspaceMember.find({ workspaceId: board.workspace }).populate('userId');
    const memberNames = members.map(m => m.userId ? m.userId.name : '').filter(Boolean);
    const emailMap = new Map();
    members.forEach(m => {
      if (m.userId && m.userId.name && m.userId.email) {
        emailMap.set(m.userId.name.toLowerCase().trim(), m.userId.email);
      }
    });

    console.log('[AI Controller] Translating story into task for title:', title);
    const result = await aiService.generateTask(title, story, memberNames);

    // Resolve assignee
    let assigneeEmail = '';
    if (result.assigneeName) {
      const match = emailMap.get(result.assigneeName.toLowerCase().trim());
      if (match) {
        assigneeEmail = match;
      }
    }

    // Resolve due date
    let dueDate = null;
    if (result.daysFromNow) {
      dueDate = new Date(Date.now() + result.daysFromNow * 24 * 60 * 60 * 1000);
    }

    // Get max order
    const maxItem = await Item.findOne({ board: boardId, columnId })
      .sort({ order: -1 })
      .select('order');
    const order = maxItem ? maxItem.order + 1 : 0;

    // Build checklist
    const checklist = (result.checklist || []).map(c => ({
      id: Math.random().toString(36).substring(2, 9),
      text: c.text,
      completed: false
    }));

    // Create item
    const item = await Item.create({
      board: boardId,
      columnId,
      title: result.title || title,
      description: result.description || '',
      type: result.type || 'Task',
      priority: result.priority || 'Medium',
      assignee: assigneeEmail,
      dueDate,
      checklist,
      order
    });

    // Log Activity
    await ActivityService.log({
      actorId: req.user._id,
      boardId,
      taskId: item._id,
      actionType: 'TASK_CREATED',
      newValue: item.title,
      metadata: {
        taskTitle: item.title,
        taskKey: `TASK-${item._id.toString().slice(-5).toUpperCase()}`
      }
    });

    // Notify assignee if set
    if (item.assignee) {
      const NotificationService = require('../services/NotificationService');
      NotificationService.triggerEvent('TASK_ASSIGNED', {
        item,
        assigner: req.user
      }).catch(err => console.error('Error triggering assignment event:', err.message));
    }

    // Broadcast board update
    SocketService.broadcastToBoard(boardId.toString(), 'board:updated', {
      action: 'ITEM_CREATED',
      boardId: boardId.toString(),
      itemId: item._id.toString(),
      senderId: req.user._id.toString()
    });

    const enriched = await enrichItemWithDetails(item);
    res.status(201).json({ success: true, item: enriched });

  } catch (error) {
    console.error('[AI Controller] Error in generateTask:', error);
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  generateBoard,
  generateColumns,
  suggestTaskMeta,
  breakTask,
  rewriteDescription,
  boardChat,
  generateTask
};
