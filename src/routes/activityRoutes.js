const express = require('express');
const router = express.Router();
const {
  getWorkspaceActivity,
  getTaskHistory,
  getUserContributions,
  getUserActivity
} = require('../controllers/activityController');
const { protect } = require('../middlewares/auth');

router.get('/workspace/:workspaceId', protect, getWorkspaceActivity);
router.get('/task/:taskId', protect, getTaskHistory);
router.get('/user/:userId/contributions', protect, getUserContributions);
router.get('/user/:userId', protect, getUserActivity);

module.exports = router;
