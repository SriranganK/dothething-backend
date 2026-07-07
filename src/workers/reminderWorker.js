const agenda = require('../config/agenda');
const User = require('../models/User');
const Item = require('../models/Item');
const Board = require('../models/Board');
const Notification = require('../models/Notification');
const WorkspaceMember = require('../models/WorkspaceMember');
const Milestone = require('../models/Milestone');
const emailTemplateService = require('../services/emailTemplateService');

// Helper to check if a column in a board is mapped to "Done"
const isColumnDone = async (boardId, columnId) => {
  try {
    const board = await Board.findById(boardId);
    if (!board) return false;
    const column = board.columns.find(col => col.id === columnId);
    return column ? !!column.isDone : false;
  } catch (err) {
    return false;
  }
};

const handleDueTomorrow = async () => {
  console.log('Running cron: check-due-tomorrow');
  const NotificationService = require('../services/NotificationService');

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);

  // Find tasks due within the next 24 hours
  const tasks = await Item.find({
    dueDate: { $gte: new Date(), $lte: tomorrow },
    archived: { $ne: true },
    assignee: { $ne: '' }
  });

  for (const task of tasks) {
    const isDone = await isColumnDone(task.board, task.columnId);
    if (isDone) continue;

    const recipient = await User.findOne({ email: task.assignee.toLowerCase() });
    if (!recipient) continue;

    // Prevent duplicate reminders in the last 20 hours
    const alreadySent = await Notification.findOne({
      userId: recipient._id,
      type: 'DEADLINE_REMINDER',
      entityId: task._id.toString(),
      createdAt: { $gte: new Date(Date.now() - 20 * 60 * 60 * 1000) }
    });

    if (alreadySent) continue;

    const hoursRemaining = Math.max(1, Math.round((new Date(task.dueDate) - new Date()) / (1000 * 60 * 60)));
    await NotificationService.triggerEvent('DEADLINE_REMINDER', {
      item: task,
      remainingTimeText: `due in ${hoursRemaining} hours`
    });
  }
};

const handleOverdueTasks = async () => {
  console.log('Running cron: check-overdue-tasks');
  const NotificationService = require('../services/NotificationService');

  // Find active tasks past their due date
  const tasks = await Item.find({
    dueDate: { $lt: new Date() },
    archived: { $ne: true },
    assignee: { $ne: '' }
  });

  for (const task of tasks) {
    const isDone = await isColumnDone(task.board, task.columnId);
    if (isDone) continue;

    const recipient = await User.findOne({ email: task.assignee.toLowerCase() });
    if (!recipient) continue;

    // Prevent duplicate reminders in the last 20 hours
    const alreadySent = await Notification.findOne({
      userId: recipient._id,
      type: 'DEADLINE_REMINDER',
      entityId: task._id.toString(),
      message: /overdue/i,
      createdAt: { $gte: new Date(Date.now() - 20 * 60 * 60 * 1000) }
    });

    if (alreadySent) continue;

    await NotificationService.triggerEvent('DEADLINE_REMINDER', {
      item: task,
      remainingTimeText: 'OVERDUE'
    });
  }
};

const handleWeeklySummary = async () => {
  console.log('Running cron: send-weekly-summary');
  const NotificationService = require('../services/NotificationService');
  const emailWorker = require('./emailWorker'); // Ensure email config is loaded
  const nodemailer = require('nodemailer');

  const users = await User.find({});
  const oneWeekAgo = new Date();
  oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

  for (const user of users) {
    // Find all tasks assigned to the user
    const tasks = await Item.find({
      assignee: user.email.toLowerCase(),
      archived: { $ne: true }
    });

    if (tasks.length === 0) continue;

    let completedCount = 0;
    let pendingCount = 0;
    let assignedCount = tasks.length;

    for (const task of tasks) {
      const isDone = await isColumnDone(task.board, task.columnId);
      if (isDone) {
        completedCount++;
      } else {
        pendingCount++;
      }
    }

    // Direct HTML email send for weekly summary using centralized emailTemplateService
    try {
      const smtpUser = process.env.SMTP_USER || 'dothethng@gmail.com';
      const smtpPass = process.env.SMTP_PASS || 'wteb xfrb axwh upkj';

      const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
          user: smtpUser,
          pass: smtpPass
        }
      });

      const { subject, html, text } = emailTemplateService.renderEmail('WEEKLY_SUMMARY', {
        recipientName: user.name,
        assignedCount,
        completedCount,
        pendingCount
      });

      await transporter.sendMail({
        from: `"doTheThing Workload" <${smtpUser}>`,
        to: user.email,
        subject,
        text,
        html
      });
      console.log(`Weekly summary sent successfully to ${user.email}`);
    } catch (err) {
      console.error(`Failed to send weekly summary to ${user.email}:`, err.message);
    }
  }
};

const handleDueSoonMilestones = async () => {
  console.log('Running cron: check-due-soon-milestones');
  const NotificationService = require('../services/NotificationService');

  const targetDate = new Date();
  targetDate.setDate(targetDate.getDate() + 2); // 48 hours

  const milestones = await Milestone.find({
    due_date: { $gte: new Date(), $lte: targetDate },
    status: { $in: ['Planned', 'Active'] }
  });

  for (const milestone of milestones) {
    // Prevent duplicate alert in last 24h
    const alreadySent = await Notification.findOne({
      type: 'MILESTONE_ALERT',
      entityId: milestone._id.toString(),
      title: /due soon/i,
      createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
    });

    if (alreadySent) continue;

    await NotificationService.triggerEvent('MILESTONE_DUE_SOON', {
      milestone,
      workspaceId: milestone.workspace_id
    });
  }
};

const handleOverdueMilestones = async () => {
  console.log('Running cron: check-overdue-milestones');
  const NotificationService = require('../services/NotificationService');

  const milestones = await Milestone.find({
    due_date: { $lt: new Date() },
    status: { $in: ['Planned', 'Active'] }
  });

  for (const milestone of milestones) {
    // Prevent duplicate alert in last 24h
    const alreadySent = await Notification.findOne({
      type: 'MILESTONE_ALERT',
      entityId: milestone._id.toString(),
      title: /overdue/i,
      createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
    });

    if (alreadySent) continue;

    await NotificationService.triggerEvent('MILESTONE_OVERDUE', {
      milestone,
      workspaceId: milestone.workspace_id
    });
  }
};

agenda.define('check-due-tomorrow', async (job) => {
  console.log('Processing check-due-tomorrow job');
  await handleDueTomorrow();
  await handleDueSoonMilestones();
});

agenda.define('check-overdue-tasks', async (job) => {
  console.log('Processing check-overdue-tasks job');
  await handleOverdueTasks();
  await handleOverdueMilestones();
});

agenda.define('send-weekly-summary', async (job) => {
  console.log('Processing send-weekly-summary job');
  await handleWeeklySummary();
});

// Function to schedule cron repeatable jobs using Agenda
const scheduleCronJobs = async () => {
  try {
    // agenda.every(interval, name) automatically upserts/updates repeating jobs to prevent duplicates.
    await agenda.every('1 hour', 'check-due-tomorrow');
    await agenda.every('1 hour', 'check-overdue-tasks');
    await agenda.every('0 9 * * 1', 'send-weekly-summary'); // Every Monday at 9:00 AM

    console.log('Cron jobs successfully scheduled in Agenda.');
  } catch (err) {
    console.error('Error scheduling cron repeatable jobs in Agenda:', err.message);
  }
};

module.exports = {
  scheduleCronJobs
};
