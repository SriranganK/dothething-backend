const Board = require('../models/Board');
const Item = require('../models/Item');
const Label = require('../models/Label');
const TaskLabel = require('../models/TaskLabel');
const Milestone = require('../models/Milestone');
const WorkspaceMember = require('../models/WorkspaceMember');

// Helper to classify columns
const classifyColumn = (column) => {
  if (column.isDone) return 'Done';
  const name = column.name.toLowerCase();
  if (name.includes('done') || name.includes('complete') || name.includes('resolved') || name.includes('finish')) return 'Done';
  if (name.includes('progress') || name.includes('doing') || name.includes('started') || name.includes('active') || name.includes('develop')) return 'In Progress';
  if (name.includes('review') || name.includes('qa') || name.includes('test')) return 'Review';
  return 'Todo';
};

/**
 * @desc    Get dashboard analytics for a workspace
 * @route   GET /api/analytics/dashboard
 * @access  Private
 */
const getDashboardAnalytics = async (req, res) => {
  try {
    const workspaceId = req.query.workspaceId || req.body.workspaceId;
    if (!workspaceId) {
      return res.status(400).json({ message: 'Workspace ID is required' });
    }

    const boards = await Board.find({ workspace: workspaceId });
    const boardIds = boards.map(b => b._id);

    // Map column ID to classification type ('Todo', 'In Progress', 'Review', 'Done')
    const colIdToStatus = {};
    const doneColsMap = {}; // mapping boardId -> done column IDs list
    
    boards.forEach(b => {
      doneColsMap[b._id.toString()] = [];
      b.columns.forEach(col => {
        const category = classifyColumn(col);
        colIdToStatus[col.id] = category;
        if (category === 'Done') {
          doneColsMap[b._id.toString()].push(col.id);
        }
      });
    });

    const items = await Item.find({ board: { $in: boardIds }, archived: { $ne: true } });

    // 1. Task Status Distribution
    const statusDistribution = { Todo: 0, 'In Progress': 0, Review: 0, Done: 0 };
    items.forEach(item => {
      const status = colIdToStatus[item.columnId] || 'Todo';
      statusDistribution[status]++;
    });

    // 2. Task Type Distribution
    const typeDistribution = {};
    items.forEach(item => {
      const type = item.type || 'Task';
      typeDistribution[type] = (typeDistribution[type] || 0) + 1;
    });

    // 3. Label Distribution
    const labels = await Label.find({ workspace_id: workspaceId });
    const labelCounts = [];
    for (const label of labels) {
      const count = await TaskLabel.countDocuments({ label_id: label._id });
      labelCounts.push({
        id: label._id,
        name: label.name,
        color: label.color,
        count
      });
    }

    // 4. Milestone Progress Comparison
    const milestones = await Milestone.find({ workspace_id: workspaceId });
    const milestoneProgress = [];
    for (const milestone of milestones) {
      const msItems = await Item.find({ milestone_id: milestone._id, archived: { $ne: true } });
      let completed = 0;
      msItems.forEach(item => {
        const isDone = doneColsMap[item.board.toString()]?.includes(item.columnId) || false;
        if (isDone) completed++;
      });
      const progress = msItems.length > 0 ? Math.round((completed / msItems.length) * 100) : 0;
      milestoneProgress.push({
        id: milestone._id,
        name: milestone.name,
        color: milestone.color,
        totalTasks: msItems.length,
        completedTasks: completed,
        progress
      });
    }

    // 5. Team Workload (resolve email to user names — workspace members first, then all users as fallback)
    const User = require('../models/User');
    const members = await WorkspaceMember.find({ workspaceId }).populate('userId', 'name email');
    const emailToName = {};
    members.forEach(m => {
      if (m.userId) {
        emailToName[m.userId.email.toLowerCase()] = m.userId.name;
      }
    });

    // Fallback: fetch all users whose emails appear in item assignees but weren't resolved yet
    const assigneeEmails = [...new Set(items.map(i => (i.assignee || '').toLowerCase()).filter(e => e && e !== 'unassigned'))];
    const unresolved = assigneeEmails.filter(e => !emailToName[e]);
    if (unresolved.length > 0) {
      const fallbackUsers = await User.find({ email: { $in: unresolved } }, 'name email');
      fallbackUsers.forEach(u => {
        if (u.email) emailToName[u.email.toLowerCase()] = u.name;
      });
    }

    const workload = {};
    items.forEach(item => {
      let assignee = item.assignee || 'Unassigned';
      let assigneeName = assignee;
      if (assignee !== 'Unassigned' && assignee !== '') {
        assigneeName = emailToName[assignee.toLowerCase()] || assignee;
      } else {
        assigneeName = 'Unassigned';
      }
      if (!workload[assigneeName]) {
        workload[assigneeName] = 0;
      }
      workload[assigneeName]++;
    });

    // Convert workload to list
    const teamWorkload = Object.keys(workload).map(name => ({
      name,
      tasksCount: workload[name]
    })).sort((a, b) => b.tasksCount - a.tasksCount);

    // 6. Task Completion Trend (last 7 days)
    const completionTrend = [];
    const now = new Date();
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(now.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      
      // Count items updated on this date that are currently in Done
      const count = items.filter(item => {
        const isDone = doneColsMap[item.board.toString()]?.includes(item.columnId) || false;
        if (!isDone) return false;
        const updateStr = new Date(item.updatedAt).toISOString().split('T')[0];
        return updateStr === dateStr;
      }).length;

      completionTrend.push({
        date: dateStr,
        completedCount: count
      });
    }

    // 7. Overdue Tasks
    const overdueTasks = items.filter(item => {
      const isDone = doneColsMap[item.board.toString()]?.includes(item.columnId) || false;
      if (isDone) return false;
      return item.dueDate && new Date(item.dueDate) < new Date();
    }).map(item => ({
      id: item._id,
      title: item.title,
      dueDate: item.dueDate,
      assignee: item.assignee
    }));

    res.status(200).json({
      success: true,
      statusDistribution,
      typeDistribution,
      labelDistribution: labelCounts,
      milestoneProgress,
      teamWorkload,
      completionTrend,
      overdueTasksCount: overdueTasks.length,
      overdueTasks
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/**
 * @desc    Get label-specific workload details
 * @route   GET /api/analytics/labels
 * @access  Private
 */
const getLabelAnalytics = async (req, res) => {
  try {
    const workspaceId = req.query.workspaceId || req.body.workspaceId;
    if (!workspaceId) {
      return res.status(400).json({ message: 'Workspace ID is required' });
    }

    const labels = await Label.find({ workspace_id: workspaceId });
    const labelStats = [];

    for (const label of labels) {
      const taskLabels = await TaskLabel.find({ label_id: label._id });
      const taskIds = taskLabels.map(tl => tl.task_id);
      const items = await Item.find({ _id: { $in: taskIds }, archived: { $ne: true } });
      labelStats.push({
        id: label._id,
        name: label.name,
        color: label.color,
        tasksCount: items.length,
      });
    }

    res.status(200).json({ success: true, labelStats });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/**
 * @desc    Get compact workspace overview stats for the dashboard header cards
 * @route   GET /api/analytics/overview
 * @access  Private
 */
const getWorkspaceOverview = async (req, res) => {
  try {
    const workspaceId = req.query.workspaceId;
    if (!workspaceId) {
      return res.status(400).json({ message: 'Workspace ID is required' });
    }

    const timeframe = req.query.timeframe; // 'day' | 'week' | 'month' | 'year'
    let startDate = null;
    const now = new Date();

    if (timeframe === 'day') {
      startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    } else if (timeframe === 'week') {
      const day = now.getDay();
      startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - day);
    } else if (timeframe === 'month') {
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
    } else if (timeframe === 'year') {
      startDate = new Date(now.getFullYear(), 0, 1);
    }

    // Boards
    const boards = await Board.find({ workspace: workspaceId });
    const boardIds = boards.map(b => b._id);
    let totalBoards = boards.length;
    if (startDate) {
      totalBoards = boards.filter(b => b.createdAt >= startDate).length;
    }

    // Build column → status map
    const colIdToStatus = {};
    const doneColIds = new Set();
    boards.forEach(b => {
      b.columns.forEach(col => {
        const cat = classifyColumn(col);
        colIdToStatus[col.id] = cat;
        if (cat === 'Done') doneColIds.add(col.id);
      });
    });

    // Items
    const itemQuery = { board: { $in: boardIds }, archived: { $ne: true } };
    if (startDate) {
      itemQuery.createdAt = { $gte: startDate };
    }
    const items = await Item.find(itemQuery);
    const totalTasks = items.length;
    const completedTasks = items.filter(i => doneColIds.has(i.columnId)).length;
    const workspaceProgress = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

    // Milestones
    const milestoneQuery = {
      workspace_id: workspaceId,
      status: { $in: ['Active', 'Planned'] }
    };
    if (startDate) {
      milestoneQuery.createdAt = { $gte: startDate };
    }
    const activeMilestones = await Milestone.countDocuments(milestoneQuery);

    // Labels
    const labelQuery = { workspace_id: workspaceId };
    if (startDate) {
      labelQuery.createdAt = { $gte: startDate };
    }
    const totalLabels = await Label.countDocuments(labelQuery);

    // Members
    const memberQuery = { workspaceId };
    if (startDate) {
      memberQuery.createdAt = { $gte: startDate };
    }
    const totalMembers = await WorkspaceMember.countDocuments(memberQuery);

    // Recent activity (last 7 days, or matching timeframe since if set)
    const ActivityLog = require('../models/ActivityLog');
    const since = startDate || new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const recentActivityCount = await ActivityLog.countDocuments({
      workspaceId,
      createdAt: { $gte: since }
    });

    res.status(200).json({
      success: true,
      totalBoards,
      totalTasks,
      completedTasks,
      workspaceProgress,
      activeMilestones,
      totalLabels,
      totalMembers,
      recentActivityCount,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  getDashboardAnalytics,
  getLabelAnalytics,
  getWorkspaceOverview,
};

