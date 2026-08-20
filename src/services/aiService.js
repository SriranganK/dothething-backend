/**
 * Make a chat completion request using Groq or fallback to Grok (xAI).
 * Uses automatic model fallbacks if a specific model ID is decommissioned or unavailable.
 */
async function getAICompletion(systemPrompt, userPrompt, responseJson = true) {
  const GROQ_API_KEY = process.env.GROQ_API_KEY;
  const GROK_API_KEY = process.env.GROK_API_KEY;

  const GROQ_MODELS = Array.from(new Set([
    process.env.GROQ_MODEL,
    'openai/gpt-oss-120b',
    'openai/gpt-oss-20b',
    'groq/compound-mini',
    'groq/compound',
    'llama-3.3-70b-versatile'
  ].filter(Boolean)));

  const GROK_MODELS = Array.from(new Set([
    process.env.GROK_MODEL,
    'grok-2-latest',
    'grok-2',
    'grok-beta'
  ].filter(Boolean)));

  let lastError = null;

  // 1. Try Groq provider models
  if (GROQ_API_KEY) {
    for (const model of GROQ_MODELS) {
      try {
        const payload = {
          model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
          ],
          temperature: 0.2
        };

        if (responseJson) {
          payload.response_format = { type: 'json_object' };
        }

        console.log(`[AI Service] Attempting request with Groq (${model})...`);
        const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${GROQ_API_KEY}`
          },
          body: JSON.stringify(payload)
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`Groq API error for ${model} (status ${response.status}): ${errorText}`);
        }

        const data = await response.json();
        console.log(`[AI Service] Groq (${model}) request succeeded.`);
        return data.choices[0].message.content;
      } catch (groqError) {
        console.warn(`[AI Service] Groq model (${model}) failed: ${groqError.message}`);
        lastError = groqError;
      }
    }
  }

  // 2. Fallback to Grok (xAI) provider models
  if (GROK_API_KEY) {
    for (const model of GROK_MODELS) {
      try {
        const payload = {
          model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
          ],
          temperature: 0.2
        };

        if (responseJson) {
          payload.response_format = { type: 'json_object' };
        }

        console.log(`[AI Service] Attempting request with Grok (${model})...`);
        const response = await fetch('https://api.x.ai/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${GROK_API_KEY}`
          },
          body: JSON.stringify(payload)
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`Grok API error for ${model} (status ${response.status}): ${errorText}`);
        }

        const data = await response.json();
        console.log(`[AI Service] Grok (${model}) request succeeded.`);
        return data.choices[0].message.content;
      } catch (grokError) {
        console.warn(`[AI Service] Grok model (${model}) failed: ${grokError.message}`);
        lastError = grokError;
      }
    }
  }

  throw new Error(`AI Request failed: ${lastError ? lastError.message : 'No AI API keys configured or all providers failed'}`);
}

/**
 * Utility to parse JSON response safely, extracting it from markdown code blocks if necessary.
 */
function parseJSONResponse(rawContent) {
  try {
    return JSON.parse(rawContent.trim());
  } catch (err) {
    console.warn('[AI Service] Simple JSON parse failed, trying regex extraction...');
    // Attempt regex block extraction if the model wrapped the JSON in markdown code blocks
    const match = rawContent.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        return JSON.parse(match[0]);
      } catch (nestedErr) {
        console.error('[AI Service] Regex JSON parse also failed:', nestedErr);
      }
    }
    throw new Error('Failed to parse AI response as JSON');
  }
}

/**
 * Generates a complete board configuration (name, columns, tasks) from a text prompt.
 */
