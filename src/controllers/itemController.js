const Item = require('../models/Item');
const ActivityService = require('../services/ActivityService');
const TaskLabel = require('../models/TaskLabel');
const Label = require('../models/Label');
const Milestone = require('../models/Milestone');
const Board = require('../models/Board');

// Helper to enrich item details (labels, milestone, and attachments)
const enrichItemWithDetails = async (item) => {
  const itemObj = item.toObject ? item.toObject() : item;
  
  // 1. Fetch labels from junction table
  const taskLabels = await TaskLabel.find({ task_id: item._id }).populate('label_id');
  itemObj.labels = taskLabels
    .map(tl => tl.label_id)
    .filter(l => l !== null)
    .map(l => ({
      _id: l._id,
      name: l.name,
      color: l.color,
      description: l.description
    }));

  // 2. Fetch milestone details if milestone_id exists
  if (itemObj.milestone_id) {
    const milestone = await Milestone.findById(itemObj.milestone_id).select('_id name color status due_date');
    itemObj.milestone = milestone;
  } else {
    itemObj.milestone = null;
  }

  // 3. Fetch attachment details
  const Attachment = require('../models/Attachment');
  const dbAttachments = await Attachment.find({ issueId: item._id }).sort({ createdAt: -1 });

  const populatedAttachments = [];
  
  // Support legacy string attachments for backward compatibility
  const rawAttachments = item.attachments || [];
  for (const rawAtt of rawAttachments) {
    if (typeof rawAtt === 'string') {
      const isUrl = rawAtt.startsWith('http://') || rawAtt.startsWith('https://');
      populatedAttachments.push({
        _id: rawAtt,
        id: rawAtt,
        issueId: item._id.toString(),
        type: isUrl ? 'link' : 'file',
        fileName: rawAtt.split('/').pop() || rawAtt,
        originalName: rawAtt.split('/').pop() || rawAtt,
        publicUrl: rawAtt,
        createdAt: item.createdAt || new Date(),
        updatedAt: item.createdAt || new Date()
      });
    }
  }

  // Add DB rich attachments
  dbAttachments.forEach(att => {
    populatedAttachments.push({
      _id: att._id,
      id: att._id.toString(),
      issueId: att.issueId.toString(),
      type: att.type,
      fileName: att.fileName,
      originalName: att.originalName,
      mimeType: att.mimeType,
      size: att.size,
      storageKey: att.storageKey,
      publicUrl: att.publicUrl,
      uploadedBy: att.uploadedBy,
      createdAt: att.createdAt,
      updatedAt: att.updatedAt
    });
  });

  itemObj.attachments = populatedAttachments;

  return itemObj;
};

// Helper to sync labels with the junction table
const syncItemLabels = async (item, labelsInput) => {
  if (!labelsInput) return;
  const board = await Board.findById(item.board);
  const workspaceId = board ? board.workspace : null;
  if (!workspaceId) return;

  const targetLabelIds = [];
  for (const lab of labelsInput) {
    const mongoose = require('mongoose');
    if (mongoose.Types.ObjectId.isValid(lab)) {
      targetLabelIds.push(lab);
    } else {
      let labelRecord = await Label.findOne({ workspace_id: workspaceId, name: lab.trim() });
      if (!labelRecord) {
        labelRecord = await Label.create({
          workspace_id: workspaceId,
          name: lab.trim(),
          color: '#3b82f6'
        });
      }
      targetLabelIds.push(labelRecord._id);
    }
  }

  await TaskLabel.deleteMany({ task_id: item._id });
  if (targetLabelIds.length > 0) {
    const assignments = targetLabelIds.map(lid => ({
      task_id: item._id,
      label_id: lid
    }));
    await TaskLabel.insertMany(assignments);
  }
};

/**
 * @desc    Get all items for a board
 * @route   GET /api/boards/:boardId/items
 * @access  Private
 */
