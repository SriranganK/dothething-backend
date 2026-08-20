const Workspace = require('../models/Workspace');
const WorkspaceMember = require('../models/WorkspaceMember');
const Invitation = require('../models/Invitation');
const User = require('../models/User');
const Board = require('../models/Board');
const Item = require('../models/Item');
const emailService = require('../services/emailService');
const ActivityService = require('../services/ActivityService');

/**
 * @desc    Get all workspaces for the authenticated user (owned or member)
 * @route   GET /api/workspaces
 * @access  Private
 */
const getWorkspaces = async (req, res) => {
  try {
    // 1. Ensure owner membership exists for all workspaces owned by the user
    const ownedWorkspaces = await Workspace.find({ owner: req.user._id });
    for (const ws of ownedWorkspaces) {
      await WorkspaceMember.findOneAndUpdate(
        { workspaceId: ws._id, userId: req.user._id },
        { $setOnInsert: { role: 'OWNER' } },
        { upsert: true, returnDocument: 'after' }
      );
    }

    // 2. Handle legacy workspace.members array (email matching)
    const userEmail = req.user.email.toLowerCase().trim();
    const legacyWorkspaces = await Workspace.find({ members: userEmail });
    for (const ws of legacyWorkspaces) {
      await WorkspaceMember.findOneAndUpdate(
        { workspaceId: ws._id, userId: req.user._id },
        { $setOnInsert: { role: 'MEMBER' } },
        { upsert: true, returnDocument: 'after' }
      );
    }

    // 3. Retrieve all memberships for the user
    const memberships = await WorkspaceMember.find({ userId: req.user._id })
      .populate({
        path: 'workspaceId',
        populate: {
          path: 'owner',
          select: 'name email'
        }
      });

    // Format output to match original workspace response structure, attaching role
    const workspaces = memberships
      .filter(m => m.workspaceId !== null)
      .map(m => {
        const ws = m.workspaceId.toObject();
        return {
          ...ws,
          role: m.role, // Attach the user's role in this workspace
        };
      });

    res.status(200).json({ workspaces });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/**
 * @desc    Check if a workspace exists for the user (as owner or member)
 * @route   GET /api/workspaces/check
 * @access  Private
 */
const checkWorkspace = async (req, res) => {
  try {
    // Check WorkspaceMember first
    let membership = await WorkspaceMember.findOne({ userId: req.user._id })
      .populate({
        path: 'workspaceId',
        populate: {
          path: 'owner',
          select: 'name email'
        }
      });

    if (!membership) {
      // Run migration check fallback
      const userEmail = req.user.email.toLowerCase().trim();
      const legacyWs = await Workspace.findOne({
        $or: [
          { owner: req.user._id },
          { members: userEmail }
        ]
      });

      if (legacyWs) {
        const role = legacyWs.owner.toString() === req.user._id.toString() ? 'OWNER' : 'MEMBER';
        membership = await WorkspaceMember.create({
          workspaceId: legacyWs._id,
          userId: req.user._id,
          role
        });
        
        membership = await WorkspaceMember.findById(membership._id).populate({
          path: 'workspaceId',
          populate: {
            path: 'owner',
            select: 'name email'
          }
        });
      }
    }

    if (!membership || !membership.workspaceId) {
      return res.status(200).json({ exists: false });
    }

    const ws = membership.workspaceId.toObject();
    res.status(200).json({
      exists: true,
      workspace: {
        ...ws,
        role: membership.role
      }
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/**
 * @desc    Create a new workspace
 * @route   POST /api/workspaces
 * @access  Private
 */
const createWorkspace = async (req, res) => {
  try {
    const { name, type, teamSize, industry, members } = req.body;

    const finalType = type || 'Personal';
    const finalTeamSize = teamSize || 'Just me';
    const finalIndustry = (industry && industry.trim()) ? industry.trim() : 'General';

    if (!name || !name.trim()) {
      return res.status(400).json({ message: 'Workspace name is required' });
    }

    // Clean member emails
    const ownerEmail = req.user.email.toLowerCase().trim();
    const cleanMembers = (members || [])
      .map(email => email.toLowerCase().trim())
      .filter(email => email && email !== ownerEmail);

    const workspace = await Workspace.create({
      name: name.trim(),
      type: finalType,
      teamSize: finalTeamSize,
      industry: finalIndustry,
      owner: req.user._id,
      members: cleanMembers,
    });

    // Create a WorkspaceMember record for the OWNER
    await WorkspaceMember.create({
      workspaceId: workspace._id,
      userId: req.user._id,
      role: 'OWNER'
    });

    await ActivityService.log({
      actorId: req.user._id,
      workspaceId: workspace._id,
      actionType: 'MEMBER_ADDED',
      newValue: req.user.name || req.user.email,
      metadata: { memberId: req.user._id, memberEmail: req.user.email, role: 'OWNER' }
    });

    // Handle invitees
    if (cleanMembers.length > 0) {
      for (const email of cleanMembers) {
        const existingUser = await User.findOne({ email });
        if (existingUser) {
          // If already in the system, add directly as MEMBER
          await WorkspaceMember.findOneAndUpdate(
            { workspaceId: workspace._id, userId: existingUser._id },
            { $setOnInsert: { role: 'MEMBER' } },
            { upsert: true }
          );

          await ActivityService.log({
            actorId: req.user._id,
            workspaceId: workspace._id,
            actionType: 'MEMBER_ADDED',
            newValue: existingUser.name || existingUser.email,
            metadata: { memberId: existingUser._id, memberEmail: existingUser.email, role: 'MEMBER' }
          });
        } else {
          // If not in the system, create pending invitation
          await Invitation.create({
            workspaceId: workspace._id,
            email,
            role: 'MEMBER',
            invitedBy: req.user._id,
            status: 'PENDING'
          });
        }
        
        emailService.sendInviteEmail(email, req.user.name, name)
          .catch(err => console.error(`Error sending email to ${email}:`, err.message));
      }
    }

    // Attach role: 'OWNER' for the creator's immediate frontend state
    const workspaceObj = workspace.toObject();
    workspaceObj.role = 'OWNER';

    res.status(201).json({ success: true, workspace: workspaceObj });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

/**
 * @desc    Get all members and pending invitations for a workspace
 * @route   GET /api/workspaces/:workspaceId/members
 * @access  Private
 */
const getWorkspaceMembers = async (req, res) => {
  try {
    const { workspaceId } = req.params;

    const members = await WorkspaceMember.find({ workspaceId })
      .populate('userId', 'name email')
      .sort({ role: 1, createdAt: 1 });

    const invitations = await Invitation.find({ workspaceId, status: 'PENDING' })
      .populate('invitedBy', 'name email')
      .sort({ createdAt: -1 });

    res.status(200).json({ members, invitations });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/**
 * @desc    Invite a member to a workspace (or add directly if they exist)
 * @route   POST /api/workspaces/:workspaceId/members/invite
 * @access  Private
 */
const inviteWorkspaceMember = async (req, res) => {
  try {
    const { workspaceId } = req.params;
    const { email, role } = req.body;

    if (!email || !role) {
      return res.status(400).json({ message: 'Email and role are required' });
    }

    const cleanEmail = email.toLowerCase().trim();
    const workspace = await Workspace.findById(workspaceId);
    if (!workspace) {
      return res.status(404).json({ message: 'Workspace not found' });
    }

    // Check if user is already a member
    const existingUser = await User.findOne({ email: cleanEmail });
    if (existingUser) {
      const isMember = await WorkspaceMember.findOne({ workspaceId, userId: existingUser._id });
      if (isMember) {
        return res.status(400).json({ message: 'User is already a member of this workspace' });
      }

      const member = await WorkspaceMember.create({
        workspaceId,
        userId: existingUser._id,
        role
      });

      await ActivityService.log({
        actorId: req.user._id,
        workspaceId,
        actionType: 'MEMBER_ADDED',
        newValue: existingUser.name || existingUser.email,
        metadata: { memberId: existingUser._id, memberEmail: existingUser.email, role }
      });

      // Send mail notification
      emailService.sendInviteEmail(cleanEmail, req.user.name, workspace.name)
        .catch(err => console.error(`Error sending email to ${cleanEmail}:`, err.message));

      return res.status(201).json({
        success: true,
        message: 'User added to workspace successfully',
        member
      });
    }

    // Check if there is already a pending invitation
    const existingInvite = await Invitation.findOne({ workspaceId, email: cleanEmail, status: 'PENDING' });
    if (existingInvite) {
      existingInvite.role = role;
      await existingInvite.save();
      return res.status(200).json({
        success: true,
        message: 'Updated existing pending invitation role',
        invitation: existingInvite
      });
    }

    // Create pending invitation
    const invitation = await Invitation.create({
      workspaceId,
      email: cleanEmail,
      role,
      invitedBy: req.user._id,
      status: 'PENDING'
    });

    // Send email
    emailService.sendInviteEmail(cleanEmail, req.user.name, workspace.name)
      .catch(err => console.error(`Error sending email to ${cleanEmail}:`, err.message));

    res.status(201).json({
      success: true,
      message: 'Invitation sent successfully',
      invitation
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/**
 * @desc    Update a member's role
 * @route   PUT /api/workspaces/:workspaceId/members/:memberId
 * @access  Private
 */
const updateWorkspaceMemberRole = async (req, res) => {
  try {
    const { workspaceId, memberId } = req.params;
    const { role } = req.body;

    if (!role) {
      return res.status(400).json({ message: 'Role is required' });
    }

    const member = await WorkspaceMember.findById(memberId);
    if (!member || member.workspaceId.toString() !== workspaceId) {
      return res.status(404).json({ message: 'Workspace member not found' });
    }

    if (member.role === 'OWNER') {
      return res.status(400).json({ message: 'Cannot modify role of the workspace Owner' });
    }

    member.role = role;
    await member.save();

    res.status(200).json({ success: true, member });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/**
 * @desc    Remove a member from a workspace
 * @route   DELETE /api/workspaces/:workspaceId/members/:memberId
 * @access  Private
 */
const removeWorkspaceMember = async (req, res) => {
  try {
    const { workspaceId, memberId } = req.params;

    const member = await WorkspaceMember.findById(memberId);
    if (!member || member.workspaceId.toString() !== workspaceId) {
      return res.status(404).json({ message: 'Workspace member not found' });
    }

    const memberUser = await User.findById(member.userId);
    const memberName = memberUser ? (memberUser.name || memberUser.email) : 'Unknown User';

    await ActivityService.log({
      actorId: req.user._id,
      workspaceId,
      actionType: 'MEMBER_REMOVED',
      oldValue: memberName,
      metadata: { memberId: member.userId, memberEmail: memberUser ? memberUser.email : '' }
    });

    await member.deleteOne();

    res.status(200).json({ success: true, message: 'Member removed successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/**
 * @desc    Cancel a pending invitation
 * @route   DELETE /api/workspaces/:workspaceId/invitations/:invitationId
 * @access  Private
 */
const cancelInvitation = async (req, res) => {
  try {
    const { workspaceId, invitationId } = req.params;

    const invitation = await Invitation.findOne({ _id: invitationId, workspaceId });
    if (!invitation) {
      return res.status(404).json({ message: 'Invitation not found' });
    }

    await invitation.deleteOne();

    res.status(200).json({ success: true, message: 'Invitation cancelled successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/**
 * @desc    Update workspace details
 * @route   PUT /api/workspaces/:workspaceId
 * @access  Private
 */
const updateWorkspace = async (req, res) => {
  try {
    const { workspaceId } = req.params;
    const { name, type, teamSize, industry, ssoEnabled, mfaEnforced } = req.body;

    const workspace = await Workspace.findById(workspaceId);
    if (!workspace) {
      return res.status(404).json({ message: 'Workspace not found' });
    }

    if (name !== undefined) workspace.name = name;
    if (type !== undefined) workspace.type = type;
    if (teamSize !== undefined) workspace.teamSize = teamSize;
    if (industry !== undefined) workspace.industry = industry;
    if (ssoEnabled !== undefined) workspace.ssoEnabled = ssoEnabled;
    if (mfaEnforced !== undefined) workspace.mfaEnforced = mfaEnforced;

    await workspace.save();
    
    // Format response back
    const workspaceObj = workspace.toObject();
    // Get requester's role
    const member = await WorkspaceMember.findOne({ workspaceId, userId: req.user._id });
    workspaceObj.role = member ? member.role : null;

    res.status(200).json({ success: true, workspace: workspaceObj });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/**
 * @desc    Delete workspace and all associated boards, items, memberships, and invites
 * @route   DELETE /api/workspaces/:workspaceId
 * @access  Private
 */
const deleteWorkspace = async (req, res) => {
  try {
    const { workspaceId } = req.params;

    const workspace = await Workspace.findById(workspaceId);
    if (!workspace) {
      return res.status(404).json({ message: 'Workspace not found' });
    }

    // Delete all WorkspaceMember records
    await WorkspaceMember.deleteMany({ workspaceId });
    
    // Delete all invitations
    await Invitation.deleteMany({ workspaceId });

    // Delete all boards in this workspace and their items
    const boards = await Board.find({ workspace: workspaceId });
    for (const board of boards) {
      await Item.deleteMany({ board: board._id });
      await board.deleteOne();
    }

    // Delete the workspace itself
    await workspace.deleteOne();

    res.status(200).json({ success: true, message: 'Workspace and all associated data deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  checkWorkspace,
  createWorkspace,
  getWorkspaces,
  getWorkspaceMembers,
  inviteWorkspaceMember,
  updateWorkspaceMemberRole,
  removeWorkspaceMember,
  cancelInvitation,
  updateWorkspace,
  deleteWorkspace,
};

