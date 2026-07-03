const express = require('express');
const router = express.Router();
const {
  listLabels,
  createLabel,
  updateLabel,
  deleteLabel
} = require('../controllers/labelController');
const { protect } = require('../middlewares/auth');
const { requireWorkspaceMember } = require('../middlewares/rbac');

router.get('/', protect, requireWorkspaceMember, listLabels);
router.post('/', protect, requireWorkspaceMember, createLabel);
router.put('/:id', protect, updateLabel);
router.delete('/:id', protect, deleteLabel);

module.exports = router;
