const ScratchPage = require('../models/ScratchPage');
const ScratchBlock = require('../models/ScratchBlock');

/**
 * Get all pages in a workspace
 */
const getPages = async (req, res) => {
  try {
    const { workspaceId } = req.query;
    if (!workspaceId) {
      return res.status(400).json({ message: 'Workspace ID is required' });
    }

    const { getWorkspaceRole } = require('../services/authorizationService');
    const workspaceRole = await getWorkspaceRole(req.user._id, workspaceId);
    if (!workspaceRole) {
      return res.status(403).json({ message: 'Access denied. You are not a member of this workspace.' });
    }

    let filter = {};
    if (workspaceRole === 'OWNER' || workspaceRole === 'ADMIN') {
      filter = { workspace: workspaceId };
    } else {
      filter = {
        workspace: workspaceId,
        $or: [
          { createdBy: req.user._id },
          { visibility: 'workspace' },
          { 'collaborators.user': req.user._id },
          { visibility: 'public' },
        ],
      };
    }

    const pages = await ScratchPage.find(filter)
      .sort({ order: 1, createdAt: 1 })
      .lean();

    return res.status(200).json({ pages });
  } catch (error) {
    console.error('Error fetching scratch pages:', error);
    return res.status(500).json({ message: 'Failed to fetch scratch pages' });
  }
};

/**
 * Get single page with its blocks
 */
const getPageById = async (req, res) => {
  try {
    const { id } = req.params;
    const page = await ScratchPage.findById(id).lean();

    if (!page) {
      return res.status(404).json({ message: 'Scratch page not found' });
    }

    const blocks = await ScratchBlock.find({ pageId: id }).sort({ order: 1 }).lean();

    return res.status(200).json({ page, blocks });
  } catch (error) {
    console.error('Error fetching scratch page:', error);
    return res.status(500).json({ message: 'Failed to fetch scratch page' });
  }
};

/**
 * Create a new Scratch Page
 */
const createPage = async (req, res) => {
  try {
    const { workspaceId, title, icon, cover, parentPageId, visibility } = req.body;

    if (!workspaceId) {
      return res.status(400).json({ message: 'Workspace ID is required' });
    }

    // Find highest order
    const maxPage = await ScratchPage.findOne({ workspace: workspaceId, parentPageId: parentPageId || null })
      .sort({ order: -1 })
      .lean();
    const order = maxPage ? maxPage.order + 1 : 0;

    // Default visibility is private unless explicitly workspace
    const pageVisibility = visibility === 'workspace' ? 'workspace' : 'private';

    const page = await ScratchPage.create({
      workspace: workspaceId,
      title: title || 'Untitled',
      icon: icon || '📄',
      cover: cover || '',
      parentPageId: parentPageId || null,
      visibility: pageVisibility,
      order,
      createdBy: req.user._id,
    });

    // Create an initial empty paragraph block
    const initialBlock = await ScratchBlock.create({
      pageId: page._id,
      workspace: workspaceId,
      type: 'paragraph',
      content: '',
      order: 0,
    });

    const SocketService = require('../services/SocketService');
    SocketService.broadcastToWorkspace(workspaceId.toString(), 'scratch:page-created', { page });

    return res.status(201).json({ page, blocks: [initialBlock] });
  } catch (error) {
    console.error('Error creating scratch page:', error);
    return res.status(500).json({ message: 'Failed to create scratch page' });
  }
};

/**
 * Update Scratch Page metadata
 */
