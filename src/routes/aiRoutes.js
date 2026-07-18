const express = require('express');
const router = express.Router();
const {
  generateBoard,
  generateColumns,
  suggestTaskMeta,
  breakTask,
  rewriteDescription,
  boardChat,
  workspaceChat,
  generateTask,
  uploadDocumentSession,
  addCommentToSession,
  answerSessionQuestion,
  confirmSession,
  cancelSession
} = require('../controllers/aiController');
const { protect } = require('../middlewares/auth');
const {
  requireWorkspaceMember,
  requirePermission,
  requireBoardPermission,
  requireItemPermission
} = require('../middlewares/rbac');

// 1. Board creation under workspace context
router.post('/workspace/:workspaceId/generate-board', protect, requireWorkspaceMember, requirePermission('board:create'), generateBoard);

// Workspace level chat assistant
router.post('/workspace/:workspaceId/chat', protect, requireWorkspaceMember, workspaceChat);

// 2. Column generation under board context
router.post('/board/:boardId/generate-columns', protect, requireBoardPermission('board:update'), generateColumns);

// 3. Task meta suggestions under board context
router.post('/board/:boardId/suggest-meta', protect, requireBoardPermission('task:create'), suggestTaskMeta);

// 4. Checklist break-down under item context
router.post('/item/:id/break-task', protect, requireItemPermission('task:update'), breakTask);

// 5. Description improvement under item context
router.post('/item/:id/rewrite-description', protect, requireItemPermission('task:update'), rewriteDescription);

// 6. Board chat context
router.post('/board/:boardId/chat', protect, requireBoardPermission('board:view'), boardChat);

// 7. Fleshed-out task generation from title + story under column/board context
router.post('/board/:boardId/column/:columnId/generate-task', protect, requireBoardPermission('task:create'), generateTask);

// 8. Stateful Document-to-Board interactive session routes
router.post('/board-session/upload', protect, uploadDocumentSession);
router.post('/board-session/:id/comment', protect, addCommentToSession);
router.post('/board-session/:id/answer', protect, answerSessionQuestion);
router.post('/board-session/:id/confirm', protect, confirmSession);
router.post('/board-session/:id/cancel', protect, cancelSession);

module.exports = router;
