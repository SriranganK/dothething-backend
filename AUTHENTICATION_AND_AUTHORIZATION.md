# Authentication and Authorization Architecture

This document explains the security architecture of the **DoTheThing Backend**, detailing how **Authentication (AuthN)** and **Authorization / Role-Based Access Control (RBAC)** are implemented.

---

## 1. System Overview

The security layer is divided into two distinct responsibilities:

1. **Authentication (AuthN)**: Confirms user identity using JSON Web Tokens (JWT), hashed passwords, Single Sign-On (SSO), and Multi-Factor Authentication (MFA).
2. **Authorization (AuthZ)**: Enforces Role-Based Access Control (RBAC) across three context levels: **Workspace Level**, **Board Level**, and **Task/Item Level**.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           Incoming HTTP Request                             │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ 1. AUTHENTICATION (protect middleware)                                      │
│    - Extracts "Authorization: Bearer <token>"                               │
│    - Verifies JWT Signature using JWT_SECRET                                │
│    - Loads User document and attaches to req.user                           │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ 2. WORKSPACE / BOARD CONTEXT (RBAC Middleware)                              │
│    - Finds user's role in WorkspaceMember / BoardMember                     │
│    - Checks Board Visibility (WORKSPACE vs PRIVATE)                         │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ 3. PERMISSION CHECK (requirePermission / requireBoardPermission)            │
│    - Evaluates role against PERMISSIONS matrix                              │
│    - Denies access (403 Forbidden) or passes to Controller (next())         │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Authentication (AuthN)

