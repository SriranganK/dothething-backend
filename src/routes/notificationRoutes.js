const express = require('express');
const router = express.Router();
const {
  getNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
  deleteNotification,
  getPreferences,
  updatePreferences
} = require('../controllers/notificationController');
const { protect } = require('../middlewares/auth');

router.use(protect); // All notification routes require authentication

router.get('/', getNotifications);
router.get('/unread-count', getUnreadCount);
router.patch('/read-all', markAllAsRead);
router.patch('/:id/read', markAsRead);
router.delete('/:id', deleteNotification);

// User preferences
router.get('/preferences', getPreferences);
router.put('/preferences', updatePreferences);

module.exports = router;
