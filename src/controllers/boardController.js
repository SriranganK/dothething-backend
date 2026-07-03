const Board = require('../models/Board');
const Item = require('../models/Item');
const BoardMember = require('../models/BoardMember');
const { canAccessBoard } = require('../services/authorizationService');
const ActivityService = require('../services/ActivityService');

// Predefined board templates and their initial columns + starter items
const templates = {
  // Personal
  'daily-planner': {
    columns: [
      { id: 'todo', name: 'To Do', order: 0 },
      { id: 'in-progress', name: 'In Progress', order: 1 },
      { id: 'done', name: 'Done', order: 2 }
    ],
    items: [
      { title: "Plan today's schedule", columnId: 'todo', type: 'Task', priority: 'Medium', description: 'List out the top 3 priorities for today.' },
      { title: "Buy groceries", columnId: 'todo', type: 'Task', priority: 'Low', description: 'Milk, eggs, bread, and fruits.' },
      { title: "Gym session at 6 PM", columnId: 'in-progress', type: 'Event', priority: 'Medium', description: 'Upper body workout.' },
      { title: "Morning coffee & review", columnId: 'done', type: 'Task', priority: 'Low', description: 'Review email inbox and plan daily sync.' }
    ]
  },
  'habit-tracker': {
    columns: [
      { id: 'habits', name: 'Habits to Build', order: 0 },
      { id: 'completed', name: 'Completed Today', order: 1 },
      { id: 'streak', name: 'Weekly Streak', order: 2 }
    ],
    items: [
      { title: "Drink 3L of water daily", columnId: 'habits', type: 'Idea', priority: 'Medium', description: 'Keep a water bottle on the desk.' },
      { title: "Read 15 pages of a book", columnId: 'habits', type: 'Idea', priority: 'Low', description: 'Current book: Atomic Habits.' },
      { title: "Stretch for 10 mins", columnId: 'completed', type: 'Task', priority: 'Low', description: 'Light stretching exercises after waking up.' }
    ]
  },
  'weekly-planner': {
    columns: [
      { id: 'mon-tue', name: 'Mon / Tue', order: 0 },
      { id: 'wed-thu', name: 'Wed / Thu', order: 1 },
      { id: 'fri-sat', name: 'Fri / Sat', order: 2 },
      { id: 'sun', name: 'Sunday Routine', order: 3 }
    ],
    items: [
      { title: "Kickoff Sync on Monday", columnId: 'mon-tue', type: 'Event', priority: 'High', description: 'Sync with team about weekly deliverables.' },
      { title: "Mid-week review & update", columnId: 'wed-thu', type: 'Task', priority: 'Medium', description: 'Update status of sprint backlog items.' },
      { title: "Weekly review session", columnId: 'fri-sat', type: 'Event', priority: 'Medium', description: 'Wrap up tasks and plan for next week.' }
    ]
  },
  // Team
  'scrum-sprint': {
    columns: [
      { id: 'backlog', name: 'Sprint Backlog', order: 0 },
      { id: 'in-progress', name: 'In Progress', order: 1 },
      { id: 'review', name: 'Code Review', order: 2 },
      { id: 'done', name: 'Done', order: 3 }
    ],
    items: [
      { title: "Fix page layout overlap on mobile screens", columnId: 'backlog', type: 'Bug', priority: 'High', description: 'Navbar and layout elements overlap on viewport widths below 380px.' },
      { title: "Setup CI/CD pipeline environment variables", columnId: 'in-progress', type: 'Issue', priority: 'Critical', description: 'Configure staging environment keys in GitHub Actions.' },
      { title: "Create user authentication API endpoints", columnId: 'done', type: 'Task', priority: 'High', description: 'Implement register, login, and verify routes with JWT.' }
    ]
  },
  'kanban': {
    columns: [
      { id: 'todo', name: 'To Do', order: 0 },
      { id: 'in-progress', name: 'In Progress', order: 1 },
      { id: 'review', name: 'In Review', order: 2 },
      { id: 'done', name: 'Done', order: 3 }
    ],
    items: [
      { title: "Design dashboard layout in Figma", columnId: 'todo', type: 'Task', priority: 'Medium', description: 'Create responsive prototypes for the workspace home and board views.' },
      { title: "Resolve login redirect loop", columnId: 'in-progress', type: 'Bug', priority: 'High', description: 'Investigate token expiry handling leading to infinite reload on landing.' },
      { title: "Draft API documentation", columnId: 'review', type: 'Task', priority: 'Low', description: 'Generate swagger files or Postman collection.' }
    ]
  },
  'product-roadmap': {
    columns: [
      { id: 'ideas', name: 'Idea Pipeline', order: 0 },
      { id: 'q1', name: 'Q1 Planning', order: 1 },
      { id: 'q2', name: 'Q2 Execution', order: 2 },
      { id: 'released', name: 'Released / Done', order: 3 }
    ],
    items: [
      { title: "Real-time collaborative document editing", columnId: 'ideas', type: 'Idea', priority: 'Medium', description: 'Look into socket.io or Yjs for CRDT-based rich text.' },
      { title: "Integrate multi-tenant workspaces", columnId: 'q1', type: 'Task', priority: 'High', description: 'Deliver clean workspace segregation and database access checks.' },
      { title: "Upgrade to dynamic board custom templates", columnId: 'q2', type: 'Task', priority: 'High', description: 'Add dashboard layout updates supporting drag and drop columns.' }
    ]
  },
  // Business
  'crm': {
    columns: [
      { id: 'leads', name: 'New Leads', order: 0 },
      { id: 'contacted', name: 'Contacted', order: 1 },
      { id: 'proposal', name: 'Proposal Sent', order: 2 },
      { id: 'won-lost', name: 'Won / Lost', order: 3 }
    ],
    items: [
      { title: "Acme Corp (Potential Enterprise client)", columnId: 'leads', type: 'Lead', priority: 'High', description: '500+ seat potential deal. Inbound request.' },
      { title: "Stark Industries (Sent pricing info)", columnId: 'contacted', type: 'Lead', priority: 'Critical', description: 'Had demo call. Follow up about customized SLA agreement.' },
      { title: "Wayne Enterprises (Awaiting contract sign)", columnId: 'proposal', type: 'Lead', priority: 'High', description: 'Draft contract shared. Legal team review expected by Monday.' }
    ]
  },
  'marketing-pipeline': {
    columns: [
      { id: 'brainstorm', name: 'Brainstorming', order: 0 },
      { id: 'drafting', name: 'Content Draft', order: 1 },
      { id: 'review', name: 'Review / QA', order: 2 },
      { id: 'published', name: 'Published', order: 3 }
    ],
    items: [
      { title: "Write blog post about productivity tips", columnId: 'brainstorm', type: 'Idea', priority: 'Low', description: 'Highlighting time blocking, template boards, and focus modes.' },
      { title: "Draft newsletter for June release", columnId: 'drafting', type: 'Task', priority: 'Medium', description: 'Compile the key updates, bugs fixed, and upcoming roadmap items.' },
      { title: "Social media announcement prep", columnId: 'review', type: 'Event', priority: 'Medium', description: 'Prepare graphics and copy for LinkedIn and X announcements.' }
    ]
  },
  'hiring-pipeline': {
    columns: [
      { id: 'sourced', name: 'Sourced Candidates', order: 0 },
      { id: 'screening', name: 'Phone Screen', order: 1 },
      { id: 'interview', name: 'Technical Interview', order: 2 },
      { id: 'offer', name: 'Offer / Hired', order: 3 }
    ],
    items: [
      { title: "Alice Smith (Lead Frontend Engineer)", columnId: 'sourced', type: 'Lead', priority: 'High', description: 'Ex-Google frontend developer. Sourced via LinkedIn.' },
      { title: "Bob Johnson (Backend Developer applicant)", columnId: 'screening', type: 'Lead', priority: 'Medium', description: 'Schedule 30 mins initial intro call next Tuesday.' },
      { title: "Charlie Brown (Senior Product Designer)", columnId: 'interview', type: 'Lead', priority: 'High', description: 'Portfolio review completed. Technical system design scheduled.' }
    ]
  }
};

