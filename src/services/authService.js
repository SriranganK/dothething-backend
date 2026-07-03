const User = require('../models/User');
const WorkspaceMember = require('../models/WorkspaceMember');
const Invitation = require('../models/Invitation');
const jwt = require('jsonwebtoken');
const ActivityService = require('./ActivityService');

/**
 * Generate a JWT token for a user
 * @param {string} id - User ID
 * @returns {string} - Signed JWT token
 */
const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });
};

/**
 * Register a new user
 * @param {Object} userData - User registration data (name, email, password)
 * @returns {Promise<Object>} - The registered user and token
 */
const registerUser = async (userData) => {
  const { name, email, password, designation, company, phone, department, location, timezone, status } = userData;

  // Check if user already exists
  const userExists = await User.findOne({ email });
  if (userExists) {
    throw new Error('User already exists');
  }

  // Create user
  const user = await User.create({
    name,
    email,
    password,
    designation: designation || '',
    company: company || '',
    phone: phone || '',
    department: department || '',
    location: location || '',
    timezone: timezone || '',
    status: status || 'Active',
  });

  if (!user) {
    throw new Error('Invalid user data');
  }

  // Trigger registration welcome events
  const NotificationService = require('./NotificationService');
  NotificationService.triggerEvent('USER_REGISTERED', { user })
    .catch(err => console.error('Error triggering welcome event:', err.message));

  // Auto-join user to workspaces they have pending invitations for
  const cleanEmail = email.toLowerCase().trim();
  const pendingInvites = await Invitation.find({ email: cleanEmail, status: 'PENDING' });
  for (const invite of pendingInvites) {
    await WorkspaceMember.findOneAndUpdate(
      { workspaceId: invite.workspaceId, userId: user._id },
      { $setOnInsert: { role: invite.role } },
      { upsert: true }
    );
    invite.status = 'ACCEPTED';
    await invite.save();

    await ActivityService.log({
      actorId: user._id,
      workspaceId: invite.workspaceId,
      actionType: 'MEMBER_ADDED',
      newValue: user.name || user.email,
      metadata: { memberId: user._id, memberEmail: user.email, role: invite.role }
    });
  }

  const token = generateToken(user._id);

  return {
    user: {
      id: user._id,
      name: user.name,
      email: user.email,
      designation: user.designation || '',
      company: user.company || '',
      phone: user.phone || '',
      department: user.department || '',
      location: user.location || '',
      timezone: user.timezone || '',
      status: user.status || 'Active',
    },
    token,
  };
};

/**
 * Login an existing user
 * @param {string} email - User email
 * @param {string} password - User password
 * @returns {Promise<Object>} - The logged in user and token
 */
const loginUser = async (email, password) => {
  // Find user by email and explicitly select password
  const user = await User.findOne({ email }).select('+password');
  if (!user) {
    throw new Error('Invalid credentials');
  }

  // Check if password matches
  const isMatch = await user.matchPassword(password);
  if (!isMatch) {
    throw new Error('Invalid credentials');
  }

  // Check if MFA is required
  const Workspace = require('../models/Workspace');
  const userMemberships = await WorkspaceMember.find({ userId: user._id });
  const workspaceIds = userMemberships.map(m => m.workspaceId);
  const mfaWorkspaces = await Workspace.find({ _id: { $in: workspaceIds }, mfaEnforced: true });
  const isMfaRequired = mfaWorkspaces.length > 0 || user.twoFactorEnabled === true;

  if (isMfaRequired) {
    const tempToken = jwt.sign({ id: user._id, isTemp: true }, process.env.JWT_SECRET, { expiresIn: '5m' });
    return {
      mfaRequired: true,
      tempToken,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
      }
    };
  }

  const token = generateToken(user._id);
  
  return {
    user: {
      id: user._id,
      name: user.name,
      email: user.email,
      designation: user.designation || '',
      company: user.company || '',
      phone: user.phone || '',
      department: user.department || '',
      location: user.location || '',
      timezone: user.timezone || '',
      status: user.status || 'Active',
      twoFactorEnabled: user.twoFactorEnabled || false,
    },
    token,
  };
};

/**
 * Check if the email domain requires SSO
 */
const checkSSO = async (email) => {
  const cleanEmail = email.toLowerCase().trim();
  const user = await User.findOne({ email: cleanEmail });
  if (!user) {
    return { ssoRequired: false };
  }

  const Workspace = require('../models/Workspace');
  const userMemberships = await WorkspaceMember.find({ userId: user._id });
  const workspaceIds = userMemberships.map(m => m.workspaceId);
  const ssoWorkspaces = await Workspace.find({ _id: { $in: workspaceIds }, ssoEnabled: true });
  
  return { ssoRequired: ssoWorkspaces.length > 0 };
};

/**
 * Handle simulated SSO Login
 */
const ssoLogin = async (email, name) => {
  const cleanEmail = email.toLowerCase().trim();
  let user = await User.findOne({ email: cleanEmail });
  
  if (!user) {
    // Auto-onboard SSO users if they don't exist
    user = await User.create({
      name: name || email.split('@')[0],
      email: cleanEmail,
      password: Math.random().toString(36).slice(-10), // random dummy password
      company: 'SSO Federated Enterprise',
      designation: 'Staff Associate',
    });
  }

  const token = generateToken(user._id);
  return {
    user: {
      id: user._id,
      name: user.name,
      email: user.email,
      designation: user.designation || '',
      company: user.company || '',
      phone: user.phone || '',
      department: user.department || '',
      location: user.location || '',
      timezone: user.timezone || '',
      status: user.status || 'Active',
      twoFactorEnabled: user.twoFactorEnabled || false,
    },
    token,
  };
};

/**
 * Verify temp token and 2FA Code
 */
const verifyMFA = async (tempToken, code) => {
  if (code !== '123456') {
    throw new Error('Invalid verification code');
  }

  const decoded = jwt.verify(tempToken, process.env.JWT_SECRET);
  if (!decoded || decoded.isTemp !== true) {
    throw new Error('Invalid temporary session token');
  }

  const user = await User.findById(decoded.id);
  if (!user) {
    throw new Error('User account not found');
  }

  const token = generateToken(user._id);
  return {
    user: {
      id: user._id,
      name: user.name,
      email: user.email,
      designation: user.designation || '',
      company: user.company || '',
      phone: user.phone || '',
      department: user.department || '',
      location: user.location || '',
      timezone: user.timezone || '',
      status: user.status || 'Active',
      twoFactorEnabled: user.twoFactorEnabled || false,
    },
    token,
  };
};

/**
 * Get user by id
 * @param {string} id - User ID
 * @returns {Promise<Object>} - User details
 */
const getUserById = async (id) => {
  const user = await User.findById(id);
  if (!user) {
    throw new Error('User not found');
  }
  return {
    id: user._id,
    name: user.name,
    email: user.email,
    designation: user.designation || '',
    company: user.company || '',
    phone: user.phone || '',
    department: user.department || '',
    location: user.location || '',
    timezone: user.timezone || '',
    status: user.status || 'Active',
  };
};

module.exports = {
  registerUser,
  loginUser,
  getUserById,
  generateToken,
  checkSSO,
  ssoLogin,
  verifyMFA,
};
