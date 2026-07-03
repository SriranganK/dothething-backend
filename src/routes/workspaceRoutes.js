const express = require('express');
const router = express.Router();
const {
  checkWorkspace,
  createWorkspace,
  getWorkspaces,
  getWorkspaceMembers,
  inviteWorkspaceMember,
  updateWorkspaceMemberRole,
  removeWorkspaceMember,
  cancelInvitation,
  updateWorkspace,
  deleteWorkspace
} = require('../controllers/workspaceController');
const { protect } = require('../middlewares/auth');
const { requireWorkspaceMember, requirePermission } = require('../middlewares/rbac');

router.get('/', protect, getWorkspaces);
router.get('/check', protect, checkWorkspace);
router.post('/', protect, createWorkspace);
router.put('/:workspaceId', protect, requireWorkspaceMember, requirePermission('workspace:settings'), updateWorkspace);
router.delete('/:workspaceId', protect, requireWorkspaceMember, requirePermission('workspace:delete'), deleteWorkspace);

// Workspace Member management
router.get('/:workspaceId/members', protect, requireWorkspaceMember, getWorkspaceMembers);
router.post('/:workspaceId/members/invite', protect, requireWorkspaceMember, requirePermission('members:invite'), inviteWorkspaceMember);
router.put('/:workspaceId/members/:memberId', protect, requireWorkspaceMember, requirePermission('members:manage'), updateWorkspaceMemberRole);
router.delete('/:workspaceId/members/:memberId', protect, requireWorkspaceMember, requirePermission('members:remove'), removeWorkspaceMember);
router.delete('/:workspaceId/invitations/:invitationId', protect, requireWorkspaceMember, requirePermission('members:invite'), cancelInvitation);

module.exports = router;

