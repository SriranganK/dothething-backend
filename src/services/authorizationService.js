/**
 * Authorization Service
 * Central service for all permission checks in the application.
 */
const WorkspaceMember = require('../models/WorkspaceMember');
const BoardMember = require('../models/BoardMember');
const Board = require('../models/Board');
const Visibility = require('../constants/visibility');
const { hasPermission } = require('../constants/permissions');

/**
 * Get a user's role in a workspace
 * @param {string} userId
 * @param {string} workspaceId
 * @returns {Promise<string|null>} role or null if not a member
 */
const getWorkspaceRole = async (userId, workspaceId) => {
  const member = await WorkspaceMember.findOne({ userId, workspaceId });
  return member ? member.role : null;
};

/**
 * Check if user belongs to a workspace
 */
const isWorkspaceMember = async (userId, workspaceId) => {
  const member = await WorkspaceMember.findOne({ userId, workspaceId });
  return !!member;
};

/**
 * Check if user can access a specific board.
 * Implements the full access flow:
 *   1. Verify workspace membership
 *   2. If WORKSPACE visibility → allow based on workspace role
 *   3. If PRIVATE visibility → check BoardMember exists
 */
const canAccessBoard = async (userId, boardId) => {
  const board = await Board.findById(boardId);
  if (!board) return { allowed: false, reason: 'Board not found' };

  // Step 1: Must be workspace member
  const role = await getWorkspaceRole(userId, board.workspace);
  if (!role) return { allowed: false, reason: 'Not a workspace member' };

  // Step 2: WORKSPACE visibility — everyone in the workspace can access
  if (board.visibility === Visibility.WORKSPACE) {
    return { allowed: true, role, board };
  }

  // Step 3: PRIVATE visibility — must be explicitly added as BoardMember
  const boardMember = await BoardMember.findOne({ boardId, userId });
  if (!boardMember) {
    return { allowed: false, reason: 'Not a member of this private board' };
  }

  // Use the board-level role if set, otherwise fall back to workspace role
  const effectiveRole = boardMember.role || role;
  return { allowed: true, role: effectiveRole, board };
};

/**
 * Permission check helpers
 */
const canViewBoard = async (userId, board) => {
  const result = await canAccessBoard(userId, board._id || board);
  if (!result.allowed) return false;
  return hasPermission(result.role, 'board:view');
};

const canCreateBoard = async (userId, workspaceId) => {
  const role = await getWorkspaceRole(userId, workspaceId);
  if (!role) return false;
  return hasPermission(role, 'board:create');
};

const canUpdateBoard = async (userId, boardId) => {
  const result = await canAccessBoard(userId, boardId);
  if (!result.allowed) return false;
  return hasPermission(result.role, 'board:update');
};

const canDeleteBoard = async (userId, boardId) => {
  const result = await canAccessBoard(userId, boardId);
  if (!result.allowed) return false;
  return hasPermission(result.role, 'board:delete');
};

const canManageMembers = async (userId, workspaceId) => {
  const role = await getWorkspaceRole(userId, workspaceId);
  if (!role) return false;
  return hasPermission(role, 'members:manage');
};

const canCreateTask = async (userId, boardId) => {
  const result = await canAccessBoard(userId, boardId);
  if (!result.allowed) return false;
  return hasPermission(result.role, 'task:create');
};

const canUpdateTask = async (userId, boardId) => {
  const result = await canAccessBoard(userId, boardId);
  if (!result.allowed) return false;
  return hasPermission(result.role, 'task:update');
};

const canDeleteTask = async (userId, boardId) => {
  const result = await canAccessBoard(userId, boardId);
  if (!result.allowed) return false;
  return hasPermission(result.role, 'task:delete');
};


/**
 * Check if user can access a specific Scratch Page.
 * @param {string} userId
 * @param {string} pageId
 * @param {string} requiredAction - 'view' | 'edit' | 'comment' | 'manage' | 'delete'
 * @returns {Promise<{allowed: boolean, reason?: string, role?: string, page?: object}>}
 */
const canAccessScratchPage = async (userId, pageId, requiredAction = 'view') => {
  const ScratchPage = require('../models/ScratchPage');
  const page = await ScratchPage.findById(pageId);
  if (!page) return { allowed: false, reason: 'Scratch page not found' };

  // Step 1: Must be a workspace member
  const workspaceRole = await getWorkspaceRole(userId, page.workspace);
  if (!workspaceRole) return { allowed: false, reason: 'Not a member of this workspace' };

  // Step 2: Page Owner or Workspace OWNER/ADMIN has full access
  const isOwner = page.createdBy.toString() === userId.toString();
  const isWorkspaceAdmin = workspaceRole === 'OWNER' || workspaceRole === 'ADMIN';

  if (isOwner || isWorkspaceAdmin) {
    return { allowed: true, role: 'owner', page };
  }

  // Step 3: Check explicit collaborator entry
  const collab = page.collaborators.find((c) => c.user.toString() === userId.toString());
  if (collab) {
    const role = collab.role; // 'editor', 'commenter', 'viewer'

    if (requiredAction === 'view') {
      return { allowed: true, role, page };
    }
    if (requiredAction === 'comment' && (role === 'editor' || role === 'commenter')) {
      return { allowed: true, role, page };
    }
    if (requiredAction === 'edit' && role === 'editor') {
      return { allowed: true, role, page };
    }
    if ((requiredAction === 'manage' || requiredAction === 'delete') && role === 'editor') {
      return { allowed: true, role, page };
    }

    return {
      allowed: false,
      reason: `Access denied. Your role (${role}) cannot perform '${requiredAction}' action.`,
    };
  }

  // Step 4: Check Page Visibility ('workspace' or 'public')
  if (page.visibility === 'workspace') {
    const role = workspaceRole === 'GUEST' ? 'viewer' : 'editor';
    if (requiredAction === 'view') {
      return { allowed: true, role, page };
    }
    if (requiredAction === 'comment') {
      return { allowed: true, role, page };
    }
    if (requiredAction === 'edit' && role === 'editor') {
      return { allowed: true, role, page };
    }
    if (requiredAction === 'manage' || requiredAction === 'delete') {
      return { allowed: false, reason: 'Only page owner or workspace admins can manage/delete page' };
    }
    return { allowed: true, role, page };
  }

  if (page.visibility === 'public' && requiredAction === 'view') {
    return { allowed: true, role: 'viewer', page };
  }

  return { allowed: false, reason: 'Access denied to this private scratch page' };
};

module.exports = {
  canAccessScratchPage,
  getWorkspaceRole,
  isWorkspaceMember,
  canAccessBoard,
  canViewBoard,
  canCreateBoard,
  canUpdateBoard,
  canDeleteBoard,
  canManageMembers,
  canCreateTask,
  canUpdateTask,
  canDeleteTask,
};
