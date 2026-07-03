const mongoose = require('mongoose');
const ActivityLog = require('../models/ActivityLog');

/**
 * @desc    Get paginated workspace activity
 * @route   GET /api/activity/workspace/:workspaceId
 * @access  Private
 */
const getWorkspaceActivity = async (req, res) => {
  try {
    const { workspaceId } = req.params;
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 20;
    const skip = (page - 1) * limit;

    const query = { workspaceId: new mongoose.Types.ObjectId(workspaceId) };

    const total = await ActivityLog.countDocuments(query);
    const activities = await ActivityLog.find(query)
      .populate('actorId', 'name email')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    res.status(200).json({
      success: true,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      activities
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/**
 * @desc    Get complete history for a specific task
 * @route   GET /api/activity/task/:taskId
 * @access  Private
 */
const getTaskHistory = async (req, res) => {
  try {
    const { taskId } = req.params;

    const activities = await ActivityLog.find({ taskId: new mongoose.Types.ObjectId(taskId) })
      .populate('actorId', 'name email')
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: activities.length,
      activities
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/**
 * @desc    Get user contribution counts grouped by day for the past 365 days
 * @route   GET /api/activity/user/:userId/contributions
 * @access  Private
 */
const getUserContributions = async (req, res) => {
  try {
    const { userId } = req.params;
    const oneYearAgo = new Date();
    oneYearAgo.setDate(oneYearAgo.getDate() - 365);

    const dailyActivity = await ActivityLog.aggregate([
      {
        $match: {
          actorId: new mongoose.Types.ObjectId(userId),
          createdAt: { $gte: oneYearAgo }
        }
      },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          count: { $sum: 1 }
        }
      },
      {
        $project: {
          _id: 0,
          date: '$_id',
          count: 1
        }
      },
      {
        $sort: { date: 1 }
      }
    ]);

    const totalContributions = dailyActivity.reduce((sum, item) => sum + item.count, 0);

    res.status(200).json({
      success: true,
      totalContributions,
      dailyActivity
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/**
 * @desc    Get recent activity for a user, optionally filtered by a specific day
 * @route   GET /api/activity/user/:userId
 * @access  Private
 */
const getUserActivity = async (req, res) => {
  try {
    const { userId } = req.params;
    const { date, page = 1, limit = 50 } = req.query;
    const skip = (parseInt(page, 10) - 1) * parseInt(limit, 10);

    const query = { actorId: new mongoose.Types.ObjectId(userId) };

    if (date) {
      // Input date format YYYY-MM-DD
      const startOfDay = new Date(date);
      startOfDay.setUTCHours(0, 0, 0, 0);

      const endOfDay = new Date(date);
      endOfDay.setUTCHours(23, 59, 59, 999);

      query.createdAt = { $gte: startOfDay, $lte: endOfDay };
    }

    const total = await ActivityLog.countDocuments(query);
    const activities = await ActivityLog.find(query)
      .populate('actorId', 'name email')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit, 10));

    res.status(200).json({
      success: true,
      total,
      page: parseInt(page, 10),
      limit: parseInt(limit, 10),
      totalPages: Math.ceil(total / parseInt(limit, 10)),
      activities
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  getWorkspaceActivity,
  getTaskHistory,
  getUserContributions,
  getUserActivity
};
