const User = require('../models/User');
const Item = require('../models/Item');
const Workspace = require('../models/Workspace');
const Board = require('../models/Board');
const Notification = require('../models/Notification');
const NotificationDelivery = require('../models/NotificationDelivery');
const NotificationPreference = require('../models/NotificationPreference');
const agenda = require('../config/agenda');

class NotificationService {
  /**
   * Trigger notification event. Resolves recipients and details, saves DB entries, queues delivery jobs.
   * 
   * @param {string} eventName - e.g. USER_REGISTERED, TASK_ASSIGNED, etc.
   * @param {Object} payload - Context variables (item, actor, assigner, comment, etc.)
   */
  static async triggerEvent(eventName, payload) {
    try {
      console.log(`Notification event triggered: ${eventName}`, payload);
      
      let recipients = [];
      let workspaceId = payload.workspaceId;
      let title = '';
      let message = '';
      let entityType = payload.entityType;
      let entityId = payload.entityId;

      switch (eventName) {
        case 'USER_REGISTERED': {
          const { user } = payload;
          recipients = [user];
          title = 'Welcome to doTheThing!';
          message = `Hi ${user.name}, welcome to doTheThing! Track your tasks, projects, and collaborate with your team.`;
          entityType = 'USER';
          entityId = user._id.toString();
          break;
        }

        case 'TASK_ASSIGNED': {
          const { item, assigner } = payload;
          if (!item.assignee) return;
          const user = await User.findOne({ email: item.assignee.toLowerCase().trim() });
          if (!user) {
            console.warn(`Assignee email ${item.assignee} is not registered yet.`);
            return;
          }
          // Don't notify if assigning to self
          if (assigner && assigner._id.toString() === user._id.toString()) {
            return;
          }
          recipients = [user];
          title = 'New Task Assigned';
          message = `${assigner ? assigner.name : 'A team member'} assigned you a task: "${item.title}"`;
          entityType = 'TASK';
          entityId = item._id.toString();
          
          if (!workspaceId) {
            const board = await Board.findById(item.board);
            if (board) workspaceId = board.workspace;
          }
          break;
        }

        case 'TASK_UPDATED': {
          const { item, updater, field } = payload;
          if (!item.assignee) return;
          const user = await User.findOne({ email: item.assignee.toLowerCase().trim() });
          if (!user || (updater && updater._id.toString() === user._id.toString())) {
            return;
          }
          recipients = [user];
          title = 'Task Updated';
          message = `${updater ? updater.name : 'A team member'} updated the field "${field || 'details'}" on task: "${item.title}"`;
          entityType = 'TASK';
          entityId = item._id.toString();
          
          if (!workspaceId) {
            const board = await Board.findById(item.board);
            if (board) workspaceId = board.workspace;
          }
          break;
        }

        case 'COMMENT_CREATED': {
          const { item, comment, author } = payload;
          if (!workspaceId) {
            const board = await Board.findById(item.board);
            if (board) workspaceId = board.workspace;
          }
          
          // 1. Extract and notify mentioned users
          const mentionedUsers = await this.extractMentions(comment.text, workspaceId);
          const mentionedUserIds = mentionedUsers.map(u => u._id.toString());
          
          for (const user of mentionedUsers) {
            // Don't notify self-mentions
            if (author && author._id.toString() === user._id.toString()) continue;
            await this.createAndQueue({
              userId: user._id,
              workspaceId,
              type: 'MENTION',
              title: 'You were mentioned in a task',
              message: `${author ? author.name : 'Someone'} mentioned you in a comment on "${item.title}": "${comment.text.substring(0, 60)}${comment.text.length > 60 ? '...' : ''}"`,
              entityType: 'TASK',
              entityId: item._id.toString(),
            });
          }

          // 2. Notify assignee if not mentioned and not the author of comment
          if (item.assignee) {
            const assigneeUser = await User.findOne({ email: item.assignee.toLowerCase().trim() });
            if (assigneeUser && 
                (!author || author._id.toString() !== assigneeUser._id.toString()) && 
                !mentionedUserIds.includes(assigneeUser._id.toString())) {
              
              await this.createAndQueue({
                userId: assigneeUser._id,
                workspaceId,
                type: 'TASK_COMMENT',
                title: 'New Task Comment',
                message: `${author ? author.name : 'Someone'} commented on task "${item.title}": "${comment.text.substring(0, 60)}${comment.text.length > 60 ? '...' : ''}"`,
                entityType: 'TASK',
                entityId: item._id.toString(),
              });
            }
          }
          return; // Skip normal bulk recipient creation
        }

        case 'TASK_STATUS_CHANGED': {
          const { item, actor, oldStatus, newStatus } = payload;
          if (!item.assignee) return;
          const user = await User.findOne({ email: item.assignee.toLowerCase().trim() });
          if (!user || (actor && actor._id.toString() === user._id.toString())) {
            return;
          }
          recipients = [user];
          title = 'Task Status Changed';
          message = `${actor ? actor.name : 'Someone'} changed status of "${item.title}" to ${newStatus}`;
          entityType = 'TASK';
          entityId = item._id.toString();
          
          if (!workspaceId) {
            const board = await Board.findById(item.board);
            if (board) workspaceId = board.workspace;
          }
          break;
        }

        case 'TEAM_ANNOUNCEMENT_CREATED': {
          const { announcement, author } = payload;
          const WorkspaceMember = require('../models/WorkspaceMember');
          const memberships = await WorkspaceMember.find({ workspaceId }).populate('userId');
          
          recipients = memberships
            .map(m => m.userId)
            .filter(u => u && (!author || u._id.toString() !== author._id.toString()));
          
          title = 'New Team Announcement';
          message = announcement.title;
          entityType = 'ANNOUNCEMENT';
          entityId = announcement._id.toString();
          break;
        }

        case 'DEADLINE_REMINDER': {
          const { item, remainingTimeText } = payload;
          if (!item.assignee) return;
          const user = await User.findOne({ email: item.assignee.toLowerCase().trim() });
          if (!user) return;
          
          recipients = [user];
          title = remainingTimeText === 'OVERDUE' ? 'Task Overdue! ⚠️' : 'Task Due Soon';
          message = remainingTimeText === 'OVERDUE' 
            ? `Your assigned task "${item.title}" is overdue!` 
            : `Your assigned task "${item.title}" is due soon (${remainingTimeText}).`;
          entityType = 'TASK';
          entityId = item._id.toString();
          
          if (!workspaceId) {
            const board = await Board.findById(item.board);
            if (board) workspaceId = board.workspace;
          }
          break;
        }

        case 'MILESTONE_CREATED':
        case 'MILESTONE_UPDATED':
        case 'MILESTONE_COMPLETED':
        case 'MILESTONE_DUE_SOON':
        case 'MILESTONE_OVERDUE': {
          const { milestone, actor } = payload;
          workspaceId = payload.workspaceId || milestone.workspace_id;
          
          const WorkspaceMember = require('../models/WorkspaceMember');
          const memberships = await WorkspaceMember.find({ workspaceId }).populate('userId');
          
          recipients = memberships
            .map(m => m.userId)
            .filter(u => u && (!actor || u._id.toString() !== actor._id.toString()));

          entityType = 'MILESTONE';
          entityId = milestone._id.toString();

          if (eventName === 'MILESTONE_CREATED') {
            title = 'New Milestone Created';
            message = `Milestone "${milestone.name}" has been created in your workspace.`;
          } else if (eventName === 'MILESTONE_COMPLETED') {
            title = 'Milestone Completed! 🎉';
            message = `Milestone "${milestone.name}" has been successfully completed!`;
          } else if (eventName === 'MILESTONE_DUE_SOON') {
            title = 'Milestone Due Soon ⏰';
            message = `Milestone "${milestone.name}" is due on ${new Date(milestone.due_date).toLocaleDateString()}.`;
          } else if (eventName === 'MILESTONE_OVERDUE') {
            title = 'Milestone Overdue! ⚠️';
            message = `Milestone "${milestone.name}" is overdue! It was due on ${new Date(milestone.due_date).toLocaleDateString()}.`;
          } else {
            title = 'Milestone Updated';
            message = `Milestone "${milestone.name}" details have been updated.`;
          }
          break;
        }

        case 'TASK_ADDED_TO_MILESTONE': {
          const { item, milestone, actor } = payload;
          entityType = 'TASK';
          entityId = item._id.toString();

          const board = await Board.findById(item.board);
          if (board) workspaceId = board.workspace;

          const user = item.assignee ? await User.findOne({ email: item.assignee.toLowerCase().trim() }) : null;
          recipients = [];
          if (user && (!actor || actor._id.toString() !== user._id.toString())) {
            recipients.push(user);
          }

          const milestoneCreator = await User.findById(milestone.created_by);
          if (milestoneCreator && 
              (!actor || actor._id.toString() !== milestoneCreator._id.toString()) && 
              (!user || user._id.toString() !== milestoneCreator._id.toString())) {
            recipients.push(milestoneCreator);
          }

          title = 'Task Added to Milestone';
          message = `Task "${item.title}" has been added to Milestone "${milestone.name}".`;
          break;
        }

        default:
          console.warn(`Unknown notification event: ${eventName}`);
          return;
      }

      // Create record and queue for mapped bulk recipients
      for (const recipient of recipients) {
        await this.createAndQueue({
          userId: recipient._id,
          workspaceId,
          type: this.mapEventToNotificationType(eventName),
          title,
          message,
          entityType,
          entityId,
        });
      }

    } catch (err) {
      console.error(`Error in triggerEvent:`, err.message);
    }
  }

