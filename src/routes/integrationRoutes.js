const express = require('express');
const router = express.Router();
const {
  getIntegrations,
  authorizePlatform,
  handleCallback,
  simulateAuthorize,
  disconnectPlatform,
  toggleIntegration,
  getRepos,
  linkRepos,
  linkItemRepo,
  createItemBranch,
} = require('../controllers/integrationController');
const { getItemDevelopment } = require('../controllers/developmentController');
const { protect } = require('../middlewares/auth');
const { requireWorkspaceMember, requirePermission } = require('../middlewares/rbac');

// Callback is public since GitHub/GitLab redirect to it without Auth headers
router.get('/callback/:platform', handleCallback);

// Item development status lookup
router.get('/item/:itemId', protect, getItemDevelopment);

// Manual link repo and create branch for item
router.post('/item/:itemId/link-repo', protect, linkItemRepo);
router.post('/item/:itemId/create-branch', protect, createItemBranch);

// Workspace specific integration settings
router.get('/:workspaceId', protect, requireWorkspaceMember, getIntegrations);

router.get(
  '/:workspaceId/:platform/authorize',
  protect,
  requireWorkspaceMember,
  requirePermission('workspace:settings'),
  authorizePlatform
);

router.post(
  '/:workspaceId/:platform/simulate',
  protect,
  requireWorkspaceMember,
  requirePermission('workspace:settings'),
  simulateAuthorize
);

router.post(
  '/:workspaceId/:platform/disconnect',
  protect,
  requireWorkspaceMember,
  requirePermission('workspace:settings'),
  disconnectPlatform
);

router.post(
  '/:workspaceId/:platform/toggle',
  protect,
  requireWorkspaceMember,
  requirePermission('workspace:settings'),
  toggleIntegration
);

router.get(
  '/:workspaceId/:platform/repos',
  protect,
  requireWorkspaceMember,
  getRepos
);

router.post(
  '/:workspaceId/:platform/repos/link',
  protect,
  requireWorkspaceMember,
  requirePermission('workspace:settings'),
  linkRepos
);

module.exports = router;
