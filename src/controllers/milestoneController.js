const Milestone = require('../models/Milestone');
const Board = require('../models/Board');
const Item = require('../models/Item');
const ActivityService = require('../services/ActivityService');
const NotificationService = require('../services/NotificationService');

// Helper to calculate progress stats
const getMilestoneProgress = async (milestone) => {
  const boards = await Board.find({ workspace: milestone.workspace_id });
  const doneColsByBoard = {};
  boards.forEach(b => {
    doneColsByBoard[b._id.toString()] = new Set(
      b.columns.filter(c => c.isDone).map(c => c.id)
    );
  });

  const items = await Item.find({ milestone_id: milestone._id, archived: { $ne: true } });
  let total = items.length;
  let completed = 0;
  let open = 0;
  let overdue = 0;

  items.forEach(item => {
    const isDone = doneColsByBoard[item.board.toString()]?.has(item.columnId) || false;
    if (isDone) {
      completed++;
    } else {
      open++;
      if (item.dueDate && new Date(item.dueDate) < new Date()) {
        overdue++;
      }
    }
  });

  const progress = total > 0 ? Math.round((completed / total) * 100) : 0;
  return { total, completed, open, overdue, progress };
};

/**
 * @desc    Get all milestones for a workspace
 * @route   GET /api/milestones
 * @access  Private
 */
const listMilestones = async (req, res) => {
  try {
    const workspaceId = req.query.workspaceId || req.body.workspaceId;
    if (!workspaceId) {
      return res.status(400).json({ message: 'Workspace ID is required' });
    }

    const milestones = await Milestone.find({ workspace_id: workspaceId }).sort({ due_date: 1, createdAt: -1 });
    
    // Enrich milestones with progress stats
    const enrichedMilestones = [];
    for (const milestone of milestones) {
      const stats = await getMilestoneProgress(milestone);
      enrichedMilestones.push({
        ...milestone.toObject(),
        stats
      });
    }

    res.status(200).json({ success: true, milestones: enrichedMilestones });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/**
 * @desc    Get single milestone details
 * @route   GET /api/milestones/:id
 * @access  Private
 */
const getMilestone = async (req, res) => {
  try {
    const milestone = await Milestone.findById(req.params.id);
    if (!milestone) {
      return res.status(404).json({ message: 'Milestone not found' });
    }

    const stats = await getMilestoneProgress(milestone);
    res.status(200).json({ success: true, milestone: { ...milestone.toObject(), stats } });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/**
 * @desc    Create a new milestone
 * @route   POST /api/milestones
 * @access  Private
 */
const createMilestone = async (req, res) => {
  try {
    const { workspaceId, name, description, color, start_date, due_date, status } = req.body;
    if (!workspaceId || !name) {
      return res.status(400).json({ message: 'Workspace ID and name are required' });
    }

    const milestone = await Milestone.create({
      workspace_id: workspaceId,
      name,
      description: description || '',
      color: color || '#3b82f6',
      start_date: start_date || null,
      due_date: due_date || null,
      status: status || 'Planned',
      created_by: req.user._id
    });

    await ActivityService.log({
      actorId: req.user._id,
      workspaceId,
      actionType: 'TASK_UPDATED', // Fallback or add custom milestone creation log
      newValue: `Milestone "${name}" created`,
      metadata: { milestoneId: milestone._id, milestoneName: name }
    });

    // Trigger Notification
    NotificationService.triggerEvent('MILESTONE_CREATED', {
      milestone,
      actor: req.user,
      workspaceId
    }).catch(err => console.error('Error triggering MILESTONE_CREATED notification:', err.message));

    res.status(201).json({ success: true, milestone });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

/**
 * @desc    Update milestone
 * @route   PUT /api/milestones/:id
 * @access  Private
 */
const updateMilestone = async (req, res) => {
  try {
    const milestone = await Milestone.findById(req.params.id);
    if (!milestone) {
      return res.status(404).json({ message: 'Milestone not found' });
    }

    const oldStatus = milestone.status;
    const fields = ['name', 'description', 'color', 'start_date', 'due_date', 'status'];
    
    fields.forEach(field => {
      if (req.body[field] !== undefined) {
        milestone[field] = req.body[field];
      }
    });

    await milestone.save();

    // Trigger Notifications based on state transitions
    if (milestone.status === 'Completed' && oldStatus !== 'Completed') {
      NotificationService.triggerEvent('MILESTONE_COMPLETED', {
        milestone,
        actor: req.user,
        workspaceId: milestone.workspace_id
      }).catch(err => console.error('Error triggering MILESTONE_COMPLETED notification:', err.message));
    } else {
      NotificationService.triggerEvent('MILESTONE_UPDATED', {
        milestone,
        actor: req.user,
        workspaceId: milestone.workspace_id
      }).catch(err => console.error('Error triggering MILESTONE_UPDATED notification:', err.message));
    }

    res.status(200).json({ success: true, milestone });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

/**
 * @desc    Delete milestone
 * @route   DELETE /api/milestones/:id
 * @access  Private
 */
const deleteMilestone = async (req, res) => {
  try {
    const milestone = await Milestone.findById(req.params.id);
    if (!milestone) {
      return res.status(404).json({ message: 'Milestone not found' });
    }

    const workspaceId = milestone.workspace_id;

    // Reset task references
    await Item.updateMany({ milestone_id: milestone._id }, { milestone_id: null });
    await milestone.deleteOne();

    res.status(200).json({ success: true, message: 'Milestone deleted successfully' });
  } catch (error) {
    res.status(550).json({ message: error.message });
  }
};

/**
 * @desc    Get Milestone Tasks and Analytics
 * @route   GET /api/milestones/:id/analytics
 * @access  Private
 */
const getMilestoneAnalytics = async (req, res) => {
  try {
    const milestone = await Milestone.findById(req.params.id);
    if (!milestone) {
      return res.status(404).json({ message: 'Milestone not found' });
    }

    const boards = await Board.find({ workspace: milestone.workspace_id });
    const doneColsByBoard = {};
    const boardNames = {};
    boards.forEach(b => {
      boardNames[b._id.toString()] = b.name;
      doneColsByBoard[b._id.toString()] = new Set(
        b.columns.filter(c => c.isDone).map(c => c.id)
      );
    });

    const items = await Item.find({ milestone_id: milestone._id, archived: { $ne: true } });
    
    const tasks = items.map(item => {
      const isDone = doneColsByBoard[item.board.toString()]?.has(item.columnId) || false;
      return {
        ...item.toObject(),
        status: isDone ? 'Done' : 'Open',
        boardName: boardNames[item.board.toString()] || 'Unknown Board'
      };
    });

    // Team Workload calculation for this milestone
    const workload = {};
    tasks.forEach(task => {
      const assignee = task.assignee || 'Unassigned';
      if (!workload[assignee]) {
        workload[assignee] = { total: 0, completed: 0, open: 0 };
      }
      workload[assignee].total++;
      if (task.status === 'Done') {
        workload[assignee].completed++;
      } else {
        workload[assignee].open++;
      }
    });

    const stats = await getMilestoneProgress(milestone);

    res.status(200).json({
      success: true,
      milestone: milestone.name,
      stats,
      tasks,
      workload
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  listMilestones,
  getMilestone,
  createMilestone,
  updateMilestone,
  deleteMilestone,
  getMilestoneAnalytics
};
