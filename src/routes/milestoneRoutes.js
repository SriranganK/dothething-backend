const express = require('express');
const router = express.Router();
const {
  listMilestones,
  getMilestone,
  createMilestone,
  updateMilestone,
  deleteMilestone,
  getMilestoneAnalytics
} = require('../controllers/milestoneController');
const { protect } = require('../middlewares/auth');
const { requireWorkspaceMember } = require('../middlewares/rbac');

router.get('/', protect, requireWorkspaceMember, listMilestones);
router.post('/', protect, requireWorkspaceMember, createMilestone);
router.get('/:id', protect, getMilestone);
router.put('/:id', protect, updateMilestone);
router.delete('/:id', protect, deleteMilestone);
router.get('/:id/analytics', protect, getMilestoneAnalytics);

module.exports = router;
