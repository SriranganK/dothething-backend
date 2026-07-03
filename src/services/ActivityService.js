const ActivityLog = require('../models/ActivityLog');
const Item = require('../models/Item');
const Board = require('../models/Board');

class ActivityService {
  /**
   * Log an action in the Recent Activity / Audit Log system.
   * Resolves workspaceId and boardId automatically if only taskId is provided.
   * 
   * @param {Object} params
   * @param {string} params.actorId - ID of user performing action
   * @param {string} [params.workspaceId] - Workspace ID
   * @param {string} [params.boardId] - Board/Project ID
   * @param {string} [params.taskId] - Task/Item ID
   * @param {string} params.actionType - Type of action (e.g. TASK_CREATED, STATUS_CHANGED)
   * @param {any} [params.oldValue] - Old value of modified field
   * @param {any} [params.newValue] - New value of modified field
   * @param {Object} [params.metadata] - Snapshot metadata (e.g. taskTitle, taskKey)
   */
  static async log({ actorId, workspaceId, boardId, taskId, actionType, oldValue, newValue, metadata = {} }) {
    try {
      let finalWorkspaceId = workspaceId;
      let finalBoardId = boardId;

      // Auto-lookup board and workspace if taskId is provided and workspaceId/boardId are missing
      if (taskId && (!finalWorkspaceId || !finalBoardId)) {
        const item = await Item.findById(taskId).populate({
          path: 'board',
          select: 'workspace'
        });
        if (item) {
          if (!finalBoardId) {
            finalBoardId = item.board?._id || item.board;
          }
          if (!finalWorkspaceId && item.board) {
            finalWorkspaceId = item.board.workspace;
          }
        }
      }

      // If boardId is provided but workspaceId is missing, resolve workspaceId
      if (finalBoardId && !finalWorkspaceId) {
        const board = await Board.findById(finalBoardId).select('workspace');
        if (board) {
          finalWorkspaceId = board.workspace;
        }
      }

      // Safeguard: Ensure we have at least actorId, workspaceId, and actionType
      if (!actorId || !finalWorkspaceId || !actionType) {
        console.warn('Skipping activity log due to missing required fields:', { 
          actorId: !!actorId, 
          workspaceId: !!finalWorkspaceId, 
          actionType 
        });
        return null;
      }

      // Clean/sanitize oldValue and newValue (avoid mongoose Mixed issues with undefined)
      const sanitizedOldValue = oldValue === undefined ? null : oldValue;
      const sanitizedNewValue = newValue === undefined ? null : newValue;

      const logEntry = await ActivityLog.create({
        actorId,
        workspaceId: finalWorkspaceId,
        boardId: finalBoardId,
        taskId,
        actionType,
        oldValue: sanitizedOldValue,
        newValue: sanitizedNewValue,
        metadata
      });

      return logEntry;
    } catch (err) {
      console.error('Error logging activity:', err.message);
      // Fail gracefully so that primary controller operations aren't blocked by log failures
      return null;
    }
  }
}

module.exports = ActivityService;
