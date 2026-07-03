const Announcement = require('../models/Announcement');
const NotificationService = require('../services/NotificationService');

/**
 * @desc    Create a new workspace announcement
 * @route   POST /api/announcements
 * @access  Private
 */
const createAnnouncement = async (req, res) => {
  try {
    const { title, message, workspaceId } = req.body;

    if (!title || !message || !workspaceId) {
      return res.status(400).json({ message: 'Title, message, and workspaceId are required' });
    }

    const announcement = await Announcement.create({
      workspaceId,
      title,
      message,
      createdBy: req.user._id
    });

    // Trigger Notification Service
    await NotificationService.triggerEvent('TEAM_ANNOUNCEMENT_CREATED', {
      announcement,
      author: req.user,
      workspaceId
    });

    res.status(201).json({ success: true, announcement });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  createAnnouncement
};
