const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '../.env') });

const mongoUri = process.env.MONGO_URI || 'mongodb+srv://dothething:dothething@cluster0.3iayb.mongodb.net/';

const workspaceId = '6a195c9f600fd00ae2a6ab88'; // Best Workspace
const ownerId = '6a193ae5e74d447008b5b454';     // Srirangan K

async function run() {
  try {
    await mongoose.connect(mongoUri);
    console.log('Connected to MongoDB');

    // Register schemas
    const User = require('./models/User');
    const Workspace = require('./models/Workspace');
    const Board = require('./models/Board');
    const Item = require('./models/Item');
    const Milestone = require('./models/Milestone');
    const Label = require('./models/Label');
    const TaskLabel = require('./models/TaskLabel');
    const ActivityLog = require('./models/ActivityLog');

    // Clean existing boards, items, milestones, labels, tasklabels, activity logs for this workspace
    console.log('Cleaning up existing data...');
    const existingBoards = await Board.find({ workspace: workspaceId });
    const boardIds = existingBoards.map(b => b._id);

    await Item.deleteMany({ board: { $in: boardIds } });
    await Board.deleteMany({ workspace: workspaceId });
    await Milestone.deleteMany({ workspace_id: workspaceId });
    await Label.deleteMany({ workspace_id: workspaceId });
    await ActivityLog.deleteMany({ workspaceId: workspaceId });

    console.log('Creating Milestones...');
    const ms1 = await Milestone.create({
      workspace_id: workspaceId,
      name: 'Sprint 1 - Foundation',
      description: 'Setup database and core API endpoints',
      color: '#3b82f6',
      start_date: new Date(),
      due_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 1 week
      status: 'Active',
      created_by: ownerId
    });

    const ms2 = await Milestone.create({
      workspace_id: workspaceId,
      name: 'Sprint 2 - Dashboard',
      description: 'Build premium dashboard homepage layout',
      color: '#8b5cf6',
      start_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      due_date: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000), // 2 weeks
      status: 'Planned',
      created_by: ownerId
    });

    console.log('Creating Labels...');
    const lblFeature = await Label.create({ workspace_id: workspaceId, name: 'Feature', color: '#4f46e5', description: 'New features' });
    const lblBug = await Label.create({ workspace_id: workspaceId, name: 'Bug', color: '#ef4444', description: 'Bug fixes' });
    const lblDocs = await Label.create({ workspace_id: workspaceId, name: 'Docs', color: '#10b981', description: 'Documentation work' });
    const lblDesign = await Label.create({ workspace_id: workspaceId, name: 'Design', color: '#f59e0b', description: 'UI/UX designs' });

    console.log('Creating Boards and Columns...');
    const boardTracker = await Board.create({
      name: 'Tracker Apps',
      workspace: workspaceId,
      owner: ownerId,
      columns: [
        { id: 'todo', name: 'To Do', order: 0 },
        { id: 'progress', name: 'In Progress', order: 1 },
        { id: 'done', name: 'Done', order: 2, isDone: true }
      ]
    });

    const boardHiring = await Board.create({
      name: 'Hiring Pipeline',
      workspace: workspaceId,
      owner: ownerId,
      columns: [
        { id: 'sourced', name: 'Sourced', order: 0 },
        { id: 'phone', name: 'Phone Screen', order: 1 },
        { id: 'interview', name: 'Interview', order: 2 },
        { id: 'offer', name: 'Offer', order: 3, isDone: true }
      ]
    });

    const boardProduct = await Board.create({
      name: 'Product Roadmap',
      workspace: workspaceId,
      owner: ownerId,
      columns: [
        { id: 'backlog', name: 'Backlog', order: 0 },
        { id: 'progress', name: 'In Progress', order: 1 },
        { id: 'review', name: 'Review', order: 2 },
        { id: 'done', name: 'Done', order: 3, isDone: true }
      ]
    });

    const boardMarketing = await Board.create({
      name: 'Marketing Campaigns',
      workspace: workspaceId,
      owner: ownerId,
      columns: [
        { id: 'planned', name: 'Planned', order: 0 },
        { id: 'live', name: 'Live', order: 1 },
        { id: 'completed', name: 'Completed', order: 2, isDone: true }
      ]
    });

    const boardDesign = await Board.create({
      name: 'Design System',
      workspace: workspaceId,
      owner: ownerId,
      columns: [
        { id: 'ideas', name: 'Ideas', order: 0 },
        { id: 'progress', name: 'In Progress', order: 1 },
        { id: 'review', name: 'Review', order: 2 },
        { id: 'done', name: 'Done', order: 3, isDone: true }
      ]
    });

    console.log('Seeding Tasks (Items)...');
    
    // Tracker Apps tasks
    const t1 = await Item.create({ board: boardTracker._id, columnId: 'todo', title: 'Setup redux stores and slices', type: 'Task', priority: 'Medium', milestone_id: ms1._id, assignee: 'srirangankannan31@gmail.com' });
    const t2 = await Item.create({ board: boardTracker._id, columnId: 'progress', title: 'Connect to MongoDB cluster', type: 'Task', priority: 'High', milestone_id: ms1._id, assignee: 'srirangankannan31@gmail.com' });
    const t3 = await Item.create({ board: boardTracker._id, columnId: 'done', title: 'Initiate react boilerplate project', type: 'Task', priority: 'Lowest', milestone_id: ms1._id, assignee: 'srirangankannan31@gmail.com' });

    // Hiring Pipeline tasks
    const h1 = await Item.create({ board: boardHiring._id, columnId: 'sourced', title: 'Review resumes for Senior Frontend engineer', type: 'Task', priority: 'Low', assignee: 'srinath25kannan@gmail.com' });
    const h2 = await Item.create({ board: boardHiring._id, columnId: 'phone', title: 'Initial phone calls screening', type: 'Task', priority: 'Medium', assignee: 'srinath25kannan@gmail.com' });
    const h3 = await Item.create({ board: boardHiring._id, columnId: 'interview', title: 'Technical coding session interview', type: 'Task', priority: 'High', assignee: 'srirangankannan31@gmail.com' });
    const h4 = await Item.create({ board: boardHiring._id, columnId: 'offer', title: 'Draft and release employment offer letter', type: 'Task', priority: 'Critical', assignee: 'srirangankannan31@gmail.com' });

    // Design System tasks
    const d1 = await Item.create({ board: boardDesign._id, columnId: 'ideas', title: 'Collect UI patterns from Notion and Linear', type: 'Research', priority: 'Low', assignee: 'srirangankannan31@gmail.com' });
    const d2 = await Item.create({ board: boardDesign._id, columnId: 'progress', title: 'Refactor tailwind theme configurations', type: 'Feature', priority: 'Medium', assignee: 'srinath25kannan@gmail.com' });
    const d3 = await Item.create({ board: boardDesign._id, columnId: 'review', title: 'Review dark mode token rules', type: 'Documentation', priority: 'High', assignee: 'srirangankannan31@gmail.com' });
    const d4 = await Item.create({ board: boardDesign._id, columnId: 'done', title: 'Design system typography components', type: 'Feature', priority: 'High', assignee: 'srirangankannan31@gmail.com' });

    console.log('Mapping TaskLabels...');
    await TaskLabel.create({ task_id: t1._id, label_id: lblFeature._id });
    await TaskLabel.create({ task_id: t2._id, label_id: lblFeature._id });
    await TaskLabel.create({ task_id: t3._id, label_id: lblDocs._id });
    await TaskLabel.create({ task_id: h3._id, label_id: lblFeature._id });
    await TaskLabel.create({ task_id: d1._id, label_id: lblDesign._id });
    await TaskLabel.create({ task_id: d2._id, label_id: lblFeature._id });
    await TaskLabel.create({ task_id: d3._id, label_id: lblDocs._id });
    await TaskLabel.create({ task_id: d4._id, label_id: lblDesign._id });

    console.log('Creating ActivityLogs...');
    await ActivityLog.create({ actorId: ownerId, workspaceId, boardId: boardTracker._id, taskId: t2._id, actionType: 'STATUS_CHANGED', newValue: 'In Progress', metadata: { taskTitle: t2.title } });
    await ActivityLog.create({ actorId: ownerId, workspaceId, boardId: boardDesign._id, taskId: d4._id, actionType: 'TASK_CREATED', metadata: { taskTitle: d4.title } });
    await ActivityLog.create({ actorId: ownerId, workspaceId, boardId: boardTracker._id, taskId: t1._id, actionType: 'COMMENT_ADDED', metadata: { taskTitle: t1.title } });
    await ActivityLog.create({ actorId: ownerId, workspaceId, boardId: boardHiring._id, taskId: h4._id, actionType: 'TASK_ASSIGNED', newValue: 'Srirangan K', metadata: { taskTitle: h4.title } });

    console.log('Workspace data populated successfully.');
  } catch (err) {
    console.error(err);
  } finally {
    await mongoose.connection.close();
  }
}

run();