const updatePage = async (req, res) => {
  try {
    const { id } = req.params;
    const { title, icon, cover, parentPageId, visibility, isFavorite, order } = req.body;

    const page = await ScratchPage.findById(id);
    if (!page) {
      return res.status(404).json({ message: 'Scratch page not found' });
    }

    if (title !== undefined) page.title = title;
    if (icon !== undefined) page.icon = icon;
    if (cover !== undefined) page.cover = cover;
    if (parentPageId !== undefined) page.parentPageId = parentPageId;
    if (visibility !== undefined) page.visibility = visibility;
    if (isFavorite !== undefined) page.isFavorite = isFavorite;
    if (order !== undefined) page.order = order;

    await page.save();

    const SocketService = require('../services/SocketService');
    SocketService.broadcastToScratchPage(id, 'scratch:page-updated', {
      page,
      senderId: req.user._id,
    });
    if (page.workspace) {
      SocketService.broadcastToWorkspace(page.workspace.toString(), 'scratch:page-updated', {
        page,
        senderId: req.user._id,
      });
    }

    return res.status(200).json({ page });
  } catch (error) {
    console.error('Error updating scratch page:', error);
    return res.status(500).json({ message: 'Failed to update scratch page' });
  }
};

/**
 * Delete Scratch Page and nested subpages & blocks
 */
const deletePage = async (req, res) => {
  try {
    const { id } = req.params;

    // Helper recursive function to gather all child page IDs
    const getAllChildPageIds = async (parentIds) => {
      const children = await ScratchPage.find({ parentPageId: { $in: parentIds } }).select('_id').lean();
      if (children.length === 0) return [];
      const childIds = children.map(c => c._id);
      const subChildIds = await getAllChildPageIds(childIds);
      return [...childIds, ...subChildIds];
    };

    const targetPage = await ScratchPage.findById(id);
    if (!targetPage) {
      return res.status(404).json({ message: 'Scratch page not found' });
    }

    const childPageIds = await getAllChildPageIds([id]);
    const allPageIdsToDelete = [id, ...childPageIds];

    // Delete blocks & pages
    await ScratchBlock.deleteMany({ pageId: { $in: allPageIdsToDelete } });
    await ScratchPage.deleteMany({ _id: { $in: allPageIdsToDelete } });

    const SocketService = require('../services/SocketService');
    SocketService.broadcastToWorkspace(targetPage.workspace.toString(), 'scratch:page-deleted', {
      pageId: id,
      deletedPageIds: allPageIdsToDelete,
    });

    return res.status(200).json({ message: 'Page and subpages deleted successfully', deletedPageIds: allPageIdsToDelete });
  } catch (error) {
    console.error('Error deleting scratch page:', error);
    return res.status(500).json({ message: 'Failed to delete scratch page' });
  }
};

/**
 * Duplicate a Scratch Page with its blocks
 */
const duplicatePage = async (req, res) => {
  try {
    const { id } = req.params;
    const page = await ScratchPage.findById(id).lean();
    if (!page) {
      return res.status(404).json({ message: 'Scratch page not found' });
    }

    const newPage = await ScratchPage.create({
      workspace: page.workspace,
      title: `${page.title} (Copy)`,
      icon: page.icon,
      cover: page.cover,
      parentPageId: page.parentPageId,
      order: page.order + 1,
      createdBy: req.user._id,
    });

    const blocks = await ScratchBlock.find({ pageId: id }).lean();
    const duplicatedBlocks = await Promise.all(
      blocks.map(b =>
        ScratchBlock.create({
          pageId: newPage._id,
          workspace: page.workspace,
          type: b.type,
          content: b.content,
          properties: b.properties,
          order: b.order,
        })
      )
    );

    return res.status(201).json({ page: newPage, blocks: duplicatedBlocks });
  } catch (error) {
    console.error('Error duplicating page:', error);
    return res.status(500).json({ message: 'Failed to duplicate scratch page' });
  }
};

/**
 * Get blocks for a page
 */
const getBlocks = async (req, res) => {
  try {
    const { pageId } = req.params;
    const blocks = await ScratchBlock.find({ pageId }).sort({ order: 1 }).lean();
    return res.status(200).json({ blocks });
  } catch (error) {
    console.error('Error fetching blocks:', error);
    return res.status(500).json({ message: 'Failed to fetch blocks' });
  }
};