/**
 * @desc    Get all boards for a workspace
 * @route   GET /api/boards
 * @access  Private
 */
const getBoards = async (req, res) => {
  try {
    const { workspaceId } = req.query;
    if (!workspaceId) {
      return res.status(400).json({ message: 'Workspace ID is required' });
    }

    let allBoards = await Board.find({ workspace: workspaceId }).sort({ createdAt: 1 }).lean();
    const boards = [];

    for (const board of allBoards) {
      const access = await canAccessBoard(req.user._id, board._id);
      if (access.allowed) {
        // Aggregate item counts per column for this board
        const columnCounts = await Item.aggregate([
          { $match: { board: board._id } },
          { $group: { _id: '$columnId', count: { $sum: 1 } } },
        ]);
        board.columns = board.columns.map((col) => {
          const cntObj = columnCounts.find((c) => c._id === col.id);
          return { ...col, itemCount: cntObj ? cntObj.count : 0 };
        });
        board.currentUserRole = access.role;
        boards.push(board);
      }
    }

    res.status(200).json({ boards });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/**
 * @desc    Create a new board (standard or template)
 * @route   POST /api/boards
 * @access  Private
 */
const createBoard = async (req, res) => {
  try {
    const { name, workspaceId, templateKey, visibility } = req.body;

    if (!name || !workspaceId) {
      return res.status(400).json({ message: 'Board name and workspaceId are required' });
    }

    let columns = [
      { id: 'todo', name: 'To Do', order: 0 },
      { id: 'in-progress', name: 'In Progress', order: 1 },
      { id: 'done', name: 'Done', order: 2 }
    ];
    let starterItems = [];

    // If template key matches, use that template structure
    if (templateKey && templates[templateKey]) {
      columns = templates[templateKey].columns;
      starterItems = templates[templateKey].items;
    }

    // Check for duplicate board name in the same workspace
    const existing = await Board.findOne({ workspace: workspaceId, name: { $regex: new RegExp(`^${name}$`, 'i') } });
    if (existing) {
      return res.status(400).json({ message: 'Board name already exists in this workspace' });
    }
    const board = await Board.create({
      name,
      workspace: workspaceId,
      columns,
      visibility: visibility || 'WORKSPACE',
      owner: req.user._id
    });

    await ActivityService.log({
      actorId: req.user._id,
      workspaceId,
      boardId: board._id,
      actionType: 'PROJECT_CREATED',
      newValue: name,
      metadata: { projectName: name }
    });

    // Create BoardMember for private boards
    if (board.visibility === 'PRIVATE') {
      await BoardMember.create({
        boardId: board._id,
        userId: req.user._id,
        role: 'OWNER'
      });
    }

    // Create starter items if template is selected
    if (starterItems.length > 0) {
      const itemsToCreate = starterItems.map((item, index) => ({
        ...item,
        board: board._id,
        order: index
      }));
      await Item.insertMany(itemsToCreate);
    }

    // Broadcast real-time workspace update
    const SocketService = require('../services/SocketService');
    SocketService.broadcastToWorkspace(workspaceId.toString(), 'workspace:updated', {
      action: 'BOARD_CREATED',
      workspaceId: workspaceId.toString(),
      boardId: board._id.toString(),
      senderId: req.user._id.toString()
    });

    res.status(201).json({ success: true, board });
  } catch (error) {
    res.status(450).json({ message: error.message });
  }
};

/**
 * @desc    Update board details (like columns list, rename, add, delete, reorder)
 * @route   PUT /api/boards/:id
 * @access  Private
 */
const updateBoard = async (req, res) => {
  try {
    const { name, columns } = req.body;
    const board = await Board.findById(req.params.id);

    if (!board) {
      return res.status(404).json({ message: 'Board not found' });
    }

    const oldName = board.name;

    if (name !== undefined) board.name = name;
    if (columns !== undefined) board.columns = columns;

    await board.save();

    if (name !== undefined && name !== oldName) {
      await ActivityService.log({
        actorId: req.user._id,
        workspaceId: board.workspace,
        boardId: board._id,
        actionType: 'PROJECT_UPDATED',
        oldValue: oldName,
        newValue: name,
        metadata: { projectName: name }
      });
    }

    // Broadcast real-time board updates to board room and workspace room
    const SocketService = require('../services/SocketService');
    SocketService.broadcastToBoard(board._id.toString(), 'board:updated', {
      action: 'BOARD_UPDATED',
      boardId: board._id.toString(),
      name: board.name,
      columns: board.columns,
      senderId: req.user._id.toString()
    });
    SocketService.broadcastToWorkspace(board.workspace.toString(), 'workspace:updated', {
      action: 'BOARD_UPDATED',
      workspaceId: board.workspace.toString(),
      boardId: board._id.toString(),
      senderId: req.user._id.toString()
    });

    res.status(200).json({ success: true, board });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

/**
 * @desc    Delete board and all associated items
 * @route   DELETE /api/boards/:id
 * @access  Private
 */
const deleteBoard = async (req, res) => {
  try {
    const board = await Board.findById(req.params.id);

    if (!board) {
      return res.status(404).json({ message: 'Board not found' });
    }

    // Delete all items on this board
    await Item.deleteMany({ board: board._id });
    // Delete board
    await board.deleteOne();

    // Broadcast real-time board deletion to board room and workspace room
    const SocketService = require('../services/SocketService');
    SocketService.broadcastToBoard(board._id.toString(), 'board:updated', {
      action: 'BOARD_DELETED',
      boardId: board._id.toString(),
      senderId: req.user._id.toString()
    });
    SocketService.broadcastToWorkspace(board.workspace.toString(), 'workspace:updated', {
      action: 'BOARD_DELETED',
      workspaceId: board.workspace.toString(),
      boardId: board._id.toString(),
      senderId: req.user._id.toString()
    });

    res.status(200).json({ success: true, message: 'Board and associated items deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/**
 * @desc    Get a single board by ID
 * @route   GET /api/boards/:id
 * @access  Private
 */
const getBoardById = async (req, res) => {
  try {
    // req.board is attached by requireBoardPermission middleware
    res.status(200).json({ success: true, board: req.board });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  getBoards,
  createBoard,
  updateBoard,
  deleteBoard,
  getBoardById
};
