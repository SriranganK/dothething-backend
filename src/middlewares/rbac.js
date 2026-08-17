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


/**
 * Middleware factory: Require permission on a Scratch Page.
 * @param {string} requiredAction - 'view' | 'edit' | 'comment' | 'manage' | 'delete'
 */
const requireScratchPagePermission = (requiredAction = 'view') => {
  return async (req, res, next) => {
    try {
      const pageId = req.params.id || req.params.pageId;
      if (!pageId) {
        return res.status(400).json({ message: 'Scratch Page ID is required' });
      }

      const { canAccessScratchPage } = require('../services/authorizationService');
      const result = await canAccessScratchPage(req.user._id, pageId, requiredAction);

      if (!result.allowed) {
        return res.status(403).json({ message: result.reason || 'Access denied to scratch page.' });
      }

      req.page = result.page;
      req.pageRole = result.role;
      next();
    } catch (error) {
      console.error('Scratch page permission middleware error:', error.message);
      return res.status(500).json({ message: 'Authorization check failed' });
    }
  };
};

/**
 * Middleware factory: Require permission on a Scratch Block by blockId.
 * @param {string} requiredAction - 'view' | 'edit' | 'delete'
 */
const requireScratchBlockPermission = (requiredAction = 'edit') => {
  return async (req, res, next) => {
    try {
      const blockId = req.params.blockId;
      if (!blockId) {
        return res.status(400).json({ message: 'Block ID is required' });
      }

      const ScratchBlock = require('../models/ScratchBlock');
      const block = await ScratchBlock.findById(blockId);
      if (!block) {
        return res.status(404).json({ message: 'Scratch Block not found' });
      }

      const { canAccessScratchPage } = require('../services/authorizationService');
      const result = await canAccessScratchPage(req.user._id, block.pageId, requiredAction);

      if (!result.allowed) {
        return res.status(403).json({ message: result.reason || 'Access denied to scratch block.' });
      }

      req.block = block;
      req.page = result.page;
      req.pageRole = result.role;
      next();
    } catch (error) {
      console.error('Scratch block permission middleware error:', error.message);
      return res.status(500).json({ message: 'Authorization check failed' });
    }
  };
};

/**
 * Middleware factory: Require permission on a Scratch Comment by commentId.
 * @param {string} requiredAction - 'view' | 'comment' | 'delete'
 */
const requireScratchCommentPermission = (requiredAction = 'comment') => {
  return async (req, res, next) => {
    try {
      const commentId = req.params.commentId;
      if (!commentId) {
        return res.status(400).json({ message: 'Comment ID is required' });
      }

      const ScratchComment = require('../models/ScratchComment');
      const comment = await ScratchComment.findById(commentId);
      if (!comment) {
        return res.status(404).json({ message: 'Scratch Comment not found' });
      }

      const { canAccessScratchPage } = require('../services/authorizationService');
      const result = await canAccessScratchPage(req.user._id, comment.pageId, requiredAction);

      if (!result.allowed) {
        return res.status(403).json({ message: result.reason || 'Access denied to scratch comment.' });
      }

      req.comment = comment;
      req.page = result.page;
      req.pageRole = result.role;
      next();
    } catch (error) {
      console.error('Scratch comment permission middleware error:', error.message);
      return res.status(500).json({ message: 'Authorization check failed' });
    }
  };
};

module.exports = {
  requireScratchPagePermission,
  requireScratchBlockPermission,
  requireScratchCommentPermission,
  requireWorkspaceMember,
  requirePermission,
  requireBoardAccess,
  requireBoardPermission,
  requireItemPermission,
};