  static mapEventToNotificationType(event) {
    const mappings = {
      'USER_REGISTERED': 'WELCOME',
      'TASK_ASSIGNED': 'TASK_ASSIGNED',
      'TASK_UPDATED': 'TASK_UPDATED',
      'COMMENT_CREATED': 'TASK_COMMENT',
      'TASK_STATUS_CHANGED': 'STATUS_CHANGED',
      'DEADLINE_REMINDER': 'DEADLINE_REMINDER',
      'TEAM_ANNOUNCEMENT_CREATED': 'TEAM_ANNOUNCEMENT',
      'MILESTONE_CREATED': 'MILESTONE_ALERT',
      'MILESTONE_UPDATED': 'MILESTONE_ALERT',
      'MILESTONE_COMPLETED': 'MILESTONE_ALERT',
      'MILESTONE_DUE_SOON': 'MILESTONE_ALERT',
      'MILESTONE_OVERDUE': 'MILESTONE_ALERT',
      'TASK_ADDED_TO_MILESTONE': 'MILESTONE_ALERT',
    };
    return mappings[event] || 'TASK_UPDATED';
  }

  static async extractMentions(text, workspaceId) {
    const WorkspaceMember = require('../models/WorkspaceMember');
    
    // Pattern to look for email addresses preceded by @ (e.g. @user@example.com)
    const emailRegex = /@([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g;
    const emails = [];
    let match;
    while ((match = emailRegex.exec(text)) !== null) {
      emails.push(match[1].toLowerCase().trim());
    }

    const memberships = await WorkspaceMember.find({ workspaceId }).populate('userId');
    const mentionedUsers = [];

    for (const member of memberships) {
      if (!member.userId) continue;
      const user = member.userId;

      // 1. Exact email match
      if (emails.includes(user.email.toLowerCase().trim())) {
        mentionedUsers.push(user);
        continue;
      }

      // 2. Exact or partial name match, e.g. "@John Doe" or "@John"
      const escapedName = user.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const namePattern = new RegExp(`@${escapedName}\\b`, 'i');
      if (namePattern.test(text)) {
        mentionedUsers.push(user);
      }
    }
    return mentionedUsers;
  }

  static async createAndQueue({ userId, workspaceId, type, title, message, entityType, entityId }) {
    try {
      // 1. Fetch preference
      let pref = await NotificationPreference.findOne({ userId });
      if (!pref) {
        pref = await NotificationPreference.create({ userId });
      }

      // 2. Create base in-app Notification DB entry
      const notification = await Notification.create({
        workspaceId,
        userId,
        type,
        title,
        message,
        entityType,
        entityId,
        isRead: false,
      });

      // 3. Resolve channels
      const channels = ['IN_APP']; // In-app is always enabled

      let emailEnabled = false;
      if (type === 'WELCOME') emailEnabled = true;
      else if (type === 'MENTION' && pref.emailMentions) emailEnabled = true;
      else if (type === 'TASK_ASSIGNED' && pref.emailAssignments) emailEnabled = true;
      else if (type === 'DEADLINE_REMINDER' && pref.emailReminders) emailEnabled = true;
      else if (type === 'TEAM_ANNOUNCEMENT' && pref.emailAnnouncements) emailEnabled = true;
      else if (type === 'MILESTONE_ALERT') emailEnabled = true;

      if (emailEnabled) {
        channels.push('EMAIL');
      }

      if (pref.pushEnabled) {
        channels.push('PUSH');
      }

      // 4. Create NotificationDelivery tracks & safely append BullMQ jobs
      for (const channel of channels) {
        const delivery = await NotificationDelivery.create({
          notificationId: notification._id,
          channel,
          status: 'PENDING',
          attempts: 0,
        });

        let queued = false;
        try {
          if (channel === 'IN_APP') {
            const job = await agenda.now('in-app-delivery', {
              deliveryId: delivery._id,
              notificationId: notification._id
            });
            if (job) queued = true;
          } else if (channel === 'EMAIL') {
            const job = await agenda.now('email-delivery', {
              deliveryId: delivery._id,
              notificationId: notification._id
            });
            if (job) queued = true;
          } else if (channel === 'PUSH') {
            const job = await agenda.now('push-delivery', {
              deliveryId: delivery._id,
              notificationId: notification._id
            });
            if (job) queued = true;
          }
        } catch (err) {
          console.error(`Failed to queue job for channel ${channel}:`, err.message);
        }

        // Synchronous fallback if Agenda queueing fails
        if (!queued) {
          console.log(`Agenda Queue offline. Processing ${channel} delivery synchronously in-process...`);
          try {
            if (channel === 'IN_APP') {
              const { processNotificationJob } = require('../workers/notificationWorker');
              await processNotificationJob(delivery._id, notification._id);
            } else if (channel === 'EMAIL') {
              const { processEmailJob } = require('../workers/emailWorker');
              await processEmailJob(delivery._id, notification._id);
            } else if (channel === 'PUSH') {
              delivery.status = 'SENT';
              delivery.sentAt = new Date();
              await delivery.save();
            }
          } catch (deliveryErr) {
            console.error(`Synchronous delivery failed for channel ${channel}:`, deliveryErr.message);
          }
        }
      }

      return notification;
    } catch (err) {
      console.error('Error creating/queueing notification:', err.message);
    }
  }
}

module.exports = NotificationService;