async function generateBoard(prompt) {
  const systemPrompt = `You are an expert Agile Scrum/Kanban project manager.
Create a complete board configuration (name, columns, tasks) based on the user's requirements.
You MUST respond with a single valid JSON object matching this structure EXACTLY:
{
  "boardName": "Name of the board",
  "columns": [
    { "id": "todo", "name": "To Do", "order": 0, "isDone": false },
    { "id": "progress", "name": "In Progress", "order": 1, "isDone": false },
    { "id": "review", "name": "In Review", "order": 2, "isDone": false },
    { "id": "done", "name": "Done", "order": 3, "isDone": true }
  ],
  "items": [
    {
      "title": "Task title",
      "description": "Task description in markdown.",
      "columnId": "todo",
      "type": "Task",
      "priority": "Medium"
    }
  ]
}
Rules:
- Respond ONLY with the JSON object. Do not include markdown wraps or extra explanations.
- Create 3 to 5 columns (or custom columns if requested in prompt). Ensure one final column represents completed work and has "isDone": true.
- ALL created tasks MUST have their columnId set to the ID of the VERY FIRST column (index 0 in the columns array, e.g., "todo", "backlog", or "brainstorming"). Do NOT place tasks into "In Progress", "Done", or later columns. Every new task must start in the first column so the user can work through items sequentially.
- Sort and list tasks in logical, sequential project execution order.
- Create 5 to 10 relevant tasks. Ensure columnId values in items match the ID of the first column in the columns array.
- "type" must be one of: 'Task', 'Bug', 'Lead', 'Idea', 'Issue', 'Event', 'Feature', 'Research', 'Documentation'.
- "priority" must be one of: 'Lowest', 'Low', 'Medium', 'High', 'Highest', 'Critical'.`;

  const userPrompt = `Generate a board for: ${prompt}`;
  const response = await getAICompletion(systemPrompt, userPrompt, true);
  return parseJSONResponse(response);
}

/**
 * Suggests new workflow columns for a board based on its name and user input.
 */
async function generateColumns(boardName, prompt) {
  const systemPrompt = `You are a project workflow design specialist.
Suggest a workflow of columns to organize a board.
You MUST respond with a single valid JSON object matching this structure EXACTLY:
{
  "columns": [
    { "id": "string", "name": "Column Name", "order": number, "isDone": boolean }
  ]
}
Rules:
- Suggest between 3 and 6 columns. Ensure exactly one final done column is marked as "isDone": true.
- Ensure column ids are lowercase alphanumeric.
- Respond ONLY with the JSON object. Do not include markdown wraps or extra explanations.`;

  const userPrompt = `Board Name: ${boardName}\nGoal/Request: ${prompt}`;
  const response = await getAICompletion(systemPrompt, userPrompt, true);
  return parseJSONResponse(response);
}

/**
 * Suggests task metadata (priority, type, labels, due date) based on title and description.
 */
async function suggestTaskMeta(title, description) {
  const systemPrompt = `You are a project manager assistant. Analyze the task details and suggest metadata.
You MUST respond with a single valid JSON object matching this structure EXACTLY:
{
  "priority": "Lowest | Low | Medium | High | Highest | Critical",
  "type": "Task | Bug | Lead | Idea | Issue | Event | Feature | Research | Documentation",
  "labels": ["string"],
  "daysFromNow": number
}
Rules:
- labels: suggest max 3 short, relevant labels (e.g., "Frontend", "Bug", "API", "Marketing").
- daysFromNow: suggested integer number of days until this task should be due.
- Respond ONLY with the JSON object. Do not include markdown wraps or extra explanations.`;

  const userPrompt = `Task Title: ${title}\nTask Description: ${description}`;
  const response = await getAICompletion(systemPrompt, userPrompt, true);
  return parseJSONResponse(response);
}

/**
 * Breaks a task down into actionable checklist items.
 */
async function breakTask(title, description) {
  const systemPrompt = `You are a task decomposition assistant. Break down the task into smaller, concrete, actionable subtasks.
You MUST respond with a single valid JSON object matching this structure EXACTLY:
{
  "checklist": [
    { "text": "Subtask action description" }
  ]
}
Rules:
- Generate between 3 and 8 checklist items. Keep each item concise and concrete.
- Respond ONLY with the JSON object. Do not include markdown wraps or extra explanations.`;

  const userPrompt = `Task Title: ${title}\nTask Description: ${description}`;
  const response = await getAICompletion(systemPrompt, userPrompt, true);
  return parseJSONResponse(response);
}

/**
 * Rewrites or improves a task description based on a requested tone or instructions.
 */
async function rewriteDescription(title, description, instructions) {
  const systemPrompt = `You are a technical writer and editor. Improve and rewrite the task description.
You MUST respond with a single valid JSON object matching this structure EXACTLY:
{
  "description": "Your rewritten, polished description in markdown format."
}
Rules:
- Use the task title as context to understand the task's purpose.
- Focus on clarity, structure, and readability. Use bullet points or headers if appropriate.
- Keep the core intent of the original description but improve it based on the instructions.
- Do NOT invent new requirements that aren't implied by the title or original description.
- Respond ONLY with the JSON object. Do not include markdown wraps or extra explanations.`;

  const userPrompt = `Task Title: ${title}\n\nOriginal Description:\n${description || '(empty)'}\n\nInstructions/Tone:\n${instructions}`;
  const response = await getAICompletion(systemPrompt, userPrompt, true);
  return parseJSONResponse(response);
}