/**
 * Create a new block on a page
 */
const createBlock = async (req, res) => {
  try {
    const { pageId } = req.params;
    const { type, content, properties, afterBlockId } = req.body;

    const page = await ScratchPage.findById(pageId);
    if (!page) {
      return res.status(404).json({ message: 'Scratch page not found' });
    }

    let order = 0;
    if (afterBlockId) {
      const prevBlock = await ScratchBlock.findById(afterBlockId);
      if (prevBlock) {
        order = prevBlock.order + 1;
        // Shift subsequent blocks
        await ScratchBlock.updateMany(
          { pageId, order: { $gte: order } },
          { $inc: { order: 1 } }
        );
      }
    } else {
      const lastBlock = await ScratchBlock.findOne({ pageId }).sort({ order: -1 }).lean();
      order = lastBlock ? lastBlock.order + 1 : 0;
    }

    const block = await ScratchBlock.create({
      pageId,
      workspace: page.workspace,
      type: type || 'paragraph',
      content: content || '',
      properties: properties || {},
      order,
    });

    const SocketService = require('../services/SocketService');
    SocketService.broadcastToScratchPage(pageId.toString(), 'scratch:block-created', {
      block,
      senderId: req.user._id,
    });

    return res.status(201).json({ block });
  } catch (error) {
    console.error('Error creating block:', error);
    return res.status(500).json({ message: 'Failed to create block' });
  }
};

/**
 * Update block content / properties
 */
const updateBlock = async (req, res) => {
  try {
    const { blockId } = req.params;
    const { type, content, properties, order } = req.body;

    const block = await ScratchBlock.findById(blockId);
    if (!block) {
      return res.status(404).json({ message: 'Block not found' });
    }

    if (type !== undefined) block.type = type;
    if (content !== undefined) block.content = content;
    if (properties !== undefined) {
      block.properties = { ...(block.properties || {}), ...properties };
      block.markModified('properties');
    }
    if (order !== undefined) block.order = order;

    await block.save();

    const SocketService = require('../services/SocketService');
    SocketService.broadcastToScratchPage(block.pageId.toString(), 'scratch:block-updated', {
      block,
      senderId: req.user._id,
    });

    return res.status(200).json({ block });
  } catch (error) {
    console.error('Error updating block:', error);
    return res.status(500).json({ message: 'Failed to update block' });
  }
};

/**
 * Delete a block
 */
const deleteBlock = async (req, res) => {
  try {
    const { blockId } = req.params;
    const block = await ScratchBlock.findByIdAndDelete(blockId);
    if (!block) {
      return res.status(404).json({ message: 'Block not found' });
    }

    const SocketService = require('../services/SocketService');
    SocketService.broadcastToScratchPage(block.pageId.toString(), 'scratch:block-deleted', {
      blockId,
      senderId: req.user._id,
    });

    return res.status(200).json({ message: 'Block deleted successfully', blockId });
  } catch (error) {
    console.error('Error deleting block:', error);
    return res.status(500).json({ message: 'Failed to delete block' });
  }
};

/**
 * Batch delete blocks
 */
const deleteBlocksBatch = async (req, res) => {
  try {
    const { pageId } = req.params;
    const { blockIds } = req.body;

    if (!Array.isArray(blockIds) || blockIds.length === 0) {
      return res.status(400).json({ message: 'blockIds array is required' });
    }

    const page = await ScratchPage.findById(pageId);
    if (!page) {
      return res.status(404).json({ message: 'Scratch page not found' });
    }

    await ScratchBlock.deleteMany({ _id: { $in: blockIds }, pageId });

    // Ensure at least one block remains on the page
    const remainingCount = await ScratchBlock.countDocuments({ pageId });
    let fallbackBlock = null;
    if (remainingCount === 0) {
      fallbackBlock = await ScratchBlock.create({
        pageId,
        workspace: page.workspace,
        type: 'paragraph',
        content: '',
        order: 0,
      });
    }

    const SocketService = require('../services/SocketService');
    SocketService.broadcastToScratchPage(pageId.toString(), 'scratch:blocks-batch-deleted', {
      blockIds,
      fallbackBlock,
      senderId: req.user._id,
    });

    return res.status(200).json({
      message: 'Blocks deleted successfully',
      deletedBlockIds: blockIds,
      fallbackBlock,
    });
  } catch (error) {
    console.error('Error batch deleting blocks:', error);
    return res.status(500).json({ message: 'Failed to batch delete blocks' });
  }
};

