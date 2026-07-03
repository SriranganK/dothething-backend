const Notification = require('../models/Notification');
const NotificationPreference = require('../models/NotificationPreference');

/**
 * @desc    Get paginated notifications for current user
 * @route   GET /api/notifications
 * @access  Private
 */
const getNotifications = async (req, res) => {
  try {
    const page = parseInt(req.query.page || '1', 10);
    const limit = parseInt(req.query.limit || '15', 10);
    
    const count = await Notification.countDocuments({ userId: req.user._id });
    
    const notifications = await Notification.find({ userId: req.user._id })
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit);

    res.status(200).json({
      success: true,
      count,
      page,
      totalPages: Math.ceil(count / limit),
      notifications
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/**
 * @desc    Get unread notification count
 * @route   GET /api/notifications/unread-count
 * @access  Private
 */
const getUnreadCount = async (req, res) => {
  try {
    const count = await Notification.countDocuments({
      userId: req.user._id,
      isRead: false
    });
    res.status(200).json({ success: true, count });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/**
 * @desc    Mark a single notification as read
 * @route   PATCH /api/notifications/:id/read
 * @access  Private
 */
const markAsRead = async (req, res) => {
  try {
    const notification = await Notification.findOne({
      _id: req.params.id,
      userId: req.user._id
    });

    if (!notification) {
      return res.status(404).json({ message: 'Notification not found' });
    }

    notification.isRead = true;
    notification.readAt = new Date();
    await notification.save();

    res.status(200).json({ success: true, notification });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/**
 * @desc    Mark all user notifications as read
 * @route   PATCH /api/notifications/read-all
 * @access  Private
 */
const markAllAsRead = async (req, res) => {
  try {
    await Notification.updateMany(
      { userId: req.user._id, isRead: false },
      { isRead: true, readAt: new Date() }
    );
    res.status(200).json({ success: true, message: 'All notifications marked as read' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/**
 * @desc    Delete a notification
 * @route   DELETE /api/notifications/:id
 * @access  Private
 */
const deleteNotification = async (req, res) => {
  try {
    const notification = await Notification.findOne({
      _id: req.params.id,
      userId: req.user._id
    });

    if (!notification) {
      return res.status(404).json({ message: 'Notification not found' });
    }

    await notification.deleteOne();
    res.status(200).json({ success: true, message: 'Notification deleted' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/**
 * @desc    Get user preferences
 * @route   GET /api/notifications/preferences
 * @access  Private
 */
const getPreferences = async (req, res) => {
  try {
    let preference = await NotificationPreference.findOne({ userId: req.user._id });
    if (!preference) {
      preference = await NotificationPreference.create({ userId: req.user._id });
    }
    res.status(200).json({ success: true, preference });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/**
 * @desc    Update user preferences
 * @route   PUT /api/notifications/preferences
 * @access  Private
 */
const updatePreferences = async (req, res) => {
  try {
    let preference = await NotificationPreference.findOne({ userId: req.user._id });
    if (!preference) {
      preference = new NotificationPreference({ userId: req.user._id });
    }

    const fields = [
      'emailMentions',
      'emailAssignments',
      'emailReminders',
      'emailAnnouncements',
      'pushEnabled',
      'soundEnabled'
    ];

    fields.forEach(field => {
      if (req.body[field] !== undefined) {
        preference[field] = req.body[field];
      }
    });

    await preference.save();
    res.status(200).json({ success: true, preference });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  getNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
  deleteNotification,
  getPreferences,
  updatePreferences
};