async function boardChat(boardName, columns, tasks, message) {
  const systemPrompt = `You are DoTheThing Assistant, an intelligent AI project coordinator.
Answer the user's message/question about their board.
You can perform actions on tasks like changing status (moving columns), assigning tasks to team members, changing priority, adding due date, and adding/removing labels.
If the user requests you to change, assign, update, move, or modify a task, you MUST perform the action by adding it to the "actions" array in the JSON response.
You MUST respond with a single valid JSON object matching this structure EXACTLY:
{
  "reply": "Your response message formatted in Markdown.",
  "actions": [
    {
      "type": "update_task",
      "taskTitle": "The exact title of the task to search and update",
      "updates": {
        "columnId": "progress", // matching column name (like 'todo', 'in progress', 'done') or specific column id
        "assignee": "alice@example.com", // member name or email to assign, or null to unassign
        "priority": "High", // 'Lowest' | 'Low' | 'Medium' | 'High' | 'Highest' | 'Critical'
        "dueDate": "2026-08-16T00:00:00.000Z", // ISO date string or null to remove
        "labels": ["Bug", "Frontend"] // list of label names to attach
      }
    }
  ]
}
Rules:
- If the user did not request any updates or changes, set the "actions" field to an empty array [].
- Identify the tasks correctly. Match by title from the tasks list.
- Keep the markdown "reply" friendly, stating what action you are performing.
- Respond ONLY with the JSON object. Do not include markdown wraps or extra explanations.`;

  const contextData = {
    boardName,
    columns: columns.map(c => ({ id: c.id, name: c.name })),
    tasks: tasks.map(t => ({
      id: t._id,
      title: t.title,
      columnId: t.columnId,
      priority: t.priority,
      type: t.type,
      assignee: t.assignee || 'Unassigned',
      dueDate: t.dueDate,
      labels: t.labels || []
    }))
  };

  const userPrompt = `Board Context: ${JSON.stringify(contextData)}\n\nUser Question/Message: ${message}`;
  const response = await getAICompletion(systemPrompt, userPrompt, true);
  return parseJSONResponse(response);
}

/**
 * Generates a task configuration from a title and a long story prompt.
 */
async function generateTask(title, story, memberNames) {
  const systemPrompt = `You are a product owner assistant. Translate a user's ticket story/description into a structured task.
You MUST respond with a single valid JSON object matching this structure EXACTLY:
{
  "title": "Refined task title (use the input title or improve it)",
  "description": "Fleshed-out detailed description in markdown",
  "priority": "Lowest | Low | Medium | High | Highest | Critical",
  "type": "Task | Bug | Lead | Idea | Issue | Event | Feature | Research | Documentation",
  "checklist": [
    { "text": "Concrete subtask item" }
  ],
  "assigneeName": "Suggested name to assign to (from the story) or leave empty",
  "daysFromNow": number
}
Rules:
- Analyze the story for timelines (due date), assignees (names/roles), and requirements.
- Match suggested assignees against this list of available workspace member names: ${JSON.stringify(memberNames)}. If a name from the story matches a member name, return it in "assigneeName". Otherwise, leave it empty.
- Respond ONLY with the JSON object. Do not include markdown wraps or extra explanations.`;

  const userPrompt = `Input Title: ${title}\nTicket Story/Requirements:\n${story}`;
  const response = await getAICompletion(systemPrompt, userPrompt, true);
  return parseJSONResponse(response);
}

/**
 * Analyzes a requirements document and returns a high-level project plan summary.
 */
