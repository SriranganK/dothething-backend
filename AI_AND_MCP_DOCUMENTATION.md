# AI Integration & MCP Analysis in DoTheThing Backend

This document provides a comprehensive explanation of how Artificial Intelligence (AI) is integrated and utilized within the **DoTheThing Backend**, along with an analysis of **Model Context Protocol (MCP)** usage in this codebase.

---

## 1. MCP (Model Context Protocol) Status & Architecture

### Is standard MCP used in this backend?
Currently, standard **MCP (Model Context Protocol)** libraries/SDKs (such as `@modelcontextprotocol/sdk`) are **not directly imported as a dependency** in `package.json`.

### How the backend uses an MCP-like Context & Tool/Action Execution Pattern
Although standard MCP protocol endpoints are not running as a standalone protocol daemon, the backend strictly implements an **MCP-like design pattern** consisting of:

1. **Context Ingestion**: The backend fetches real-time environment state (boards, columns, tasks, members, workspace configuration) and passes it into system/user prompts as structured JSON context.
2. **Structured Action Dispatch**: Rather than returning unstructured text, LLMs (Groq / Grok) return structured JSON payloads containing explicit `actions` arrays (e.g. `update_task`, `assignee`, `columnId`, `dueDate`, `priority`, `labels`).
3. **Local Tool Execution**: The backend acts as the execution client/agent, parsing the actions returned by the LLM and performing atomic database mutations on MongoDB collections (`Item`, `Board`, `WorkspaceMember`, `TaskLabel`, `ActivityLog`).

```
┌─────────────────┐       1. Fetch Context & User Input       ┌────────────────────────┐
│  MongoDB Data   ├───────────────────────────────────────────►│                        │
│ (Boards/Items)  │                                           │   Express Controller   │
└─────────────────┘                                           │  (aiController.js)     │
         ▲                                                    │                        │
         │                3. Execute Actions & Mutate DB      └───────────┬────────────┘
         └─────────────────────────────────────────────────────────┐      │
                                                                   │      │ 2. Payload with Context
                                                                   │      ▼
┌─────────────────┐                                           ┌───┴────────────────────┐
│   AI Service    │◄──────────────────────────────────────────┤   Groq (Llama-3.3-70b) │
│ Structured JSON │        Return Reply + Action Payload       │  Fallback: Grok (xAI)  │
└─────────────────┘                                           └────────────────────────┘
```

---

## 2. Core AI Architecture & Resiliency Strategy

