const express = require('express');
const router = express.Router();
const { protect } = require('../middlewares/auth');
const { requireWorkspaceMember } = require('../middlewares/rbac');
const {
  getPages,
  getPageById,
  createPage,
  updatePage,
  deletePage,
  duplicatePage,
  getBlocks,
  createBlock,
  updateBlock,
  deleteBlock,
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
} = require('../controllers/scratchController');

// Unprotected Public Routes (Accessed via embedded share token with expiry)
router.get('/public/pages/:token', getPublicPageByToken);
router.patch('/public/tokens/:token/blocks/:blockId', updatePublicBlockByToken);

// Protected Routes
router.use(protect);

// Page routes
router.get('/pages', requireWorkspaceMember, getPages);
router.post('/pages', requireWorkspaceMember, createPage);
router.get('/pages/:id', getPageById);
router.patch('/pages/:id', updatePage);
router.delete('/pages/:id', deletePage);
router.post('/pages/:id/duplicate', duplicatePage);

// Block routes
router.get('/pages/:pageId/blocks', getBlocks);
router.post('/pages/:pageId/blocks', createBlock);
router.patch('/blocks/:blockId', updateBlock);
router.delete('/blocks/:blockId', deleteBlock);
router.post('/pages/:pageId/blocks/reorder', reorderBlocks);

// Comment routes
router.get('/pages/:pageId/comments', getComments);
router.post('/pages/:pageId/comments', createComment);
router.post('/comments/:commentId/reply', replyComment);
router.patch('/comments/:commentId/resolve', resolveComment);
router.delete('/comments/:commentId', deleteComment);

// Share Token routes
router.get('/pages/:pageId/share-tokens', getShareTokens);
router.post('/pages/:pageId/share-tokens', createShareToken);
router.delete('/share-tokens/:tokenId', deleteShareToken);

module.exports = router;