const getItems = async (req, res) => {
  try {
    const { boardId } = req.params;
    const items = await Item.find({ board: boardId, archived: { $ne: true } }).sort({ order: 1 });
    
    const enrichedItems = [];
    for (const item of items) {
      const enriched = await enrichItemWithDetails(item);
      enrichedItems.push(enriched);
    }
    
    res.status(200).json({ items: enrichedItems });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/**
 * @desc    Create a new item
 * @route   POST /api/boards/:boardId/items
 * @access  Private
 */
const createItem = async (req, res) => {
  try {
    const { boardId } = req.params;
    const { title, columnId, type, priority, assignee, dueDate, description, milestone_id, labels } = req.body;

    if (!title || !columnId) {
      return res.status(400).json({ message: 'Title and columnId are required' });
    }

    // Get the maximum order value in this column to place the new item at the bottom
    const maxItem = await Item.findOne({ board: boardId, columnId })
      .sort({ order: -1 })
      .select('order');
    const order = maxItem ? maxItem.order + 1 : 0;

    const item = await Item.create({
      board: boardId,
      columnId,
      title,
      type: type || 'Task',
      priority: priority || 'Medium',
      assignee: assignee || '',
      dueDate: dueDate || null,
      description: description || '',
      milestone_id: milestone_id || null,
      checklist: [],
      comments: [],
      order
    });

    // Sync labels to the TaskLabel junction table
    if (labels && Array.isArray(labels)) {
      await syncItemLabels(item, labels);
    }

    await ActivityService.log({
      actorId: req.user._id,
      boardId,
      taskId: item._id,
      actionType: 'TASK_CREATED',
      newValue: item.title,
      metadata: {
        taskTitle: item.title,
        taskKey: `TASK-${item._id.toString().slice(-5).toUpperCase()}`
      }
    });

    const NotificationService = require('../services/NotificationService');
    if (item.assignee) {
      NotificationService.triggerEvent('TASK_ASSIGNED', {
        item,
        assigner: req.user
      }).catch(err => console.error('Error triggering assignment event:', err.message));
    }

    if (item.milestone_id) {
      const milestone = await Milestone.findById(item.milestone_id);
      if (milestone) {
        NotificationService.triggerEvent('TASK_ADDED_TO_MILESTONE', {
          item,
          milestone,
          actor: req.user
        }).catch(err => console.error('Error triggering TASK_ADDED_TO_MILESTONE event:', err.message));
      }
    }

    // Broadcast real-time board sync
    const SocketService = require('../services/SocketService');
    SocketService.broadcastToBoard(boardId, 'board:updated', {
      action: 'ITEM_CREATED',
      boardId,
      itemId: item._id,
      senderId: req.user._id.toString()
    });

    const enriched = await enrichItemWithDetails(item);
    res.status(201).json({ success: true, item: enriched });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

/**
 * @desc    Update an item (e.g. description, title, checklist, comments, type, priority, move columns)
 * @route   PUT /api/items/:id
 * @access  Private
 */
const updateItem = async (req, res) => {
  try {
    const item = await Item.findById(req.params.id);

    if (!item) {
      return res.status(404).json({ message: 'Item not found' });
    }

    // Capture old values for audit logging
    const oldTitle = item.title;
    const oldDescription = item.description;
    const oldColumnId = item.columnId;
    const oldType = item.type;
    const oldPriority = item.priority;
    const oldAssignee = item.assignee;
    const oldDueDate = item.dueDate;
    const oldStartDate = item.startDate;
    const oldStoryPoints = item.storyPoints;
    const oldAttachments = [...(item.attachments || [])];
    const oldLabels = [...(item.labels || [])];
    const oldComments = JSON.parse(JSON.stringify(item.comments || []));
    const oldOrder = item.order;
    const oldMilestoneId = item.milestone_id;

    const fieldsToUpdate = [
      'title',
      'description',
      'columnId',
      'type',
      'priority',
      'assignee',
      'dueDate',
      'startDate',
      'labels',
      'checklist',
      'comments',
      'order',
      'attachments',
      'archived',
      'storyPoints',
      'milestone_id'
    ];

    fieldsToUpdate.forEach(field => {
      if (req.body[field] !== undefined) {
        if (field === 'attachments') {
          item[field] = req.body[field].map(x => (x && typeof x === 'object') ? (x._id || x.id) : x);
        } else {
          item[field] = req.body[field];
        }
      }
    });

    // Support adding comments easily via { commentText: string } in body
    if (req.body.commentText) {
      item.comments.push({
        authorName: req.user.name,
        authorEmail: req.user.email,
        text: req.body.commentText,
        createdAt: new Date()
      });
    }

    const columnChanged = req.body.columnId !== undefined && req.body.columnId !== oldColumnId;
    const orderChanged = req.body.order !== undefined && req.body.order !== oldOrder;

    await item.save();

    // Sync labels to the junction table
    if (req.body.labels !== undefined) {
      await syncItemLabels(item, req.body.labels);
    }

    // Check if milestone has changed
    const milestoneChanged = req.body.milestone_id !== undefined && String(req.body.milestone_id || '') !== String(oldMilestoneId || '');
    if (milestoneChanged) {
      const milestone = req.body.milestone_id ? await Milestone.findById(req.body.milestone_id) : null;
      const milestoneName = milestone ? milestone.name : 'None';
      await ActivityService.log({
        actorId: req.user._id,
        taskId: item._id,
        actionType: 'TASK_UPDATED',
        oldValue: oldMilestoneId ? 'Milestone assigned' : 'None',
        newValue: milestoneName,
        metadata: { field: 'milestone', taskTitle: item.title, taskKey: `TASK-${item._id.toString().slice(-5).toUpperCase()}` }
      });

      if (req.body.milestone_id) {
        const NotificationService = require('../services/NotificationService');
        NotificationService.triggerEvent('TASK_ADDED_TO_MILESTONE', {
          item,
          milestone,
          actor: req.user
        }).catch(err => console.error('Error triggering TASK_ADDED_TO_MILESTONE event:', err.message));
      }
    }

    if (columnChanged || orderChanged) {
      const targetColumnId = item.columnId;
      const targetOrder = item.order;

      // Retrieve all other items in target column
      const targetItems = await Item.find({
        board: item.board,
        columnId: targetColumnId,
        _id: { $ne: item._id },
        archived: { $ne: true }
      }).sort({ order: 1 });

      // Insert item at targetOrder
      targetItems.splice(targetOrder, 0, item);

      // Re-index target column items
      for (let i = 0; i < targetItems.length; i++) {
        targetItems[i].order = i;
        await targetItems[i].save();
      }

      // Re-index source column items if column changed
      if (columnChanged) {
        const sourceItems = await Item.find({
          board: item.board,
          columnId: oldColumnId,
          archived: { $ne: true }
        }).sort({ order: 1 });
        for (let i = 0; i < sourceItems.length; i++) {
          sourceItems[i].order = i;
          await sourceItems[i].save();
        }
      }
    }

    // Log individual field changes
    if (req.body.title !== undefined && req.body.title !== oldTitle) {
      await ActivityService.log({
        actorId: req.user._id,
        taskId: item._id,
        actionType: 'TITLE_CHANGED',
        oldValue: oldTitle,
        newValue: req.body.title,
        metadata: { taskTitle: req.body.title, taskKey: `TASK-${item._id.toString().slice(-5).toUpperCase()}` }
      });
    }

    if (req.body.description !== undefined && req.body.description !== oldDescription) {
      await ActivityService.log({
        actorId: req.user._id,
        taskId: item._id,
        actionType: 'DESCRIPTION_CHANGED',
        oldValue: oldDescription,
        newValue: req.body.description,
        metadata: { taskTitle: item.title, taskKey: `TASK-${item._id.toString().slice(-5).toUpperCase()}` }
      });
    }

    if (req.body.columnId !== undefined && req.body.columnId !== oldColumnId) {
      await ActivityService.log({
        actorId: req.user._id,
        taskId: item._id,
        actionType: 'STATUS_CHANGED',
        oldValue: oldColumnId,
        newValue: req.body.columnId,
        metadata: { taskTitle: item.title, taskKey: `TASK-${item._id.toString().slice(-5).toUpperCase()}` }
      });
    }

    if (req.body.type !== undefined && req.body.type !== oldType) {
      await ActivityService.log({
        actorId: req.user._id,
        taskId: item._id,
        actionType: 'TASK_UPDATED',
        oldValue: oldType,
        newValue: req.body.type,
        metadata: { field: 'type', taskTitle: item.title, taskKey: `TASK-${item._id.toString().slice(-5).toUpperCase()}` }
      });
    }

    if (req.body.priority !== undefined && req.body.priority !== oldPriority) {
      await ActivityService.log({
        actorId: req.user._id,
        taskId: item._id,
        actionType: 'PRIORITY_CHANGED',
        oldValue: oldPriority,
        newValue: req.body.priority,
        metadata: { taskTitle: item.title, taskKey: `TASK-${item._id.toString().slice(-5).toUpperCase()}` }
      });
    }

    if (req.body.assignee !== undefined && req.body.assignee !== oldAssignee) {
      const action = req.body.assignee ? 'TASK_ASSIGNED' : 'TASK_UNASSIGNED';
      await ActivityService.log({
        actorId: req.user._id,
        taskId: item._id,
        actionType: action,
        oldValue: oldAssignee || null,
        newValue: req.body.assignee || null,
        metadata: { taskTitle: item.title, taskKey: `TASK-${item._id.toString().slice(-5).toUpperCase()}` }
      });
    }

    if (req.body.dueDate !== undefined) {
      const oldValStr = oldDueDate ? new Date(oldDueDate).toISOString().slice(0, 10) : null;
      const newValStr = req.body.dueDate ? new Date(req.body.dueDate).toISOString().slice(0, 10) : null;
      if (oldValStr !== newValStr) {
        await ActivityService.log({
          actorId: req.user._id,
          taskId: item._id,
          actionType: 'DUE_DATE_CHANGED',
          oldValue: oldValStr,
          newValue: newValStr,
          metadata: { taskTitle: item.title, taskKey: `TASK-${item._id.toString().slice(-5).toUpperCase()}` }
        });
      }
    }

    if (req.body.startDate !== undefined) {
      const oldValStr = oldStartDate ? new Date(oldStartDate).toISOString().slice(0, 10) : null;
      const newValStr = req.body.startDate ? new Date(req.body.startDate).toISOString().slice(0, 10) : null;
      if (oldValStr !== newValStr) {
        await ActivityService.log({
          actorId: req.user._id,
          taskId: item._id,
          actionType: 'START_DATE_CHANGED',
          oldValue: oldValStr,
          newValue: newValStr,
          metadata: { taskTitle: item.title, taskKey: `TASK-${item._id.toString().slice(-5).toUpperCase()}` }
        });
      }
    }

    if (req.body.storyPoints !== undefined && req.body.storyPoints !== oldStoryPoints) {
      await ActivityService.log({
        actorId: req.user._id,
        taskId: item._id,
        actionType: 'STORY_POINTS_CHANGED',
        oldValue: oldStoryPoints,
        newValue: req.body.storyPoints,
        metadata: { taskTitle: item.title, taskKey: `TASK-${item._id.toString().slice(-5).toUpperCase()}` }
      });
    }

    if (req.body.attachments !== undefined) {
      const oldAttStrings = oldAttachments.map(x => x.toString());
      const newAttachments = (req.body.attachments || []).map(x => (x && typeof x === 'object') ? (x._id || x.id || '').toString() : x.toString());
      const added = newAttachments.filter(x => !oldAttStrings.includes(x));
      const removed = oldAttStrings.filter(x => !newAttachments.includes(x));

      for (const att of added) {
        await ActivityService.log({
          actorId: req.user._id,
          taskId: item._id,
          actionType: 'ATTACHMENT_ADDED',
          newValue: att,
          metadata: { taskTitle: item.title, taskKey: `TASK-${item._id.toString().slice(-5).toUpperCase()}` }
        });
      }
      for (const att of removed) {
        await ActivityService.log({
          actorId: req.user._id,
          taskId: item._id,
          actionType: 'ATTACHMENT_REMOVED',
          oldValue: att,
          metadata: { taskTitle: item.title, taskKey: `TASK-${item._id.toString().slice(-5).toUpperCase()}` }
        });
      }
    }

    if (req.body.labels !== undefined) {
      const newLabels = req.body.labels || [];
      const added = newLabels.filter(x => !oldLabels.includes(x));
      const removed = oldLabels.filter(x => !newLabels.includes(x));

      for (const lab of added) {
        await ActivityService.log({
          actorId: req.user._id,
          taskId: item._id,
          actionType: 'LABEL_ADDED',
          newValue: lab,
          metadata: { taskTitle: item.title, taskKey: `TASK-${item._id.toString().slice(-5).toUpperCase()}` }
        });
      }
      for (const lab of removed) {
        await ActivityService.log({
          actorId: req.user._id,
          taskId: item._id,
          actionType: 'LABEL_REMOVED',
          oldValue: lab,
          metadata: { taskTitle: item.title, taskKey: `TASK-${item._id.toString().slice(-5).toUpperCase()}` }
        });
      }
    }

    if (req.body.commentText) {
      await ActivityService.log({
        actorId: req.user._id,
        taskId: item._id,
        actionType: 'COMMENT_ADDED',
        newValue: req.body.commentText,
        metadata: { taskTitle: item.title, taskKey: `TASK-${item._id.toString().slice(-5).toUpperCase()}` }
      });
    }

    if (req.body.comments !== undefined) {
      const newComments = req.body.comments || [];
      const newIds = newComments.map(c => c._id ? c._id.toString() : '');

      const deleted = oldComments.filter(c => c._id && !newIds.includes(c._id.toString()));
      for (const c of deleted) {
        await ActivityService.log({
          actorId: req.user._id,
          taskId: item._id,
          actionType: 'COMMENT_DELETED',
          oldValue: c.text,
          metadata: { taskTitle: item.title, taskKey: `TASK-${item._id.toString().slice(-5).toUpperCase()}` }
        });
      }

      for (const newC of newComments) {
        if (newC._id) {
          const oldC = oldComments.find(c => c._id && c._id.toString() === newC._id.toString());
          if (oldC && oldC.text !== newC.text) {
            await ActivityService.log({
              actorId: req.user._id,
              taskId: item._id,
              actionType: 'COMMENT_UPDATED',
              oldValue: oldC.text,
              newValue: newC.text,
              metadata: { taskTitle: item.title, taskKey: `TASK-${item._id.toString().slice(-5).toUpperCase()}` }
            });
          }
        }
      }
    }

    // Trigger notification events
    const NotificationService = require('../services/NotificationService');
    
    // 1. Comment event
    if (req.body.commentText) {
      const comment = item.comments[item.comments.length - 1];
      NotificationService.triggerEvent('COMMENT_CREATED', {
        item,
        comment,
        author: req.user
      }).catch(err => console.error('Error triggering comment event:', err.message));
    }

    // 2. Assignment event
    if (req.body.assignee !== undefined && req.body.assignee !== oldAssignee && req.body.assignee) {
      NotificationService.triggerEvent('TASK_ASSIGNED', {
        item,
        assigner: req.user
      }).catch(err => console.error('Error triggering assignment event:', err.message));
    }

    // 3. Status/Column change event
    if (req.body.columnId !== undefined && req.body.columnId !== oldColumnId) {
      NotificationService.triggerEvent('TASK_STATUS_CHANGED', {
        item,
        actor: req.user,
        oldStatus: oldColumnId,
        newStatus: req.body.columnId
      }).catch(err => console.error('Error triggering status change event:', err.message));
    }

    // 4. General task update event
    const isTitleChanged = req.body.title !== undefined && req.body.title !== oldTitle;
    const isDescChanged = req.body.description !== undefined && req.body.description !== oldDescription;
    const isPriorityChanged = req.body.priority !== undefined && req.body.priority !== oldPriority;
    const isDueDateChanged = req.body.dueDate !== undefined && String(req.body.dueDate) !== String(oldDueDate);

    let changedField = null;
    if (isTitleChanged) changedField = 'title';
    else if (isDescChanged) changedField = 'description';
    else if (isPriorityChanged) changedField = 'priority';
    else if (isDueDateChanged) changedField = 'dueDate';

    if (changedField) {
      NotificationService.triggerEvent('TASK_UPDATED', {
        item,
        updater: req.user,
        field: changedField
      }).catch(err => console.error('Error triggering task update event:', err.message));
    }

    // Broadcast real-time board sync
    const SocketService = require('../services/SocketService');
    SocketService.broadcastToBoard(item.board.toString(), 'board:updated', {
      action: 'ITEM_UPDATED',
      boardId: item.board.toString(),
      itemId: item._id,
      senderId: req.user._id.toString()
    });

    const enriched = await enrichItemWithDetails(item);
    res.status(200).json({ success: true, item: enriched });
  } catch (error) {
    console.error('Error updating item:', error);
    res.status(400).json({ message: error.message });
  }
};


/**
 * @desc    Delete an item
 * @route   DELETE /api/items/:id
 * @access  Private
 */
const deleteItem = async (req, res) => {
  try {
    const item = await Item.findById(req.params.id);

    if (!item) {
      return res.status(404).json({ message: 'Item not found' });
    }

    await ActivityService.log({
      actorId: req.user._id,
      taskId: item._id,
      actionType: 'TASK_DELETED',
      oldValue: item.title,
      metadata: {
        taskTitle: item.title,
        taskKey: `TASK-${item._id.toString().slice(-5).toUpperCase()}`
      }
    });

    const boardId = item.board.toString();
    const itemId = item._id.toString();
    
    await item.deleteOne();

    // Broadcast real-time board sync
    const SocketService = require('../services/SocketService');
    SocketService.broadcastToBoard(boardId, 'board:updated', {
      action: 'ITEM_DELETED',
      boardId,
      itemId,
      senderId: req.user._id.toString()
    });

    res.status(200).json({ success: true, message: 'Item deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/**
 * @desc    Get a single item by ID
 * @route   GET /api/items/:id
 * @access  Private
 */
const getItemById = async (req, res) => {
  try {
    const enriched = await enrichItemWithDetails(req.item);
    res.status(200).json({ success: true, item: enriched });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/**
 * @desc    Get all items for a workspace
 * @route   GET /api/items
 * @access  Private
 */
const getWorkspaceItems = async (req, res) => {
  try {
    const { workspaceId } = req.query;
    if (!workspaceId) {
      return res.status(400).json({ message: 'Workspace ID is required' });
    }

    const boards = await Board.find({ workspace: workspaceId });
    const boardIds = boards.map(b => b._id);
    const items = await Item.find({ board: { $in: boardIds }, archived: { $ne: true } }).sort({ order: 1 });

    const enrichedItems = [];
    for (const item of items) {
      const enriched = await enrichItemWithDetails(item);
      enrichedItems.push(enriched);
    }

    res.status(200).json({ success: true, items: enrichedItems });
  } catch (error) {
    res.status(550).json({ message: error.message });
  }
};

module.exports = {
  getItems,
  createItem,
  updateItem,
  deleteItem,
  getItemById,
  getWorkspaceItems
};
