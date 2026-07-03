/**
 * RBAC Middleware
 * Express middleware functions that enforce role-based permissions on routes.
 */
const { getWorkspaceRole, canAccessBoard } = require('../services/authorizationService');
const { hasPermission } = require('../constants/permissions');
const Board = require('../models/Board');
const Item = require('../models/Item');

/**
 * Middleware: Require workspace membership and attach role to req.
 * Expects workspaceId from req.query, req.body, or req.params.
 */
const requireWorkspaceMember = async (req, res, next) => {
  try {
    const workspaceId = req.query?.workspaceId || req.body?.workspaceId || req.params?.workspaceId;
    if (!workspaceId) {
      return res.status(400).json({ message: 'Workspace ID is required' });
    }


    const role = await getWorkspaceRole(req.user._id, workspaceId);
    if (!role) {
      return res.status(403).json({ message: 'Access denied. You are not a member of this workspace.' });
    }

    // Attach role and workspaceId to request for downstream use
    req.workspaceRole = role;
    req.workspaceId = workspaceId;
    next();
  } catch (error) {
    console.error('RBAC middleware error:', error.message);
    return res.status(500).json({ message: 'Authorization check failed' });
  }
};

/**
 * Middleware factory: Require a specific permission within a workspace.
 * Must be used AFTER requireWorkspaceMember (which sets req.workspaceRole).
 *
 * Usage: router.post('/', protect, requireWorkspaceMember, requirePermission('board:create'), createBoard);
 */
const requirePermission = (permission) => {
  return (req, res, next) => {
    const role = req.workspaceRole;
    if (!role) {
      return res.status(403).json({ message: 'Access denied. No role assigned.' });
    }

    if (!hasPermission(role, permission)) {
      return res.status(403).json({
        message: `Access denied. Your role (${role}) does not have the '${permission}' permission.`,
      });
    }

    next();
  };
};

/**
 * Middleware: Require board access (handles visibility logic).
 * Expects board ID from req.params.id or req.params.boardId.
 */
const requireBoardAccess = async (req, res, next) => {
  try {
    const boardId = req.params.id || req.params.boardId;
    if (!boardId) {
      return res.status(400).json({ message: 'Board ID is required' });
    }

    const result = await canAccessBoard(req.user._id, boardId);
    if (!result.allowed) {
      return res.status(403).json({ message: result.reason || 'Access denied to this board.' });
    }

    // Attach to request for downstream use
    req.boardRole = result.role;
    req.board = result.board;
    req.workspaceRole = result.role;
    next();
  } catch (error) {
    console.error('Board access middleware error:', error.message);
    return res.status(500).json({ message: 'Authorization check failed' });
  }
};

/**
 * Middleware factory: Require a permission with board-level access check.
 * Combines board access check + permission check in one.
 *
 * Usage: router.put('/:id', protect, requireBoardPermission('board:update'), updateBoard);
 */
const requireBoardPermission = (permission) => {
  return async (req, res, next) => {
    try {
      const boardId = req.params.id || req.params.boardId;
      if (!boardId) {
        return res.status(400).json({ message: 'Board ID is required' });
      }

      const result = await canAccessBoard(req.user._id, boardId);
      if (!result.allowed) {
        return res.status(403).json({ message: result.reason || 'Access denied to this board.' });
      }

      if (!hasPermission(result.role, permission)) {
        return res.status(403).json({
          message: `Access denied. Your role (${result.role}) does not have the '${permission}' permission.`,
        });
      }

      req.boardRole = result.role;
      req.board = result.board;
      req.workspaceRole = result.role;
      next();
    } catch (error) {
      console.error('Board permission middleware error:', error.message);
      return res.status(500).json({ message: 'Authorization check failed' });
    }
  };
};

/**
 * Middleware factory: Require a permission with item-level access check.
 * Checks item existance -> board access -> role permission.
 *
 * Usage: router.put('/:id', protect, requireItemPermission('task:update'), updateItem);
 */
const requireItemPermission = (permission) => {
  return async (req, res, next) => {
    try {
      const itemId = req.params.id;
      if (!itemId) {
        return res.status(400).json({ message: 'Item ID is required' });
      }

      const mongoose = require('mongoose');
      let item;
      if (mongoose.Types.ObjectId.isValid(itemId)) {
        item = await Item.findById(itemId);
      } else {
        const parts = itemId.split('-');
        if (parts.length === 2) {
          const type = parts[0];
          const suffix = parts[1].toLowerCase();
          item = await Item.findOne({
            type: { $regex: new RegExp(`^${type}$`, 'i') },
            $expr: {
              $regexMatch: {
                input: { $toString: "$_id" },
                regex: suffix + "$",
                options: "i"
              }
            }
          });
        }
      }

      if (!item) {
        return res.status(404).json({ message: 'Item not found' });
      }

      req.params.id = item._id.toString();

      const result = await canAccessBoard(req.user._id, item.board);
      if (!result.allowed) {
        return res.status(403).json({ message: result.reason || 'Access denied to this board.' });
      }

      if (!hasPermission(result.role, permission)) {
        return res.status(403).json({
          message: `Access denied. Your role (${result.role}) does not have the '${permission}' permission.`,
        });
      }

      req.item = item;
      req.boardRole = result.role;
      req.board = result.board;
      req.workspaceRole = result.role;
      next();
    } catch (error) {
      console.error('Item permission middleware error:', error.message);
      return res.status(500).json({ message: 'Authorization check failed' });
    }
  };
};

module.exports = {
  requireWorkspaceMember,
  requirePermission,
  requireBoardAccess,
  requireBoardPermission,
  requireItemPermission,
};