Authentication logic is centered in:
- [src/middlewares/auth.js](file:///d:/Srirangan/dothething-backend/src/middlewares/auth.js)
- [src/services/authService.js](file:///d:/Srirangan/dothething-backend/src/services/authService.js)
- [src/routes/authRoutes.js](file:///d:/Srirangan/dothething-backend/src/routes/authRoutes.js)

### Password Hashing & User Registration (`registerUser`)
- Passwords are encrypted before storing in MongoDB using **`bcryptjs`** inside the `User` schema pre-save hook.
- Upon registration, the system automatically checks for any **pending workspace invitations** sent to the user's email address (`Invitation` model), auto-joins them to the corresponding workspaces with assigned roles, and logs activity events.

### JWT Token Generation & Verification
- **Token Format**: Standard Bearer Token included in headers:
  `Authorization: Bearer <JWT_TOKEN>`
- **Token Signing**: Generated using `jsonwebtoken` with `JWT_SECRET` and configurable expiry (`JWT_EXPIRES_IN`, default 7 days).
- **Protection Middleware (`protect`)**:
  1. Parses header: `req.headers.authorization`.
  2. Verifies token integrity via `jwt.verify()`.
  3. Decodes user ID and queries MongoDB: `User.findById(decoded.id)`.
  4. Attaches user object to `req.user`.

### Multi-Factor Authentication (MFA / 2FA) Flow
If a user belongs to a workspace enforcing MFA or has `twoFactorEnabled: true`:
1. `loginUser()` detects MFA requirement and generates a **temporary 5-minute token** containing `{ id: user._id, isTemp: true }`.
2. Returns `{ mfaRequired: true, tempToken }` to the client.
3. User submits verification code to `verifyMFA(tempToken, code)`.
4. Upon successful code verification, the backend issues the full authentication JWT.

### Single Sign-On (SSO) Flow (`checkSSO`, `ssoLogin`)
- Allows domain-level SSO checks (`POST /api/auth/check-sso`).
- If workspace SSO is enabled, federated users are logged in or auto-onboarded via `ssoLogin()`, generating standard JWT sessions.

---

## 3. Authorization & Role-Based Access Control (RBAC)

Authorization logic is centered in:
- [src/services/authorizationService.js](file:///d:/Srirangan/dothething-backend/src/services/authorizationService.js)
- [src/middlewares/rbac.js](file:///d:/Srirangan/dothething-backend/src/middlewares/rbac.js)
- [src/constants/permissions.js](file:///d:/Srirangan/dothething-backend/src/constants/permissions.js)
- [src/constants/roles.js](file:///d:/Srirangan/dothething-backend/src/constants/roles.js)

### Context Hierarchy
Authorization is scoped hierarchically across three tiers:

```
[Workspace] ──► [Board] ──► [Task / Item]
```

### Roles (`src/constants/roles.js`)
The application defines 4 primary workspace roles:
- **`OWNER`**: Creator / administrator of the workspace. Full access to manage workspace, billing, settings, members, boards, and tasks.
- **`ADMIN`**: Manager role with administrative privileges over settings, members, boards, and tasks.
- **`MEMBER`**: Standard team member with access to create/update boards and create/update/delete tasks.
- **`GUEST`**: Restricted role with read-only view privileges (`board:view`, `task:view`).

### Granular Permission Matrix (`src/constants/permissions.js`)

| Permission Name | Owner | Admin | Member | Guest | Description |
| :--- | :---: | :---: | :---: | :---: | :--- |
| `workspace:manage` | ✅ | ❌ | ❌ | ❌ | Manage workspace owner options |
| `workspace:delete` | ✅ | ❌ | ❌ | ❌ | Delete entire workspace |
| `workspace:settings` | ✅ | ✅ | ❌ | ❌ | Update workspace preferences |
| `members:invite` | ✅ | ✅ | ❌ | ❌ | Send invitation links |
| `members:manage` | ✅ | ✅ | ✅ | ❌ | View / manage workspace members |
| `board:create` | ✅ | ✅ | ✅ | ❌ | Create new project boards |
| `board:update` | ✅ | ✅ | ✅ | ❌ | Update board details/columns |
| `board:delete` | ✅ | ✅ | ❌ | ❌ | Delete project boards |
| `board:view` | ✅ | ✅ | ✅ | ✅ | View project board details |
| `task:create` | ✅ | ✅ | ✅ | ❌ | Create new tasks |
| `task:update` | ✅ | ✅ | ✅ | ❌ | Modify tasks, status, assignees |
| `task:delete` | ✅ | ✅ | ✅ | ❌ | Delete tasks |
| `task:view` | ✅ | ✅ | ✅ | ✅ | View task details |

### Board Visibility Control (`canAccessBoard`)
Board access relies on board-level visibility rules:
- **`WORKSPACE` Visibility**: Any verified member of the workspace can access the board using their workspace role.
- **`PRIVATE` Visibility**: Restricted access. A user MUST have an explicit `BoardMember` record attached to that board to gain access.

---

## 4. Middleware Execution Reference

Routes in the application combine authentication and RBAC middlewares in pipeline sequence:

```javascript
// Example Route Definition:
router.put(
  '/:id',
  protect,                                // 1. Verify User Identity (JWT)
  requireBoardPermission('board:update'), // 2. Verify Board Access & Permission
  updateBoard                             // 3. Controller Execution
);
```

### Middleware Summary

1. **`protect`**:
   Validates JWT Bearer token and attaches `req.user`.

2. **`requireWorkspaceMember`**:
   Extracts `workspaceId` (from params, query, or body), verifies user membership in `WorkspaceMember`, and attaches `req.workspaceRole`.

3. **`requirePermission(permission)`**:
   Checks if `req.workspaceRole` possesses the specified permission using `hasPermission()`.

4. **`requireBoardAccess`**:
   Verifies board existence, checks board visibility (`WORKSPACE` vs `PRIVATE`), and attaches `req.board` and `req.boardRole`.

5. **`requireBoardPermission(permission)`**:
   Combines board access verification and permission check into a single middleware.

6. **`requireItemPermission(permission)`**:
   Looks up task/item by ID or custom formatted key, verifies board visibility, and enforces task permissions.