/**
 * Batch create blocks on a page (paste / import)
 */
const createBlocksBatch = async (req, res) => {
  try {
    const { pageId } = req.params;
    const { blocks, afterBlockId, replaceBlockId } = req.body;

    if (!Array.isArray(blocks) || blocks.length === 0) {
      return res.status(400).json({ message: 'Blocks array is required' });
    }

    const page = await ScratchPage.findById(pageId);
    if (!page) {
      return res.status(404).json({ message: 'Scratch page not found' });
    }

    let startingOrder = 0;
    let replacedBlock = null;
    let blocksToInsert = [...blocks];

    if (replaceBlockId) {
      const blockToReplace = await ScratchBlock.findById(replaceBlockId);
      if (blockToReplace) {
        const first = blocksToInsert[0];
        blockToReplace.type = first.type || 'paragraph';
        blockToReplace.content = first.content || '';
        blockToReplace.properties = first.properties || {};
        await blockToReplace.save();
        replacedBlock = blockToReplace;

        startingOrder = blockToReplace.order + 1;
        blocksToInsert = blocksToInsert.slice(1);
      }
    } else if (afterBlockId) {
      const prevBlock = await ScratchBlock.findById(afterBlockId);
      if (prevBlock) {
        startingOrder = prevBlock.order + 1;
      }
    } else {
      const lastBlock = await ScratchBlock.findOne({ pageId }).sort({ order: -1 }).lean();
      startingOrder = lastBlock ? lastBlock.order + 1 : 0;
    }

    let createdBlocks = [];
    if (blocksToInsert.length > 0) {
      // Shift existing blocks after startingOrder
      await ScratchBlock.updateMany(
        { pageId, order: { $gte: startingOrder } },
        { $inc: { order: blocksToInsert.length } }
      );

      const docs = blocksToInsert.map((b, idx) => ({
        pageId,
        workspace: page.workspace,
        type: b.type || 'paragraph',
        content: b.content || '',
        properties: b.properties || {},
        order: startingOrder + idx,
      }));

      createdBlocks = await ScratchBlock.insertMany(docs);
    }

    const allAffectedBlocks = replacedBlock ? [replacedBlock, ...createdBlocks] : createdBlocks;

    const SocketService = require('../services/SocketService');
    SocketService.broadcastToScratchPage(pageId.toString(), 'scratch:blocks-batch-created', {
      blocks: allAffectedBlocks,
      replacedBlockId: replaceBlockId || null,
      senderId: req.user._id,
    });

    return res.status(201).json({
      blocks: allAffectedBlocks,
      replacedBlock: replacedBlock || null,
    });
  } catch (error) {
    console.error('Error creating blocks batch:', error);
    return res.status(500).json({ message: 'Failed to create blocks batch' });
  }
};

/**
 * Batch reorder blocks
 */
const reorderBlocks = async (req, res) => {
  try {
    const { pageId } = req.params;
    const { blocks } = req.body; // Array of { id, order }

    if (!Array.isArray(blocks)) {
      return res.status(400).json({ message: 'Blocks array is required' });
    }

    const bulkOps = blocks.map(b => ({
      updateOne: {
        filter: { _id: b.id, pageId },
        update: { $set: { order: b.order } },
      },
    }));

    if (bulkOps.length > 0) {
      await ScratchBlock.bulkWrite(bulkOps);
    }

    const SocketService = require('../services/SocketService');
    SocketService.broadcastToScratchPage(pageId, 'scratch:blocks-reordered', {
      blocks,
      senderId: req.user._id,
    });

    return res.status(200).json({ message: 'Blocks reordered successfully' });
  } catch (error) {
    console.error('Error reordering blocks:', error);
    return res.status(500).json({ message: 'Failed to reorder blocks' });
  }
};

