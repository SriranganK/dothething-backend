# Role-Based Access Control (RBAC) Implementation Plan

Implement a robust, extensible Role-Based Access Control (RBAC) system for workspaces, boards, and tasks. It handles workspace-level invitations, role permissions (OWNER, ADMIN, MEMBER, GUEST), board visibilities (WORKSPACE, PRIVATE), hiding UI actions based on permissions, and a dedicated Workspace Profile page featuring board views and user CRUD operations.

## User Review Required

> [!IMPORTANT]
> **Data Migration Strategy**
> Since existing workspaces are stored with direct `owner` (ObjectId) and `members` (string array of emails), we will automatically migrate/upsert `WorkspaceMember` records on-the-fly when a user loads their workspace list or checks a workspace. This guarantees zero downtime and a smooth transition to the `WorkspaceMember`-driven RBAC system.

> [!WARNING]
> **Private Board Access Rules**
> In private boards, only explicitly assigned board members can access the board. Workspace OWNERs and ADMINs are not automatically added unless explicitly assigned, but as per enterprise practice, they retain full management rights over all boards in their workspace.

## Open Questions
- **Direct Workspace Addition vs Pending Invites**: If we invite a user by email, and they already have an account in the system, should they be added immediately to the workspace as a `WorkspaceMember`, or should we create a pending invitation that they have to accept? *(Proposed default: Add immediately to simplify onboarding for existing users, and send an email notification).*
- **Private Board Visibility**: Should workspace GUESTs be allowed to be added to PRIVATE boards? *(Proposed default: Yes, if explicitly added, but they retain GUEST (read-only) permission on that private board).*

---

## Proposed Changes

### Backend Components

We will update the backend services, controllers, routing, and middlewares to enforce roles and handle member invite/role CRUD.

---

#### [MODIFY] [workspaceController.js](file:///d:/Srirangan/dothething-backend/src/controllers/workspaceController.js)
- **`getWorkspaces`**: Query `WorkspaceMember` instead of `Workspace` direct queries. Run migration check to ensure `WorkspaceMember` records exist for legacy owner/members on-the-fly. Populate workspace details and attach `role` to the returned workspace.
- **`checkWorkspace`**: Fetch workspace using `WorkspaceMember` checking for the user, with legacy migration fallback.
- **`createWorkspace`**: Immediately create a `WorkspaceMember` record with role `OWNER` for the creator.
- **`getWorkspaceMembers`** [NEW]: Return all workspace members (populated with user info) and pending invitations for the workspace.
- **`inviteWorkspaceMember`** [NEW]: Check if invited email matches an existing user.
  - If user exists: create a `WorkspaceMember` record with the requested role.
  - If user does not exist: create an `Invitation` record with status `PENDING`.
  - Send email notification using `emailService`.
- **`updateWorkspaceMemberRole`** [NEW]: Modify the role of a user in `WorkspaceMember`. Prevent modifying the `OWNER`'s role.
- **`removeWorkspaceMember`** [NEW]: Remove a `WorkspaceMember`. Prevent removing the `OWNER`.
- **`cancelInvitation`** [NEW]: Cancel/delete a pending `Invitation`.

#### [MODIFY] [workspaceRoutes.js](file:///d:/Srirangan/dothething-backend/src/routes/workspaceRoutes.js)
- Wire up the new controllers using `protect`, `requireWorkspaceMember`, and `requirePermission` middlewares:
  - `GET /:workspaceId/members` -> `getWorkspaceMembers`
  - `POST /:workspaceId/members/invite` -> `requirePermission('members:invite')` -> `inviteWorkspaceMember`
  - `PUT /:workspaceId/members/:memberId` -> `requirePermission('members:manage')` -> `updateWorkspaceMemberRole`
  - `DELETE /:workspaceId/members/:memberId` -> `requirePermission('members:remove')` -> `removeWorkspaceMember`
  - `DELETE /:workspaceId/invitations/:invitationId` -> `requirePermission('members:invite')` -> `cancelInvitation`

#### [MODIFY] [authService.js](file:///d:/Srirangan/dothething-backend/src/services/authService.js)
- In `registerUser`, after user creation, find all pending `Invitation` records matching their email. For each invitation:
  - Create a `WorkspaceMember` record mapping them to the workspace with the specified role.
  - Mark invitation status as `ACCEPTED`.

#### [MODIFY] [rbac.js](file:///d:/Srirangan/dothething-backend/src/middlewares/rbac.js)
- **`requireItemPermission`** [NEW]: Middleware to verify if a user has permission to perform tasks on a specific item (fetches item -> verifies board access -> checks permission).
- Export `requireItemPermission`.

#### [MODIFY] [boardRoutes.js](file:///d:/Srirangan/dothething-backend/src/routes/boardRoutes.js)
- Apply permissions:
  - `GET /` -> `requireWorkspaceMember` (loads and filters boards using `canAccessBoard`)
  - `POST /` -> `requireWorkspaceMember`, `requirePermission('board:create')`
  - `PUT /:id` -> `requireBoardPermission('board:update')`
  - `DELETE /:id` -> `requireBoardPermission('board:delete')`
  - `GET /:boardId/items` -> `requireBoardPermission('task:view')`
  - `POST /:boardId/items` -> `requireBoardPermission('task:create')`

