const express = require('express');
const router = express.Router();
const {
  getDashboardAnalytics,
  getLabelAnalytics,
  getWorkspaceOverview,
} = require('../controllers/analyticsController');
const { protect } = require('../middlewares/auth');
const { requireWorkspaceMember } = require('../middlewares/rbac');

router.get('/dashboard', protect, requireWorkspaceMember, getDashboardAnalytics);
router.get('/labels', protect, requireWorkspaceMember, getLabelAnalytics);
router.get('/overview', protect, requireWorkspaceMember, getWorkspaceOverview);

module.exports = router;