const crypto = require('crypto');
const ScratchComment = require('../models/ScratchComment');
const ScratchShareToken = require('../models/ScratchShareToken');

/**
 * Get comments for a page
 */
const getComments = async (req, res) => {
  try {
    const { pageId } = req.params;
    const comments = await ScratchComment.find({ pageId })
      .populate('author', 'name email avatar')
      .populate('replies.author', 'name email avatar')
      .sort({ createdAt: -1 })
      .lean();

    return res.status(200).json({ comments });
  } catch (error) {
    console.error('Error fetching comments:', error);
    return res.status(500).json({ message: 'Failed to fetch comments' });
  }
};

/**
 * Create a new comment
 */
const createComment = async (req, res) => {
  try {
    const { pageId } = req.params;
    const { blockId, content } = req.body;

    if (!content) {
      return res.status(400).json({ message: 'Comment content is required' });
    }

    const comment = await ScratchComment.create({
      pageId,
      blockId: blockId || null,
      content,
      author: req.user._id,
    });

    const populated = await ScratchComment.findById(comment._id)
      .populate('author', 'name email avatar')
      .lean();

    return res.status(201).json({ comment: populated });
  } catch (error) {
    console.error('Error creating comment:', error);
    return res.status(500).json({ message: 'Failed to create comment' });
  }
};

/**
 * Reply to a comment
 */
const replyComment = async (req, res) => {
  try {
    const { commentId } = req.params;
    const { content } = req.body;

    if (!content) {
      return res.status(400).json({ message: 'Reply content is required' });
    }

    const comment = await ScratchComment.findById(commentId);
    if (!comment) {
      return res.status(404).json({ message: 'Comment not found' });
    }

    comment.replies.push({
      author: req.user._id,
      content,
      createdAt: new Date(),
    });

    await comment.save();

    const populated = await ScratchComment.findById(comment._id)
      .populate('author', 'name email avatar')
      .populate('replies.author', 'name email avatar')
      .lean();

    return res.status(200).json({ comment: populated });
  } catch (error) {
    console.error('Error replying to comment:', error);
    return res.status(500).json({ message: 'Failed to reply to comment' });
  }
};

/**
 * Toggle resolve comment
 */
const resolveComment = async (req, res) => {
  try {
    const { commentId } = req.params;
    const comment = await ScratchComment.findById(commentId);

    if (!comment) {
      return res.status(404).json({ message: 'Comment not found' });
    }

    comment.resolved = !comment.resolved;
    await comment.save();

    return res.status(200).json({ comment });
  } catch (error) {
    console.error('Error resolving comment:', error);
    return res.status(500).json({ message: 'Failed to resolve comment' });
  }
};

/**
 * Delete comment
 */
const deleteComment = async (req, res) => {
  try {
    const { commentId } = req.params;
    await ScratchComment.findByIdAndDelete(commentId);
    return res.status(200).json({ message: 'Comment deleted successfully', commentId });
  } catch (error) {
    console.error('Error deleting comment:', error);
    return res.status(500).json({ message: 'Failed to delete comment' });
  }
};

/**
 * Generate a public share token with role & expiry limit
 */
