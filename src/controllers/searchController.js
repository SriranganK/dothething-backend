const Workspace = require('../models/Workspace');
const WorkspaceMember = require('../models/WorkspaceMember');
const Board = require('../models/Board');
const BoardMember = require('../models/BoardMember');
const Item = require('../models/Item');
const User = require('../models/User');
const Visibility = require('../constants/visibility');

/**
 * @desc    Global search across all resources
 * @route   GET /api/search
 * @access  Private
 */
const globalSearch = async (req, res) => {
  try {
    const userId = req.user._id;
    const query = req.query.q || '';
    const workspaceId = req.query.workspaceId;
    const limit = parseInt(req.query.limit, 10) || 5;
    const page = parseInt(req.query.page, 10) || 1;
    const skip = (page - 1) * limit;

    if (!query.trim()) {
      return res.status(200).json({
        success: true,
        results: {
          workspaces: [],
          boards: [],
          tasks: [],
          subtasks: [],
          users: [],
          analytics: []
        },
        totalCount: 0
      });
    }

    const regex = new RegExp(query, 'i');

    // 1. Fetch user memberships to restrict search by RBAC boundaries
    const myWorkspaceMemberships = await WorkspaceMember.find({ userId });
    const myWorkspaceIds = myWorkspaceMemberships.map(m => m.workspaceId);

    // If user has no workspaces, they cannot access anything except maybe profiles
    if (myWorkspaceIds.length === 0) {
      return res.status(200).json({
        success: true,
        results: { workspaces: [], boards: [], tasks: [], subtasks: [], users: [], analytics: [] },
        totalCount: 0
      });
    }

    // 2. Fetch boards user can access in these workspaces
    const boardsInMyWorkspaces = await Board.find({ workspace: { $in: myWorkspaceIds } });
    const boardMemberships = await BoardMember.find({ userId });
    const privateBoardIdsUserIsIn = boardMemberships.map(bm => bm.boardId.toString());

    const boardIdsUserCanAccess = boardsInMyWorkspaces
      .filter(board => board.visibility === Visibility.WORKSPACE || privateBoardIdsUserIsIn.includes(board._id.toString()))
      .map(board => board._id);

    // --- Executing Search Queries concurrently for optimal performance ---

    // A. Workspaces: only search workspaces user is a member of
    const workspaceQuery = {
      _id: { $in: myWorkspaceIds },
      name: { $regex: regex }
    };
    const workspacesPromise = Workspace.find(workspaceQuery)
      .limit(limit)
      .skip(skip)
      .lean();

    // B. Boards: only search accessible boards in user workspaces
    const boardQuery = {
      _id: { $in: boardIdsUserCanAccess },
      name: { $regex: regex }
    };
    if (workspaceId && myWorkspaceIds.map(id => id.toString()).includes(workspaceId)) {
      boardQuery.workspace = workspaceId;
    }
    const boardsPromise = Board.find(boardQuery)
      .populate('workspace', 'name')
      .limit(limit)
      .skip(skip)
      .lean();

    // C. Tasks (Items): only search tasks in accessible boards
    const taskQuery = {
      board: { $in: boardIdsUserCanAccess },
      archived: { $ne: true },
      $or: [
        { title: { $regex: regex } },
        { description: { $regex: regex } }
      ]
    };
    if (workspaceId) {
      const workspaceBoards = boardsInMyWorkspaces
        .filter(b => b.workspace.toString() === workspaceId)
        .map(b => b._id.toString());
      const filteredBoards = boardIdsUserCanAccess.filter(bId => workspaceBoards.includes(bId.toString()));
      taskQuery.board = { $in: filteredBoards };
    }
    const tasksPromise = Item.find(taskQuery)
      .populate('board', 'name workspace')
      .limit(limit)
      .skip(skip)
      .lean();

    // D. Subtasks (checklist items matching the regex inside Items on accessible boards)
    const subtaskQuery = {
      board: { $in: boardIdsUserCanAccess },
      archived: { $ne: true },
      'checklist.text': { $regex: regex }
    };
    if (workspaceId) {
      const workspaceBoards = boardsInMyWorkspaces
        .filter(b => b.workspace.toString() === workspaceId)
        .map(b => b._id.toString());
      const filteredBoards = boardIdsUserCanAccess.filter(bId => workspaceBoards.includes(bId.toString()));
      subtaskQuery.board = { $in: filteredBoards };
    }
    const itemsWithMatchingSubtasksPromise = Item.find(subtaskQuery)
      .populate('board', 'name workspace')
      .lean();

    // E. User Profiles: restrict searching to users sharing at least one workspace with the searcher
    const allMembersInMyWorkspaces = await WorkspaceMember.find({ workspaceId: { $in: myWorkspaceIds } });
    const colleagueUserIds = [...new Set(allMembersInMyWorkspaces.map(m => m.userId.toString()))];
    
    // Always include the user themselves in potential search results
    if (!colleagueUserIds.includes(userId.toString())) {
      colleagueUserIds.push(userId.toString());
    }

    const userQuery = {
      _id: { $in: colleagueUserIds },
      $or: [
        { name: { $regex: regex } },
        { email: { $regex: regex } }
      ]
    };
    const usersPromise = User.find(userQuery)
      .select('name email designation company department status')
      .limit(limit)
      .skip(skip)
      .lean();

    // Wait for queries to resolve
    const [workspaces, boards, tasks, itemsWithMatchingSubtasks, users] = await Promise.all([
      workspacesPromise,
      boardsPromise,
      tasksPromise,
      itemsWithMatchingSubtasksPromise,
      usersPromise
    ]);

    // Parse matching checklist items as subtask entities with link back to parent
    const subtasks = [];
    itemsWithMatchingSubtasks.forEach(item => {
      item.checklist.forEach(sub => {
        if (regex.test(sub.text)) {
          subtasks.push({
            _id: sub.id || sub._id,
            text: sub.text,
            completed: sub.completed,
            parentItem: {
              _id: item._id,
              title: item.title,
              board: item.board
            }
          });
        }
      });
    });
    const subtasksPaginated = subtasks.slice(skip, skip + limit);

    // F. Static Analytics Pages & Reports
    const staticPages = [
      { name: 'Dashboard & Analytics', type: 'analytics', route: 'dashboard', keywords: ['dashboard', 'analytics', 'charts', 'report', 'stats'] },
      { name: 'Milestones & Epics', type: 'milestones', route: 'milestones', keywords: ['milestones', 'epics', 'goals', 'targets', 'milestone'] },
      { name: 'Timeline View & Gantt', type: 'timeline', route: 'timeline', keywords: ['timeline', 'gantt', 'schedule', 'roadmap', 'calendar'] },
      { name: 'Labels Management', type: 'labels', route: 'labels', keywords: ['labels', 'tags', 'management', 'colors'] },
      { name: 'Expense Calculator', type: 'expense', route: 'expense', keywords: ['expense', 'finance', 'calculator', 'budget', 'money'] }
    ];

    const matchedPages = staticPages.filter(page => 
      page.name.toLowerCase().includes(query.toLowerCase()) || 
      page.keywords.some(kw => kw.includes(query.toLowerCase()) || query.toLowerCase().includes(kw))
    );

    const analyticsResults = [];
    const targetWorkspaceId = workspaceId || (myWorkspaceIds[0] ? myWorkspaceIds[0].toString() : null);
    if (targetWorkspaceId) {
      matchedPages.forEach(p => {
        analyticsResults.push({
          name: p.name,
          type: p.type,
          route: `/workspace/${targetWorkspaceId}/${p.route}`,
          workspaceId: targetWorkspaceId
        });
      });
    }

    // --- Relevance-Based Ranking and Sorting in JS Memory ---
    const calculateScore = (text, queryText) => {
      if (!text) return 0;
      const lowerText = text.toLowerCase();
      const lowerQuery = queryText.toLowerCase();
      if (lowerText === lowerQuery) return 100;
      if (lowerText.startsWith(lowerQuery)) return 50;
      if (lowerText.includes(lowerQuery)) return 20;
      return 0;
    };

    const rankResults = (list, textSelector) => {
      return list.map(item => {
        const text = textSelector(item);
        const score = calculateScore(text, query);
        return { ...item, score };
      }).sort((a, b) => b.score - a.score);
    };

    const rankedWorkspaces = rankResults(workspaces, w => w.name);
    const rankedBoards = rankResults(boards, b => b.name);
    const rankedTasks = rankResults(tasks, t => t.title);
    const rankedSubtasks = rankResults(subtasksPaginated, s => s.text);
    const rankedUsers = rankResults(users, u => u.name || u.email);
    const rankedAnalytics = rankResults(analyticsResults, a => a.name);

    const totalCount = 
      workspaces.length + 
      boards.length + 
      tasks.length + 
      subtasks.length + 
      users.length + 
      analyticsResults.length;

    return res.status(200).json({
      success: true,
      results: {
        workspaces: rankedWorkspaces,
        boards: rankedBoards,
        tasks: rankedTasks,
        subtasks: rankedSubtasks,
        users: rankedUsers,
        analytics: rankedAnalytics
      },
      totalCount
    });
  } catch (error) {
    console.error('Global search controller error:', error.message);
    return res.status(500).json({ message: 'Internal server error during global search' });
  }
};

module.exports = {
  globalSearch
};