The primary engine for AI operations is encapsulated in [src/services/aiService.js](file:///d:/Srirangan/dothething-backend/src/services/aiService.js).

### Dual-Provider Fallback Architecture
To ensure high availability and prevent single points of failure, the backend implements a automated dual-provider fallback mechanism inside `getAICompletion`:

1. **Primary Provider — Groq API**:
   - **Model**: `llama-3.3-70b-versatile`
   - **Endpoint**: `https://api.groq.com/openai/v1/chat/completions`
   - **Speed/Latency**: High-throughput ultra-low latency inference.
2. **Secondary Fallback Provider — xAI (Grok API)**:
   - **Model**: `grok-beta`
   - **Endpoint**: `https://api.x.ai/v1/chat/completions`
   - Automatically triggered if Groq fails or rate limits.

### Safe JSON Parsing Strategy (`parseJSONResponse`)
All AI prompt calls request `response_format: { type: 'json_object' }`. To prevent runtime JSON deserialization errors when models output markdown code block wrappers (e.g. ````json ... ````), `aiService.js` incorporates regex-based extraction as a secondary fallback parser.

---

## 3. Detailed Breakdown of AI Capabilities

The backend exposes **9 core AI capabilities**, configured via [src/routes/aiRoutes.js](file:///d:/Srirangan/dothething-backend/src/routes/aiRoutes.js) and implemented in [src/controllers/aiController.js](file:///d:/Srirangan/dothething-backend/src/controllers/aiController.js):

### 1. Automated Project/Board Generation
- **Endpoint**: `POST /api/ai/workspace/:workspaceId/generate-board`
- **Function**: `generateBoard(prompt)`
- **Behavior**: Takes a single topic prompt (e.g. *"Mobile App Launch Plan"*) and generates a full project board with 3-5 Kanban columns and 5-10 detailed initial tasks pre-populated with priorities and types.

### 2. Workflow Column Generation
- **Endpoint**: `POST /api/ai/board/:boardId/generate-columns`
- **Function**: `generateColumns(boardName, prompt)`
- **Behavior**: Analyzes the project goal and generates an optimized Kanban stage workflow (e.g., *Backlog*, *In Review*, *QA Testing*, *Deployed*).

### 3. Task Metadata Suggestion
- **Endpoint**: `POST /api/ai/board/:boardId/suggest-meta`
- **Function**: `suggestTaskMeta(title, description)`
- **Behavior**: Analyzes raw task titles and descriptions to suggest priority levels (`Critical`, `High`, `Medium`, etc.), task category types (`Bug`, `Feature`, `Research`, etc.), relevant tags/labels, and recommended due date timelines.

### 4. Task Breakdown & Checklist Generation
- **Endpoint**: `POST /api/ai/item/:id/break-task`
- **Function**: `breakTask(title, description)`
- **Behavior**: Decomposes complex user tasks into 3 to 8 actionable, bite-sized checklist items appended directly to the task model.

### 5. Task Description Optimizer
- **Endpoint**: `POST /api/ai/item/:id/rewrite-description`
- **Function**: `rewriteDescription(title, description, instructions)`
- **Behavior**: Rewrites and polishes task documentation in Markdown format according to user instructions (e.g. *"Make it technical"*, *"Add acceptance criteria"*).

### 6. AI Board Chat Coordinator & Action Dispatcher
- **Endpoint**: `POST /api/ai/board/:boardId/chat`
- **Function**: `boardChat(boardName, columns, tasks, message)`
- **Behavior**: An interactive chatbot for project boards. The user can converse in natural language to query project status or request task updates (e.g. *"Move the authentication bug task to Done and assign to Alice"*). The AI responds with a friendly explanation and structured action objects that update MongoDB tasks automatically.

### 7. AI Workspace Assistant
- **Endpoint**: `POST /api/ai/workspace/:workspaceId/chat`
- **Function**: `workspaceChat(workspaceName, boards, tasks, message)`
- **Behavior**: Operates across all boards in a workspace to answer cross-project queries and execute global updates.

### 8. User Story to Fleshed-Out Task Generator
- **Endpoint**: `POST /api/ai/board/:boardId/column/:columnId/generate-task`
- **Function**: `generateTask(title, story, memberNames)`
- **Behavior**: Converts unstructured user stories into fully structured tasks, auto-suggesting assignees from available workspace members based on name matching.

### 9. Stateful PRD & Document-to-Board Parsing Session
- **Endpoints**:
  - `POST /api/ai/board-session/upload`
  - `POST /api/ai/board-session/:id/comment`
  - `POST /api/ai/board-session/:id/answer`
  - `POST /api/ai/board-session/:id/confirm`
  - `POST /api/ai/board-session/:id/cancel`
- **Behavior**: Multi-step interactive flow that extracts full PRD/document text, creates a stateful session in MongoDB (`BoardSession`), generates a PRD Markdown summary, asks clarifying questions, generates board previews, and confirms board creation upon user approval.

---

## 4. Multi-Format Document Parsing Engine

Document parsing for AI sessions is powered by [src/services/documentParser.js](file:///d:/Srirangan/dothething-backend/src/services/documentParser.js):

| File Extension | Parsing Technology | Functionality |
| :--- | :--- | :--- |
| `.pdf` | `pdf-parse` | Converts binary PDF streams into clean text |
| `.docx` | `mammoth` | Extracts raw text from Microsoft Word documents |
| `.xlsx`, `.xls` | `xlsx` (SheetJS) | Converts multi-sheet workbooks into structured CSV strings |
| `.txt`, `.csv`, `.md`, `.json` | Native Node `fs` | UTF-8 plain text reader |

---

## 5. Summary of AI API Routes & Permissions

| Route | Method | Required RBAC Permission | Access Control |
| :--- | :--- | :--- | :--- |
| `/api/ai/workspace/:workspaceId/generate-board` | `POST` | `board:create` | Workspace Member |
| `/api/ai/workspace/:workspaceId/chat` | `POST` | Workspace Member | Workspace Member |
| `/api/ai/board/:boardId/generate-columns` | `POST` | `board:update` | Board Member |
| `/api/ai/board/:boardId/suggest-meta` | `POST` | `task:create` | Board Member |
| `/api/ai/item/:id/break-task` | `POST` | `task:update` | Item Owner/Board Member |
| `/api/ai/item/:id/rewrite-description` | `POST` | `task:update` | Item Owner/Board Member |
| `/api/ai/board/:boardId/chat` | `POST` | `board:view` | Board Member |
| `/api/ai/board/:boardId/column/:columnId/generate-task` | `POST` | `task:create` | Board Member |
| `/api/ai/board-session/*` | `POST` | Authenticated User (`protect`) | Token Protected |
