const Board = require('../models/Board');
const Workspace = require('../models/Workspace');
const Item = require('../models/Item');
const WorkspaceMember = require('../models/WorkspaceMember');
const User = require('../models/User');
const Label = require('../models/Label');
const TaskLabel = require('../models/TaskLabel');
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

    // Create tasks - Place all tickets in the first column in sequential order
    if (items.length > 0) {
      const firstColumnId = columns && columns.length > 0 ? columns[0].id : 'todo';
      const itemsToCreate = items.map((item, index) => ({
        board: board._id,
        columnId: firstColumnId,
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

    if (result.actions && result.actions.length > 0) {
      await executeChatActions(result.actions, board.workspace || board.workspaceId, boardId, req.user);
    }

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

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const AIBoardSession = require('../models/AIBoardSession');
const documentParser = require('../services/documentParser');

/**
 * @desc    Upload document and create AI session
 * @route   POST /api/ai/board-session/upload
 * @access  Private
 */
const uploadDocumentSession = async (req, res) => {
  try {
    const workspaceId = req.query.workspaceId;
    const boardId = req.query.boardId || null;
    const fileName = req.query.fileName || 'document.txt';

    if (!workspaceId) {
      return res.status(400).json({ message: 'Workspace ID is required' });
    }

    // Ensure temp directory exists
    const tempDir = path.join(__dirname, '../../uploads/temp');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    const fileId = crypto.randomUUID();
    const tempFilePath = path.join(tempDir, `${fileId}-${fileName}`);

    // Pipe raw binary payload to file
    const writeStream = fs.createWriteStream(tempFilePath);
    
    writeStream.on('error', (err) => {
      console.error('[AI Controller] Write stream error:', err);
      if (fs.existsSync(tempFilePath)) {
        try { fs.unlinkSync(tempFilePath); } catch (e) {}
      }
      if (!res.headersSent) {
        res.status(500).json({ message: 'Error writing temporary file: ' + err.message });
      }
    });

    req.pipe(writeStream);

    writeStream.on('finish', async () => {
      try {
        // Extract text
        const mimeType = req.headers['content-type'] || 'application/octet-stream';
        const documentText = await documentParser.extractTextFromFile(tempFilePath, mimeType, fileName);

        // Delete temp file
        if (fs.existsSync(tempFilePath)) {
          fs.unlinkSync(tempFilePath);
        }

        if (!documentText || !documentText.trim()) {
          return res.status(400).json({ message: 'Document appears to be empty or contains no readable text.' });
        }

        let summary = {};
        let initialQuestions = [];
        let prdMarkdown = '';

        if (boardId) {
          // Syncing with existing board
          const boardObj = await Board.findById(boardId);
          if (!boardObj) {
            return res.status(404).json({ message: 'Board not found' });
          }
          const existingTasks = await Item.find({ board: boardId, archived: false });
          const analysis = await aiService.analyzeDocumentForExistingBoard(documentText, existingTasks);
          summary = {
            projectName: boardObj.name,
            description: boardObj.description || '',
            newTasks: analysis.newTasks || [],
            updates: analysis.updates || [],
            duplicates: analysis.duplicates || [],
            features: []
          };
          initialQuestions = analysis.initialQuestions || [];
          prdMarkdown = analysis.prdMarkdown || '';
        } else {
          // New board analysis
          const analysis = await aiService.analyzeDocumentForNewBoard(documentText);
          summary = {
            projectName: analysis.projectName || 'New AI Board',
            description: analysis.description || '',
            features: analysis.features || [],
            teamMembers: analysis.teamMembers || [],
            potentialTasks: analysis.potentialTasks || [],
            newTasks: [],
            updates: [],
            duplicates: []
          };
          initialQuestions = analysis.initialQuestions || [];
          prdMarkdown = analysis.prdMarkdown || '';
        }

        const questionsArray = initialQuestions.map(q => ({
          questionText: q,
          answerText: '',
          isAnswered: false
        }));

        const status = questionsArray.length > 0 ? 'question' : 'summary';

        // If no questions, pre-generate preview so it's ready
        let preview = {};
        if (status === 'summary') {
          // Load members names for assignment suggestions
          const members = await WorkspaceMember.find({ workspaceId }).populate('userId');
          const memberNames = members.map(m => m.userId ? m.userId.name : '').filter(Boolean);
          
          let existingContext = null;
          if (boardId) {
            const boardObj = await Board.findById(boardId);
            existingContext = {
              columns: boardObj.columns,
              memberNames
            };
          } else {
            existingContext = {
              columns: [],
              memberNames
            };
          }

          const generatedPreview = await aiService.generateBoardPreview(documentText, [], [], existingContext);
          preview = {
            boardName: generatedPreview.boardName || summary.projectName,
            description: generatedPreview.description || summary.description,
            columns: generatedPreview.columns || [
              { id: 'todo', name: 'To Do', order: 0, isDone: false },
              { id: 'progress', name: 'In Progress', order: 1, isDone: false },
              { id: 'done', name: 'Done', order: 2, isDone: true }
            ],
            tasks: generatedPreview.tasks || []
          };
        }

        // Create the session
        const session = await AIBoardSession.create({
          workspace: workspaceId,
          board: boardId,
          documentName: fileName,
          documentText,
          status: status === 'summary' && preview.tasks ? 'preview' : status,
          summary,
          questions: questionsArray,
          currentQuestionIndex: 0,
          prdMarkdown,
          preview,
          createdBy: req.user._id
        });

        res.status(201).json({ success: true, session });
      } catch (err) {
        console.error('[AI Controller] Error processing document:', err);
        // Clean up temp file on error
        if (fs.existsSync(tempFilePath)) {
          fs.unlinkSync(tempFilePath);
        }
        res.status(500).json({ message: err.message });
      }
    });

    req.on('error', (err) => {
      console.error('[AI Controller] Stream upload error:', err);
      if (fs.existsSync(tempFilePath)) {
        try { fs.unlinkSync(tempFilePath); } catch (e) {}
      }
      if (!res.headersSent) {
        res.status(500).json({ message: err.message });
      }
    });

  } catch (error) {
    console.error('[AI Controller] Error in uploadDocumentSession:', error);
    res.status(500).json({ message: error.message });
  }
};

/**
 * @desc    Submit comment to refine plan
 * @route   POST /api/ai/board-session/:id/comment
 * @access  Private
 */
const addCommentToSession = async (req, res) => {
  try {
    const { id } = req.params;
    const { comment, teamMembers } = req.body;

    const session = await AIBoardSession.findById(id);
    if (!session) {
      return res.status(404).json({ message: 'Session not found' });
    }

    if (teamMembers) {
      session.summary.teamMembers = teamMembers;
      await session.save();
      if (!comment) {
        return res.status(200).json({ success: true, session });
      }
    }

    if (!comment) {
      return res.status(400).json({ message: 'Comment is required' });
    }

    // Append comment
    session.comments.push({ role: 'user', text: comment });
    session.status = 'summary'; // temporary transition back

    // Load workspace members
    const members = await WorkspaceMember.find({ workspaceId: session.workspace }).populate('userId');
    const memberNames = members.map(m => m.userId ? m.userId.name : '').filter(Boolean);

    let existingContext = null;
    if (session.board) {
      const boardObj = await Board.findById(session.board);
      existingContext = {
        columns: boardObj.columns,
        memberNames
      };
    } else {
      existingContext = {
        columns: [],
        memberNames
      };
    }

    // Re-evaluate and generate updated preview
    const previewRes = await aiService.generateBoardPreview(
      session.documentText,
      session.comments,
      session.questions.filter(q => q.isAnswered),
      existingContext
    );

    if (previewRes.nextQuestion) {
      // AI wants to ask another question
      session.questions.push({
        questionText: previewRes.nextQuestion,
        answerText: '',
        isAnswered: false
      });
      session.currentQuestionIndex = session.questions.length - 1;
      session.status = 'question';
    } else {
      // No more questions, show preview
      session.preview = {
        boardName: previewRes.boardName || session.summary.projectName,
        description: previewRes.description || session.summary.description,
        columns: previewRes.columns || [
          { id: 'todo', name: 'To Do', order: 0, isDone: false },
          { id: 'progress', name: 'In Progress', order: 1, isDone: false },
          { id: 'done', name: 'Done', order: 2, isDone: true }
        ],
        tasks: previewRes.tasks || []
      };
      session.status = 'preview';
    }

    await session.save();
    res.status(200).json({ success: true, session });
  } catch (error) {
    console.error('[AI Controller] Error in addCommentToSession:', error);
    res.status(500).json({ message: error.message });
  }
};

/**
 * @desc    Submit answer to active question
 * @route   POST /api/ai/board-session/:id/answer
 * @access  Private
 */
const answerSessionQuestion = async (req, res) => {
  try {
    const { id } = req.params;
    const { answer, skipAll } = req.body;

    if (skipAll) {
      const session = await AIBoardSession.findById(id);
      if (!session) {
        return res.status(404).json({ message: 'Session not found' });
      }

      // Mark all remaining questions as skipped
      session.questions.forEach(q => {
        if (!q.isAnswered) {
          q.answerText = 'Skipped';
          q.isAnswered = true;
        }
      });

      // Load workspace members
      const members = await WorkspaceMember.find({ workspaceId: session.workspace }).populate('userId');
      const memberNames = members.map(m => m.userId ? m.userId.name : '').filter(Boolean);

      let existingContext = null;
      if (session.board) {
        const boardObj = await Board.findById(session.board);
        existingContext = {
          columns: boardObj.columns,
          memberNames
        };
      } else {
        existingContext = {
          columns: [],
          memberNames
        };
      }

      // Generate preview directly bypassing questions evaluation loop
      const previewRes = await aiService.generateBoardPreview(
        session.documentText,
        session.comments,
        session.questions.filter(q => q.isAnswered),
        existingContext
      );

      session.preview = {
        boardName: previewRes.boardName || session.summary.projectName,
        description: previewRes.description || session.summary.description,
        columns: previewRes.columns || [
          { id: 'todo', name: 'To Do', order: 0, isDone: false },
          { id: 'progress', name: 'In Progress', order: 1, isDone: false },
          { id: 'done', name: 'Done', order: 2, isDone: true }
        ],
        tasks: previewRes.tasks || []
      };
      session.status = 'preview';

      await session.save();
      return res.status(200).json({ success: true, session });
    }

    if (!answer) {
      return res.status(400).json({ message: 'Answer is required' });
    }

    const session = await AIBoardSession.findById(id);
    if (!session) {
      return res.status(404).json({ message: 'Session not found' });
    }

    const activeQ = session.questions[session.currentQuestionIndex];
    if (!activeQ) {
      return res.status(400).json({ message: 'No active question found to answer' });
    }

    activeQ.answerText = answer;
    activeQ.isAnswered = true;

    // Check if there are any remaining unanswered questions in the current queue
    const nextUnansweredIndex = session.questions.findIndex(q => !q.isAnswered);
    if (nextUnansweredIndex !== -1) {
      session.currentQuestionIndex = nextUnansweredIndex;
      session.status = 'question';
      await session.save();
      return res.status(200).json({ success: true, session });
    }

    // Load workspace members
    const members = await WorkspaceMember.find({ workspaceId: session.workspace }).populate('userId');
    const memberNames = members.map(m => m.userId ? m.userId.name : '').filter(Boolean);

    let existingContext = null;
    if (session.board) {
      const boardObj = await Board.findById(session.board);
      existingContext = {
        columns: boardObj.columns,
        memberNames
      };
    } else {
      existingContext = {
        columns: [],
        memberNames
      };
    }

    // Call AI to evaluate answer
    const previewRes = await aiService.generateBoardPreview(
      session.documentText,
      session.comments,
      session.questions.filter(q => q.isAnswered),
      existingContext
    );

    if (previewRes.nextQuestion) {
      // Ask next question
      session.questions.push({
        questionText: previewRes.nextQuestion,
        answerText: '',
        isAnswered: false
      });
      session.currentQuestionIndex = session.questions.length - 1;
      session.status = 'question';
    } else {
      // Go to preview
      session.preview = {
        boardName: previewRes.boardName || session.summary.projectName,
        description: previewRes.description || session.summary.description,
        columns: previewRes.columns || [
          { id: 'todo', name: 'To Do', order: 0, isDone: false },
          { id: 'progress', name: 'In Progress', order: 1, isDone: false },
          { id: 'done', name: 'Done', order: 2, isDone: true }
        ],
        tasks: previewRes.tasks || []
      };
      session.status = 'preview';
    }

    await session.save();
    res.status(200).json({ success: true, session });
  } catch (error) {
    console.error('[AI Controller] Error in answerSessionQuestion:', error);
    res.status(500).json({ message: error.message });
  }
};

/**
 * @desc    Confirm project plan and build board / tasks
 * @route   POST /api/ai/board-session/:id/confirm
 * @access  Private
 */
const confirmSession = async (req, res) => {
  try {
    const { id } = req.params;
    const session = await AIBoardSession.findById(id);
    if (!session) {
      return res.status(404).json({ message: 'Session not found' });
    }

    if (session.status !== 'preview') {
      return res.status(400).json({ message: 'Session is not ready for confirmation (current status: ' + session.status + ')' });
    }

    // Fetch members to map names to email assignees
    const members = await WorkspaceMember.find({ workspaceId: session.workspace }).populate('userId');
    const emailMap = new Map();
    members.forEach(m => {
      if (m.userId && m.userId.name && m.userId.email) {
        emailMap.set(m.userId.name.toLowerCase().trim(), m.userId.email);
      }
    });

    let boardObj;

    if (session.board) {
      // Syncing with existing board
      boardObj = await Board.findById(session.board);
      if (!boardObj) {
        return res.status(404).json({ message: 'Board not found' });
      }

      // Add to sourceDocuments
      const alreadyLinked = boardObj.sourceDocuments?.some(doc => doc.fileName === session.documentName);
      if (!alreadyLinked) {
        if (!boardObj.sourceDocuments) boardObj.sourceDocuments = [];
        boardObj.sourceDocuments.push({ fileName: session.documentName });
        await boardObj.save();
      }

      // Process tasks updates and creation
      const previewTasks = session.preview.tasks || [];
      for (const t of previewTasks) {
        let assigneeEmail = '';
        if (t.assignee) {
          const match = emailMap.get(t.assignee.toLowerCase().trim());
          if (match) assigneeEmail = match;
        }

        if (t.isNew) {
          // Find max order
          const maxItem = await Item.findOne({ board: boardObj._id, columnId: t.columnId })
            .sort({ order: -1 })
            .select('order');
          const order = maxItem ? maxItem.order + 1 : 0;

          await Item.create({
            board: boardObj._id,
            columnId: t.columnId,
            title: t.title,
            description: t.description || '',
            type: t.type || 'Task',
            priority: t.priority || 'Medium',
            assignee: assigneeEmail,
            source: t.source || `Document: ${session.documentName}`,
            order
          });
        } else if (t.existingTaskId) {
          // Update existing
          const bodyToUpdate = {
            title: t.title,
            description: t.description || '',
            columnId: t.columnId,
            type: t.type || 'Task',
            priority: t.priority || 'Medium',
            source: t.source || `Document: ${session.documentName}`
          };
          if (assigneeEmail) {
            bodyToUpdate.assignee = assigneeEmail;
          }
          await Item.findByIdAndUpdate(t.existingTaskId, { $set: bodyToUpdate });
        }
      }

      // Log activity
      await ActivityService.log({
        actorId: req.user._id,
        workspaceId: session.workspace,
        boardId: boardObj._id,
        actionType: 'BOARD_UPDATED',
        newValue: `Synced tasks with AI Document: ${session.documentName}`,
        metadata: { boardName: boardObj.name }
      });

    } else {
      // Create new board
      let boardName = session.preview.boardName || session.summary.projectName || 'New AI Board';
      const columns = session.preview.columns || [
        { id: 'todo', name: 'To Do', order: 0, isDone: false },
        { id: 'progress', name: 'In Progress', order: 1, isDone: false },
        { id: 'done', name: 'Done', order: 2, isDone: true }
      ];

      // Make sure board name is unique in this workspace
      let finalBoardName = boardName;
      let existing = await Board.findOne({ workspace: session.workspace, name: { $regex: new RegExp(`^${finalBoardName}$`, 'i') } });
      let counter = 1;
      while (existing) {
        finalBoardName = `${boardName} (${counter})`;
        existing = await Board.findOne({ workspace: session.workspace, name: { $regex: new RegExp(`^${finalBoardName}$`, 'i') } });
        counter++;
      }

      boardObj = await Board.create({
        name: finalBoardName,
        workspace: session.workspace,
        columns,
        owner: req.user._id,
        createdBy: req.user._id,
        sourceDocuments: [{ fileName: session.documentName }]
      });

      // Create preview tasks
      const previewTasks = session.preview.tasks || [];
      if (previewTasks.length > 0) {
        const itemsToCreate = previewTasks.map((t, index) => {
          let assigneeEmail = '';
          if (t.assignee) {
            const match = emailMap.get(t.assignee.toLowerCase().trim());
            if (match) assigneeEmail = match;
          }

          return {
            board: boardObj._id,
            columnId: t.columnId || columns[0].id,
            title: t.title,
            description: t.description || '',
            type: t.type || 'Task',
            priority: t.priority || 'Medium',
            assignee: assigneeEmail,
            source: t.source || `Document: ${session.documentName}`,
            order: index
          };
        });

        await Item.insertMany(itemsToCreate);
      }

      // Log Activity
      await ActivityService.log({
        actorId: req.user._id,
        workspaceId: session.workspace,
        boardId: boardObj._id,
        actionType: 'PROJECT_CREATED',
        newValue: finalBoardName,
        metadata: { projectName: finalBoardName }
      });
    }

    // Broadcast Board created / updated via WebSockets
    SocketService.broadcastToWorkspace(session.workspace.toString(), 'workspace:updated', {
      action: session.board ? 'BOARD_UPDATED' : 'BOARD_CREATED',
      workspaceId: session.workspace.toString(),
      boardId: boardObj._id.toString(),
      senderId: req.user._id.toString()
    });

    session.status = 'completed';
    await session.save();

    res.status(200).json({ success: true, board: boardObj });
  } catch (error) {
    console.error('[AI Controller] Error in confirmSession:', error);
    res.status(500).json({ message: error.message });
  }
};

/**
 * @desc    Cancel AI board session
 * @route   POST /api/ai/board-session/:id/cancel
 * @access  Private
 */
const cancelSession = async (req, res) => {
  try {
    const { id } = req.params;
    const session = await AIBoardSession.findById(id);
    if (!session) {
      return res.status(404).json({ message: 'Session not found' });
    }

    session.status = 'cancelled';
    await session.save();

    res.status(200).json({ success: true, message: 'AI session cancelled successfully.' });
  } catch (error) {
    console.error('[AI Controller] Error in cancelSession:', error);
    res.status(500).json({ message: error.message });
  }
};

/**
 * @desc    Chat based on workspace dashboard and its projects/tasks
 * @route   POST /api/ai/workspace/:workspaceId/chat
 * @access  Private
 */
const workspaceChat = async (req, res) => {
  try {
    const { workspaceId } = req.params;
    const { message } = req.body;
    if (!workspaceId || !message) {
      return res.status(400).json({ message: 'Workspace ID and message are required' });
    }

    const workspace = await Workspace.findById(workspaceId);
    if (!workspace) {
      return res.status(404).json({ message: 'Workspace not found' });
    }

    // Get all boards in the workspace
    const boards = await Board.find({ workspace: workspaceId });
    const boardIds = boards.map(b => b._id);

    // Get all items in those boards
    const tasks = await Item.find({ board: { $in: boardIds }, archived: false });

    console.log('[AI Controller] Workspace chat query for:', workspace.name);
    const result = await aiService.workspaceChat(workspace.name, boards, tasks, message);

    if (result.actions && result.actions.length > 0) {
      await executeChatActions(result.actions, workspaceId, null, req.user);
    }

    res.status(200).json({ success: true, reply: result.reply || '' });
  } catch (error) {
    console.error('[AI Controller] Error in workspaceChat:', error);
    res.status(500).json({ message: error.message });
  }
};

/**
 * Helper to sync label definitions and create new ones on the fly for the workspace
 */
const syncItemLabels = async (item, labelsInput, workspaceId) => {
  if (!labelsInput || !workspaceId) return;
  const targetLabelIds = [];
  for (const lab of labelsInput) {
    const mongoose = require('mongoose');
    if (mongoose.Types.ObjectId.isValid(lab)) {
      targetLabelIds.push(lab);
    } else {
      let labelRecord = await Label.findOne({ workspace_id: workspaceId, name: lab.trim() });
      if (!labelRecord) {
        labelRecord = await Label.create({
          workspace_id: workspaceId,
          name: lab.trim(),
          color: '#3b82f6'
        });
      }
      targetLabelIds.push(labelRecord._id);
    }
  }

  await TaskLabel.deleteMany({ task_id: item._id });
  if (targetLabelIds.length > 0) {
    const assignments = targetLabelIds.map(lid => ({
      task_id: item._id,
      label_id: lid
    }));
    await TaskLabel.insertMany(assignments);
  }
};

/**
 * Parses and executes chat action updates in the database
 */
const executeChatActions = async (actions, workspaceId, defaultBoardId, user) => {
  if (!actions || !Array.isArray(actions)) return;

  const NotificationService = require('../services/NotificationService');

  for (const action of actions) {
    if (action.type === 'update_task') {
      let item = null;

      // 1. Locate task
      if (action.taskId) {
        const mongoose = require('mongoose');
        if (mongoose.Types.ObjectId.isValid(action.taskId)) {
          item = await Item.findById(action.taskId);
        }
      }
      if (!item && action.taskTitle) {
        // Try searching inside board or workspace
        const searchBoardIds = [];
        if (defaultBoardId) {
          searchBoardIds.push(defaultBoardId);
        } else if (workspaceId) {
          const boards = await Board.find({ workspace: workspaceId });
          searchBoardIds.push(...boards.map(b => b._id));
        }

        // Try exact match first (case-insensitive)
        item = await Item.findOne({
          board: { $in: searchBoardIds },
          title: { $regex: new RegExp('^' + escapeRegExp(action.taskTitle) + '$', 'i') }
        });

        // Try substring match if no exact match
        if (!item) {
          item = await Item.findOne({
            board: { $in: searchBoardIds },
            title: { $regex: new RegExp(escapeRegExp(action.taskTitle), 'i') }
          });
        }
      }

      if (!item) {
        console.log('[AI Assistant Action] Task not found for update:', action);
        continue;
      }

      const boardObj = await Board.findById(item.board);
      const wsId = workspaceId || (boardObj ? boardObj.workspaceId || boardObj.workspace : null);

      // Save old values for activity log
      const oldColumnId = item.columnId;
      const oldPriority = item.priority;
      const oldAssignee = item.assignee;
      const oldDueDate = item.dueDate;

      let columnChanged = false;
      let priorityChanged = false;
      let assigneeChanged = false;
      let dueDateChanged = false;

      // 2. Process column stage update
      if (action.updates && action.updates.columnId) {
        const colVal = action.updates.columnId.toLowerCase().trim();
        if (boardObj && boardObj.columns) {
          const matchedCol = boardObj.columns.find(c =>
            c.id === action.updates.columnId ||
            c.name.toLowerCase().trim() === colVal ||
            c.name.toLowerCase().replace(/[^a-z0-9]/g, '') === colVal.replace(/[^a-z0-9]/g, '')
          );
          if (matchedCol && matchedCol.id !== oldColumnId) {
            item.columnId = matchedCol.id;
            columnChanged = true;
          }
        }
      }

      // 3. Process priority update
      if (action.updates && action.updates.priority) {
        const prioMap = {
          lowest: 'Lowest', low: 'Low', medium: 'Medium', high: 'High', highest: 'Highest', critical: 'Critical'
        };
        const mappedPrio = prioMap[action.updates.priority.toLowerCase().trim()];
        if (mappedPrio && mappedPrio !== oldPriority) {
          item.priority = mappedPrio;
          priorityChanged = true;
        }
      }

      // 4. Process assignee update
      if (action.updates && action.updates.assignee !== undefined) {
        if (!action.updates.assignee) {
          if (oldAssignee) {
            item.assignee = null;
            assigneeChanged = true;
          }
        } else {
          const assignStr = action.updates.assignee.toLowerCase().trim();
          const members = await WorkspaceMember.find({ workspaceId: wsId }).populate('userId');
          const matchedMember = members.find(m =>
            m.userId && (
              m.userId.email.toLowerCase().trim() === assignStr ||
              m.userId.name.toLowerCase().trim() === assignStr ||
              m.userId.name.toLowerCase().replace(/[^a-z0-9]/g, '').includes(assignStr.replace(/[^a-z0-9]/g, ''))
            )
          );
          if (matchedMember && matchedMember.userId.email !== oldAssignee) {
            item.assignee = matchedMember.userId.email;
            assigneeChanged = true;
          }
        }
      }

      // 5. Process due date update
      if (action.updates && action.updates.dueDate !== undefined) {
        const newD = action.updates.dueDate ? new Date(action.updates.dueDate) : null;
        const oldTime = oldDueDate ? new Date(oldDueDate).getTime() : 0;
        const newTime = newD ? newD.getTime() : 0;
        if (oldTime !== newTime) {
          item.dueDate = newD;
          dueDateChanged = true;
        }
      }

      // Save changes if any field updated
      if (columnChanged || priorityChanged || assigneeChanged || dueDateChanged) {
        await item.save();

        if (columnChanged) {
          const targetItems = await Item.find({
            board: item.board,
            columnId: item.columnId,
            _id: { $ne: item._id },
            archived: { $ne: true }
          }).sort({ order: 1 });
          targetItems.push(item);
          for (let i = 0; i < targetItems.length; i++) {
            targetItems[i].order = i;
            await targetItems[i].save();
          }

          const sourceItems = await Item.find({
            board: item.board,
            columnId: oldColumnId,
            archived: { $ne: true }
          }).sort({ order: 1 });
          for (let i = 0; i < sourceItems.length; i++) {
            sourceItems[i].order = i;
            await sourceItems[i].save();
          }
        }

        // Log Activities
        if (columnChanged) {
          await ActivityService.log({
            actorId: user._id,
            taskId: item._id,
            actionType: 'STATUS_CHANGED',
            oldValue: oldColumnId,
            newValue: item.columnId,
            metadata: { taskTitle: item.title, taskKey: `TASK-${item._id.toString().slice(-5).toUpperCase()}` }
          });
          NotificationService.triggerEvent('TASK_STATUS_CHANGED', {
            item,
            actor: user,
            oldStatus: oldColumnId,
            newStatus: item.columnId
          }).catch(err => console.error('Error in status notify:', err.message));
        }

        if (priorityChanged) {
          await ActivityService.log({
            actorId: user._id,
            taskId: item._id,
            actionType: 'PRIORITY_CHANGED',
            oldValue: oldPriority,
            newValue: item.priority,
            metadata: { taskTitle: item.title, taskKey: `TASK-${item._id.toString().slice(-5).toUpperCase()}` }
          });
        }

        if (assigneeChanged) {
          await ActivityService.log({
            actorId: user._id,
            taskId: item._id,
            actionType: item.assignee ? 'TASK_ASSIGNED' : 'TASK_UNASSIGNED',
            oldValue: oldAssignee || null,
            newValue: item.assignee || null,
            metadata: { taskTitle: item.title, taskKey: `TASK-${item._id.toString().slice(-5).toUpperCase()}` }
          });
          if (item.assignee) {
            NotificationService.triggerEvent('TASK_ASSIGNED', {
              item,
              assigner: user
            }).catch(err => console.error('Error in assign notify:', err.message));
          }
        }

        if (dueDateChanged) {
          const oldValStr = oldDueDate ? new Date(oldDueDate).toISOString().slice(0, 10) : null;
          const newValStr = item.dueDate ? new Date(item.dueDate).toISOString().slice(0, 10) : null;
          await ActivityService.log({
            actorId: user._id,
            taskId: item._id,
            actionType: 'DUE_DATE_CHANGED',
            oldValue: oldValStr,
            newValue: newValStr,
            metadata: { taskTitle: item.title, taskKey: `TASK-${item._id.toString().slice(-5).toUpperCase()}` }
          });
        }
      }

      // 6. Process labels update
      if (action.updates && action.updates.labels !== undefined && wsId) {
        const oldTaskLabels = await TaskLabel.find({ task_id: item._id }).populate('label_id');
        const oldLabNames = oldTaskLabels.map(tl => tl.label_id ? tl.label_id.name : '').filter(Boolean);

        await syncItemLabels(item, action.updates.labels, wsId);

        const added = action.updates.labels.filter(x => !oldLabNames.includes(x));
        const removed = oldLabNames.filter(x => !action.updates.labels.includes(x));

        for (const lab of added) {
          await ActivityService.log({
            actorId: user._id,
            taskId: item._id,
            actionType: 'LABEL_ADDED',
            newValue: lab,
            metadata: { taskTitle: item.title, taskKey: `TASK-${item._id.toString().slice(-5).toUpperCase()}` }
          });
        }
        for (const lab of removed) {
          await ActivityService.log({
            actorId: user._id,
            taskId: item._id,
            actionType: 'LABEL_REMOVED',
            oldValue: lab,
            metadata: { taskTitle: item.title, taskKey: `TASK-${item._id.toString().slice(-5).toUpperCase()}` }
          });
        }
      }

      // Broadcast real-time board update
      SocketService.broadcastToBoard(item.board.toString(), 'board:updated', {
        action: 'ITEM_UPDATED',
        boardId: item.board.toString(),
        itemId: item._id,
        senderId: user._id.toString()
      });
    }
  }
};

function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

module.exports = {
  generateBoard,
  generateColumns,
  suggestTaskMeta,
  breakTask,
  rewriteDescription,
  boardChat,
  workspaceChat,
  generateTask,
  uploadDocumentSession,
  addCommentToSession,
  answerSessionQuestion,
  confirmSession,
  cancelSession
};