const createShareToken = async (req, res) => {
  try {
    const { pageId } = req.params;
    const { role, expiresInHours } = req.body;

    const page = await ScratchPage.findById(pageId);
    if (!page) {
      return res.status(404).json({ message: 'Scratch page not found' });
    }

    const tokenString = crypto.randomBytes(16).toString('hex');

    let expiresAt = null;
    if (expiresInHours && typeof expiresInHours === 'number' && expiresInHours > 0) {
      expiresAt = new Date(Date.now() + expiresInHours * 60 * 60 * 1000);
    }

    const shareToken = await ScratchShareToken.create({
      pageId,
      token: tokenString,
      role: role === 'editor' ? 'editor' : 'viewer',
      expiresAt,
      createdBy: req.user._id,
    });

    return res.status(201).json({ shareToken });
  } catch (error) {
    console.error('Error creating share token:', error);
    return res.status(500).json({ message: 'Failed to create share token' });
  }
};

/**
 * Get active share tokens for a page
 */
const getShareTokens = async (req, res) => {
  try {
    const { pageId } = req.params;
    const tokens = await ScratchShareToken.find({ pageId })
      .sort({ createdAt: -1 })
      .lean();

    return res.status(200).json({ tokens });
  } catch (error) {
    console.error('Error fetching share tokens:', error);
    return res.status(500).json({ message: 'Failed to fetch share tokens' });
  }
};

/**
 * Revoke/delete a share token
 */
const deleteShareToken = async (req, res) => {
  try {
    const { tokenId } = req.params;
    await ScratchShareToken.findByIdAndDelete(tokenId);
    return res.status(200).json({ message: 'Share token revoked successfully', tokenId });
  } catch (error) {
    console.error('Error revoking share token:', error);
    return res.status(500).json({ message: 'Failed to revoke share token' });
  }
};

/**
 * Public access: Get page & blocks by token (even for non-logged in users)
 */
const getPublicPageByToken = async (req, res) => {
  try {
    const { token } = req.params;
    const shareToken = await ScratchShareToken.findOne({ token }).lean();

    if (!shareToken) {
      return res.status(404).json({ message: 'Invalid or expired share link' });
    }

    // Check expiration
    if (shareToken.expiresAt && new Date() > new Date(shareToken.expiresAt)) {
      return res.status(410).json({ message: 'This share link has expired' });
    }

    const page = await ScratchPage.findById(shareToken.pageId).lean();
    if (!page) {
      return res.status(404).json({ message: 'Scratch page not found' });
    }

    const blocks = await ScratchBlock.find({ pageId: page._id }).sort({ order: 1 }).lean();

    return res.status(200).json({
      page,
      blocks,
      role: shareToken.role,
      expiresAt: shareToken.expiresAt,
    });
  } catch (error) {
    console.error('Error fetching public page:', error);
    return res.status(500).json({ message: 'Failed to fetch public page' });
  }
};

/**
 * Public access: Update block if token allows editing and is valid
 */
const updatePublicBlockByToken = async (req, res) => {
  try {
    const { token, blockId } = req.params;
    const { content, type, properties } = req.body;

    const shareToken = await ScratchShareToken.findOne({ token }).lean();
    if (!shareToken) {
      return res.status(404).json({ message: 'Invalid share link' });
    }

    if (shareToken.role !== 'editor') {
      return res.status(403).json({ message: 'You only have view access for this link' });
    }

    if (shareToken.expiresAt && new Date() > new Date(shareToken.expiresAt)) {
      return res.status(410).json({ message: 'This share link has expired' });
    }

    const block = await ScratchBlock.findById(blockId);
    if (!block) {
      return res.status(404).json({ message: 'Block not found' });
    }

    if (content !== undefined) block.content = content;
    if (type !== undefined) block.type = type;
    if (properties !== undefined) block.properties = { ...block.properties, ...properties };

    await block.save();

    const SocketService = require('../services/SocketService');
    SocketService.broadcastToScratchPage(block.pageId.toString(), 'scratch:block-updated', {
      block,
      senderId: 'public-guest',
    });

    return res.status(200).json({ block });
  } catch (error) {
    console.error('Error updating public block:', error);
    return res.status(500).json({ message: 'Failed to update block' });
  }
};

/**
 * Add / Invite a collaborator by email
 */