async function analyzeDocumentForNewBoard(documentText) {
  const systemPrompt = `You are an expert project manager. Analyze the uploaded project requirements document.
Extract the following information and output it in the exact JSON format:
{
  "projectName": "Extracted project name (or a descriptive name based on the document if missing)",
  "description": "High-level goal and description of the product or feature",
  "features": ["Feature 1 / Epic 1", "Feature 2 / Epic 2"],
  "teamMembers": [
    { "name": "Name of developer/team member mentioned", "role": "Their role (e.g. Frontend Developer, Backend Developer, QA, Designer) or empty if not clear" }
  ],
  "potentialTasks": [
    { "title": "Task title/step", "description": "Concisely explain what this task accomplishes and what the steps are." }
  ],
  "prdMarkdown": "Detailed, professional Markdown-formatted PRD containing: Problem Statement, Goals & Non-goals, Target Users & Personas, Key User Stories (formatted as list/table), Functional Requirements (with checkmarks), Privacy & Security, Technical Architecture, Success Metrics, and Roadmap & Milestones. Keep this complete, structured, and organized, without truncation. Use clean Markdown syntax.",
  "initialQuestions": ["1 or 2 critical follow-up questions if details are missing, ambiguous, or if there is no clear owner for a task. Keep them concise."]
}
Rules:
- Respond with a single valid JSON object. Do not wrap in markdown block, code block, or include extra text.
- If no team members are detected, return empty array.
- If everything is perfectly clear and no questions are needed, return empty array for initialQuestions.`;

  const userPrompt = `Document Content:\n\n${documentText.slice(0, 50000)}`;
  const response = await getAICompletion(systemPrompt, userPrompt, true);
  return parseJSONResponse(response);
}

/**
 * Analyzes a requirements document and compares it to an existing board's tasks.
 */
async function analyzeDocumentForExistingBoard(documentText, existingTasks) {
  const systemPrompt = `You are an expert project manager. You are updating an existing project board.
We have an uploaded requirements document and a list of existing tasks on the board.
Analyze the document and compare it to the existing tasks to find:
1. New tasks that need to be created.
2. Existing tasks that need updates (e.g. details, assignee, priority change).
3. Potential duplicates (tasks in the document that already exist on the board, so they should be ignored).
Output in the exact JSON format:
{
  "projectName": "Name of the board",
  "newTasks": ["Brief description of new task to be added"],
  "updates": ["Describe the change needed to existing task, e.g. 'Task X should be assigned to Sarah instead of John'"],
  "duplicates": ["Identify duplicate, e.g. 'Implement login is already present on the board'"],
  "prdMarkdown": "Detailed, professional Markdown-formatted PRD log containing: Problem Statement, Goals & Non-goals, Target Users & Personas, Key User Stories (formatted as list/table), Functional Requirements (with checkmarks), Privacy & Security, Technical Architecture, Success Metrics, and Roadmap & Milestones. Keep this complete, structured, and organized, without truncation. Use clean Markdown syntax.",
  "initialQuestions": ["1 or 2 critical follow-up questions to resolve conflicting or ambiguous requirements. Keep them concise."]
}
Rules:
- Respond with a single valid JSON object. Do not wrap in markdown block or code block.
- Existing tasks on the board are: ${JSON.stringify(existingTasks.map(t => ({ id: t._id, title: t.title, assignee: t.assignee, priority: t.priority, status: t.columnId })))}`;

  const userPrompt = `Document Content:\n\n${documentText.slice(0, 50000)}`;
  const response = await getAICompletion(systemPrompt, userPrompt, true);
  return parseJSONResponse(response);
}

/**
 * Generates the final board configuration and task preview list.
 */