#### [MODIFY] [itemRoutes.js](file:///d:/Srirangan/dothething-backend/src/routes/itemRoutes.js)
- Apply permissions:
  - `PUT /:id` -> `requireItemPermission('task:update')`
  - `DELETE /:id` -> `requireItemPermission('task:delete')`

#### [MODIFY] [boardController.js](file:///d:/Srirangan/dothething-backend/src/controllers/boardController.js)
- **`getBoards`**: Filter boards through `canAccessBoard` helper. Return only boards the user can access and enrich with the effective role.
- **`createBoard`**: Accept `visibility` in request. If `PRIVATE`, create a `BoardMember` record for the creator.

---

### Frontend Components

We will update the frontend views to check for workspace roles and hide or show buttons and forms. We will also refactor `ProfilePage.tsx` into a Workspace Profile Page.

---

#### [MODIFY] [workspace.ts](file:///d:/Srirangan/dotheThing/src/types/workspace.ts)
- Add optional `role` and `visibility` fields:
  ```typescript
  export interface WorkspaceType {
    _id: string;
    name: string;
    type: string;
    teamSize: string;
    industry: string;
    owner: string | { _id: string; name: string; email: string };
    members: string[];
    role?: 'OWNER' | 'ADMIN' | 'MEMBER' | 'GUEST';
  }
  export interface BoardType {
    _id: string;
    name: string;
    workspace: string;
    columns: ColumnType[];
    owner: string | { _id: string; name: string; email: string };
    members?: { userId: string; role: string; name?: string }[];
    visibility: 'WORKSPACE' | 'PRIVATE';
    createdAt: string;
  }
  ```

#### [MODIFY] [Home.tsx](file:///d:/Srirangan/dotheThing/src/Pages/Home.tsx)
- Update `activeView` to support `{ type: "workspace-profile" }`.
- Render the new `<ProfilePage />` (passing workspace details, user role, token, and board list).
- Attach custom callbacks to `TopNavbar` and `WorkspaceSidebar` to enable navigate-to-profile actions.

#### [MODIFY] [TopNavbar.tsx](file:///d:/Srirangan/dotheThing/src/components/TopNavbar.tsx)
- Add `onProfileClick` prop and call it when clicking "Profile" in the user dropdown.

#### [MODIFY] [WorkspaceSidebar.tsx](file:///d:/Srirangan/dotheThing/src/components/WorkspaceSidebar.tsx)
- Add a sidebar navigation item: **Workspace Profile** (`activeView.type === "workspace-profile"`).
- Hide the "Create Board" plus button if the current workspace role is `GUEST`.
- Hide board "Delete" actions if the user role is `GUEST` or `MEMBER`.

#### [MODIFY] [WorkspaceDashboard.tsx](file:///d:/Srirangan/dotheThing/src/Pages/WorkspaceDashboard.tsx)
- Check `workspace?.role`.
- Hide "New Board" button if role is `GUEST`.
- Disable board delete actions in the dropdown for `GUEST` and `MEMBER` (who don't have board deletion rights).

#### [MODIFY] [WorkspaceBoard.tsx](file:///d:/Srirangan/dotheThing/src/Pages/WorkspaceBoard.tsx)
- Extract user's workspace/board role.
- If role is `GUEST` (View-only):
  - Disable renaming board title.
  - Hide/disable "New Task" buttons.
  - Hide add column, delete column, and rename column actions.
  - Disable card drag-and-drop/reordering.
  - Disable bulk action toolbar (like bulk delete/update).
- If role is `MEMBER` or `GUEST`:
  - Hide board member management buttons / invite capabilities (only ADMIN/OWNER can invite/manage).

#### [MODIFY] [ProfilePage.tsx](file:///d:/Srirangan/dotheThing/src/Pages/ProfilePage.tsx)
- Complete overhaul:
  - Header: Workspace Name, type, industry, owner, and active user's role badge (e.g. `Owner`, `Admin`, `Member`, `Guest`).
  - **Boards Tab**: Display a card grid of all workspace boards with their visibility badges (`WORKSPACE` vs `PRIVATE`). Allows navigation to boards.
  - **Members & Roles Tab**:
    - List all workspace members (avatar, name, email, role).
    - If user is OWNER or ADMIN: Show role change dropdowns (ADMIN, MEMBER, GUEST) and "Remove" action buttons.
    - If user is OWNER or ADMIN: Show "Invite Member" card with email input and role selector.
    - Show list of pending invitations. Show "Cancel Invitation" button for OWNER/ADMIN.
  - **Settings Tab**: Form to update workspace metadata (Name, type, industry) (disabled for GUEST/MEMBER).
    - If OWNER: Show red "Delete Workspace" button with confirmation alert.

---

## Verification Plan

### Automated Tests
We will verify that the server is operational and compile files cleanly:
- Build frontend: `npm run build` inside `d:\Srirangan\dotheThing`
- Run API request validation using `curl` or fetch tests if needed.

### Manual Verification
- Log in as workspace Owner, invite a user as Admin, another as Member, and another as Guest.
- Verify Guest cannot perform mutations (buttons hidden, drag-and-drop disabled, API returns 403).
- Verify Member can perform board/task creation and edits, but cannot see member management options or settings options.
- Verify Admin can invite and change roles of Members and Guests, but cannot change Owner's role.
- Verify Owner has access to all actions including deleting the workspace.
- Create a PRIVATE board and verify it is hidden from workspace members who are not assigned to it.
