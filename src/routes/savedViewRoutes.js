const express = require('express');
const router = express.Router();
const {
  listViews,
  createView,
  updateView,
  deleteView
} = require('../controllers/savedViewController');
const { protect } = require('../middlewares/auth');
const { requireWorkspaceMember } = require('../middlewares/rbac');

router.get('/', protect, requireWorkspaceMember, listViews);
router.post('/', protect, requireWorkspaceMember, createView);
router.put('/:id', protect, updateView);
router.delete('/:id', protect, deleteView);

module.exports = router;
