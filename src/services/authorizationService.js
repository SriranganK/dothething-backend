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

module.exports = {
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
