const express = require('express');
const router = express.Router();
const { getBoards, createBoard, updateBoard, deleteBoard, getBoardById } = require('../controllers/boardController');
const { getItems, createItem } = require('../controllers/itemController');
const { protect } = require('../middlewares/auth');
const {
  requireWorkspaceMember,
  requirePermission,
  requireBoardPermission
} = require('../middlewares/rbac');

// Board routes
router.get('/', protect, requireWorkspaceMember, getBoards);
router.post('/', protect, requireWorkspaceMember, requirePermission('board:create'), createBoard);
router.get('/:id', protect, requireBoardPermission('board:view'), getBoardById);
router.put('/:id', protect, requireBoardPermission('board:update'), updateBoard);
router.delete('/:id', protect, requireBoardPermission('board:delete'), deleteBoard);

// Nested Item routes (for specific board context)
router.get('/:boardId/items', protect, requireBoardPermission('task:view'), getItems);
router.post('/:boardId/items', protect, requireBoardPermission('task:create'), createItem);

module.exports = router;
