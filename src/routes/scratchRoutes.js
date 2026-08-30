const express = require('express');
const router = express.Router();
const { protect } = require('../middlewares/auth');
const {
  requireWorkspaceMember,
  requireScratchPagePermission,
  requireScratchBlockPermission,
  requireScratchCommentPermission,
} = require('../middlewares/rbac');
const {
  getPages,
  getPageById,
  createPage,
  updatePage,
  deletePage,
  duplicatePage,
  getBlocks,
  createBlock,
  createBlocksBatch,
  updateBlock,
  deleteBlock,
  deleteBlocksBatch,
  reorderBlocks,
  getComments,
  createComment,
  replyComment,
  resolveComment,
  deleteComment,
  createShareToken,
  getShareTokens,
  deleteShareToken,
  getPublicPageByToken,
  updatePublicBlockByToken,
  addCollaborator,
  getCollaborators,
  updateCollaboratorRole,
  removeCollaborator,
} = require('../controllers/scratchController');

// Unprotected Public Routes (Accessed via embedded share token with expiry)
router.get('/public/pages/:token', getPublicPageByToken);
router.patch('/public/tokens/:token/blocks/:blockId', updatePublicBlockByToken);

// Protected Routes
router.use(protect);

// Page routes
router.get('/pages', requireWorkspaceMember, getPages);
router.post('/pages', requireWorkspaceMember, createPage);
router.get('/pages/:id', requireScratchPagePermission('view'), getPageById);
router.patch('/pages/:id', requireScratchPagePermission('edit'), updatePage);
router.delete('/pages/:id', requireScratchPagePermission('delete'), deletePage);
router.post('/pages/:id/duplicate', requireScratchPagePermission('view'), duplicatePage);

// Collaborator routes
router.get('/pages/:id/collaborators', requireScratchPagePermission('view'), getCollaborators);
router.post('/pages/:id/collaborators', requireScratchPagePermission('manage'), addCollaborator);
router.patch('/pages/:id/collaborators/:userId', requireScratchPagePermission('manage'), updateCollaboratorRole);
router.delete('/pages/:id/collaborators/:userId', requireScratchPagePermission('manage'), removeCollaborator);

// Block routes
router.get('/pages/:pageId/blocks', requireScratchPagePermission('view'), getBlocks);
router.post('/pages/:pageId/blocks', requireScratchPagePermission('edit'), createBlock);
router.post('/pages/:pageId/blocks/batch', requireScratchPagePermission('edit'), createBlocksBatch);
router.post('/pages/:pageId/blocks/batch-delete', requireScratchPagePermission('edit'), deleteBlocksBatch);
router.patch('/blocks/:blockId', requireScratchBlockPermission('edit'), updateBlock);
router.delete('/blocks/:blockId', requireScratchBlockPermission('edit'), deleteBlock);
router.post('/pages/:pageId/blocks/reorder', requireScratchPagePermission('edit'), reorderBlocks);

// Comment routes
router.get('/pages/:pageId/comments', requireScratchPagePermission('view'), getComments);
router.post('/pages/:pageId/comments', requireScratchPagePermission('comment'), createComment);
router.post('/comments/:commentId/reply', requireScratchCommentPermission('comment'), replyComment);
router.patch('/comments/:commentId/resolve', requireScratchCommentPermission('comment'), resolveComment);
router.delete('/comments/:commentId', requireScratchCommentPermission('delete'), deleteComment);

// Share Token routes
router.get('/pages/:pageId/share-tokens', requireScratchPagePermission('manage'), getShareTokens);
router.post('/pages/:pageId/share-tokens', requireScratchPagePermission('manage'), createShareToken);
router.delete('/share-tokens/:tokenId', protect, deleteShareToken);

module.exports = router;