const addCollaborator = async (req, res) => {
  try {
    const { id } = req.params;
    const { email, role } = req.body;

    if (!email) {
      return res.status(400).json({ message: 'User email is required' });
    }

    const page = await ScratchPage.findById(id);
    if (!page) {
      return res.status(404).json({ message: 'Scratch page not found' });
    }

    const User = require('../models/User');
    const userToInvite = await User.findOne({ email: email.trim().toLowerCase() });
    if (!userToInvite) {
      return res.status(404).json({ message: 'No registered user found with that email' });
    }

    if (page.createdBy.toString() === userToInvite._id.toString()) {
      return res.status(400).json({ message: 'User is the owner of this page' });
    }

    const existingIndex = page.collaborators.findIndex(
      (c) => c.user.toString() === userToInvite._id.toString()
    );

    const assignedRole = role === 'viewer' || role === 'commenter' ? role : 'editor';

    if (existingIndex > -1) {
      page.collaborators[existingIndex].role = assignedRole;
    } else {
      page.collaborators.push({
        user: userToInvite._id,
        role: assignedRole,
      });
    }

    await page.save();

    const updatedPage = await ScratchPage.findById(id)
      .populate('collaborators.user', 'name email avatar')
      .populate('createdBy', 'name email avatar')
      .lean();

    return res.status(200).json({
      message: 'Collaborator added successfully',
      collaborators: updatedPage.collaborators,
    });
  } catch (error) {
    console.error('Error adding collaborator:', error);
    return res.status(500).json({ message: 'Failed to add collaborator' });
  }
};

/**
 * Get collaborators for a page
 */
const getCollaborators = async (req, res) => {
  try {
    const { id } = req.params;
    const page = await ScratchPage.findById(id)
      .populate('collaborators.user', 'name email avatar')
      .populate('createdBy', 'name email avatar')
      .lean();

    if (!page) {
      return res.status(404).json({ message: 'Scratch page not found' });
    }

    return res.status(200).json({
      owner: page.createdBy,
      collaborators: page.collaborators || [],
    });
  } catch (error) {
    console.error('Error fetching collaborators:', error);
    return res.status(500).json({ message: 'Failed to fetch collaborators' });
  }
};

/**
 * Update collaborator role
 */
const updateCollaboratorRole = async (req, res) => {
  try {
    const { id, userId } = req.params;
    const { role } = req.body;

    const page = await ScratchPage.findById(id);
    if (!page) {
      return res.status(404).json({ message: 'Scratch page not found' });
    }

    const collaborator = page.collaborators.find((c) => c.user.toString() === userId);
    if (!collaborator) {
      return res.status(404).json({ message: 'Collaborator not found' });
    }

    collaborator.role = role === 'viewer' || role === 'commenter' ? role : 'editor';
    await page.save();

    const updatedPage = await ScratchPage.findById(id)
      .populate('collaborators.user', 'name email avatar')
      .lean();

    return res.status(200).json({ collaborators: updatedPage.collaborators });
  } catch (error) {
    console.error('Error updating collaborator role:', error);
    return res.status(500).json({ message: 'Failed to update collaborator role' });
  }
};

/**
 * Remove collaborator
 */
const removeCollaborator = async (req, res) => {
  try {
    const { id, userId } = req.params;

    const page = await ScratchPage.findById(id);
    if (!page) {
      return res.status(404).json({ message: 'Scratch page not found' });
    }

    page.collaborators = page.collaborators.filter((c) => c.user.toString() !== userId);
    await page.save();

    const updatedPage = await ScratchPage.findById(id)
      .populate('collaborators.user', 'name email avatar')
      .lean();

    return res.status(200).json({ message: 'Collaborator removed', collaborators: updatedPage.collaborators });
  } catch (error) {
    console.error('Error removing collaborator:', error);
    return res.status(500).json({ message: 'Failed to remove collaborator' });
  }
};

module.exports = {
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
};
