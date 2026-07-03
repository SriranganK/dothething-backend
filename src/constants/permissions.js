/**
 * Permission definitions for each role.
 * Designed to be extensible — add new actions here as features grow.
 */
const Role = require('./role');

const PERMISSIONS = {
  [Role.OWNER]: [
    'workspace:manage',
    'workspace:delete',
    'workspace:settings',
    'members:invite',
    'members:remove',
    'members:manage',
    'board:view',
    'board:create',
    'board:update',
    'board:delete',
    'task:view',
    'task:create',
    'task:update',
    'task:delete',
  ],
  [Role.ADMIN]: [
    'workspace:settings',
    'members:invite',
    'members:remove',
    'members:manage',
    'board:view',
    'board:create',
    'board:update',
    'board:delete',
    'task:view',
    'task:create',
    'task:update',
    'task:delete',
  ],
  [Role.MEMBER]: [
    'board:view',
    'board:create',
    'board:update',
    'task:view',
    'task:create',
    'task:update',
    'task:delete',
    'members:manage',
  ],
  [Role.GUEST]: [
    'board:view',
    'task:view',
  ],
};

/**
 * Check if a role has a specific permission
 * @param {string} role - The user's role
 * @param {string} permission - The permission to check
 * @returns {boolean}
 */
const hasPermission = (role, permission) => {
  const perms = PERMISSIONS[role];
  if (!perms) return false;
  return perms.includes(permission);
};

module.exports = { PERMISSIONS, hasPermission };