async function generateBoardPreview(documentText, comments, questionsAnswers, existingBoardContext = null) {
  const systemPrompt = `You are an expert Scrum Master / Project Manager.
Create a complete board and task preview based on:
1. The original document text.
2. The discussion context (user comments and questions/answers).
3. The existing board tasks and columns (if we are updating an existing board).

You MUST output a single valid JSON object matching this structure EXACTLY:
{
  "boardName": "Name of the board",
  "description": "Description of the board",
  "columns": [
    { "id": "todo", "name": "To Do", "order": 0, "isDone": false },
    { "id": "progress", "name": "In Progress", "order": 1, "isDone": false },
    { "id": "done", "name": "Done", "order": 2, "isDone": true }
  ],
  "tasks": [
    {
      "title": "Task title",
      "description": "Fleshed-out detailed task description in markdown.",
      "columnId": "todo",
      "type": "Task",
      "priority": "Medium",
      "assignee": "Suggested developer name (e.g., Sarah, John) or leave empty if not clear",
      "source": "Specific section in the original document this task traces to (e.g., 'PRD Section 3.2')",
      "isNew": true,
      "existingTaskId": "If this is an update to an existing task, specify its _id, otherwise leave empty"
    }
  ],
  "nextQuestion": "If you still find a critical requirement ambiguous, ask ONE clear question. Otherwise, leave empty if preview is complete."
}
Rules:
- Columns: Create 3 to 5 logical columns. If updating an existing board, reuse the existing board columns: ${existingBoardContext ? JSON.stringify(existingBoardContext.columns) : '[]'}.
- Tasks: Create highly actionable tasks. For existing board, flag updates to existing tasks with isNew=false and specify the existingTaskId.
- 'type' must be: 'Task' | 'Bug' | 'Lead' | 'Idea' | 'Issue' | 'Event' | 'Feature' | 'Research' | 'Documentation'.
- 'priority' must be: 'Lowest' | 'Low' | 'Medium' | 'High' | 'Highest' | 'Critical'.
- 'assignee': Must map to one of the available workspace member names: ${existingBoardContext ? JSON.stringify(existingBoardContext.memberNames) : '[]'}. If not a direct match, try matching by first name, or leave empty if there's no clear member.
- Trace every task back to the source document section in 'source' (e.g. 'PRD Section 1.1').
- Respond ONLY with the JSON object. Do not wrap in markdown.`;

  const discussionStr = `Conversation history:\n${comments.map(c => `${c.role}: ${c.text}`).join('\n')}\n\nQuestions & Answers:\n${questionsAnswers.map(q => `Q: ${q.questionText}\nA: ${q.answerText}`).join('\n')}`;

  const userPrompt = `Document Content:\n\n${documentText.slice(0, 50000)}\n\n${discussionStr}`;
  const response = await getAICompletion(systemPrompt, userPrompt, true);
  return parseJSONResponse(response);
}

async function workspaceChat(workspaceName, boards, tasks, message) {
  const systemPrompt = `You are DoTheThing Assistant, an intelligent AI workspace coordinator.
Answer the user's message/question about their workspace dashboard, projects, and tasks.
You can perform actions on tasks like changing status (moving columns), assigning tasks to team members, changing priority, adding due date, and adding/removing labels.
If the user requests you to change, assign, update, move, or modify a task, you MUST perform the action by adding it to the "actions" array in the JSON response.
You MUST respond with a single valid JSON object matching this structure EXACTLY:
{
  "reply": "Your response message formatted in Markdown.",
  "actions": [
    {
      "type": "update_task",
      "taskTitle": "The exact title of the task to search and update",
      "updates": {
        "columnId": "progress", // matching column name (like 'todo', 'in progress', 'done') or specific column id
        "assignee": "alice@example.com", // member name or email to assign, or null to unassign
        "priority": "High", // 'Lowest' | 'Low' | 'Medium' | 'High' | 'Highest' | 'Critical'
        "dueDate": "2026-08-16T00:00:00.000Z", // ISO date string or null to remove
        "labels": ["Bug", "Frontend"] // list of label names to attach
      }
    }
  ]
}
Rules:
- If the user did not request any updates or changes, set the "actions" field to an empty array [].
- Identify the tasks correctly. Match by title from the tasks list.
- Keep the markdown "reply" friendly, stating what action you are performing.
- Respond ONLY with the JSON object. Do not include markdown wraps or extra explanations.`;

  const contextData = {
    workspaceName,
    boards: boards.map(b => ({ id: b._id, name: b.name })),
    tasks: tasks.map(t => ({
      id: t._id,
      title: t.title,
      boardId: t.board,
      columnId: t.columnId,
      priority: t.priority,
      type: t.type,
      assignee: t.assignee || 'Unassigned',
      dueDate: t.dueDate,
      labels: t.labels || []
    }))
  };

  const userPrompt = `Workspace Context: ${JSON.stringify(contextData)}\n\nUser Question/Message: ${message}`;
  const response = await getAICompletion(systemPrompt, userPrompt, true);
  return parseJSONResponse(response);
}

module.exports = {
  generateBoard,
  generateColumns,
  suggestTaskMeta,
  breakTask,
  rewriteDescription,
  boardChat,
  workspaceChat,
  generateTask,
  analyzeDocumentForNewBoard,
  analyzeDocumentForExistingBoard,
  generateBoardPreview
};
