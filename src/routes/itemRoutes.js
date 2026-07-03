const express = require('express');
const router = express.Router();
const { updateItem, deleteItem, getItemById, getWorkspaceItems } = require('../controllers/itemController');
const { protect } = require('../middlewares/auth');
const { requireItemPermission, requireWorkspaceMember } = require('../middlewares/rbac');

router.get('/', protect, requireWorkspaceMember, getWorkspaceItems);
router.get('/:id', protect, requireItemPermission('task:view'), getItemById);
router.put('/:id', protect, requireItemPermission('task:update'), updateItem);
router.delete('/:id', protect, requireItemPermission('task:delete'), deleteItem);

module.exports = router;
