const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROK_API_KEY = process.env.GROK_API_KEY;

/**
 * Make a chat completion request to Groq (Llama-3.3-70b) or fallback to Grok (Grok-Beta)
 */
async function getAICompletion(systemPrompt, userPrompt, responseJson = true) {
  // 1. Try Groq first
  try {
    const payload = {
      model: 'llama-3.3-70b-versatile',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.2
    };

    if (responseJson) {
      payload.response_format = { type: 'json_object' };
    }

    console.log('[AI Service] Attempting request with Groq...');
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
      throw new Error(`Groq API error (status ${response.status}): ${errorText}`);
    }

    const data = await response.json();
    return data.choices[0].message.content;

  } catch (groqError) {
    console.error('[AI Service] Groq API failed. Falling back to Grok (xAI)...', groqError.message);

    // 2. Fallback to Grok
    try {
      const payload = {
        model: 'grok-beta',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.2
      };

      if (responseJson) {
        payload.response_format = { type: 'json_object' };
      }

      console.log('[AI Service] Attempting request with Grok...');
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
        throw new Error(`Grok API error (status ${response.status}): ${errorText}`);
      }

      const data = await response.json();
      return data.choices[0].message.content;

    } catch (grokError) {
      console.error('[AI Service] Fallback to Grok also failed:', grokError.message);
      throw new Error(`AI Request failed: ${grokError.message}`);
    }
  }
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
- Create 3 to 5 columns. Ensure one column represents completed work and has "isDone": true.
- Create 5 to 10 relevant tasks. Ensure columnId values in items match one of the column ids in the columns array.
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

/**
 * Contextual chat assistant responding to questions based on board details and tasks.
 */
async function boardChat(boardName, columns, tasks, message) {
  const systemPrompt = `You are DoTheThing Assistant, an intelligent AI project coordinator.
Answer the user's message/question about their board.
You MUST respond with a single valid JSON object matching this structure EXACTLY:
{
  "reply": "Your response message formatted in Markdown."
}
Rules:
- Leverage the board context (name, columns, tasks) provided below to give realistic, helpful answers.
- Identify blockers, progress rates, or high-priority items where helpful. Keep response concise and professional.
- Respond ONLY with the JSON object. Do not include markdown wraps or extra explanations.`;

  const contextData = {
    boardName,
    columns: columns.map(c => ({ id: c.id, name: c.name })),
    tasks: tasks.map(t => ({
      title: t.title,
      columnId: t.columnId,
      priority: t.priority,
      type: t.type,
      assignee: t.assignee || 'Unassigned',
      dueDate: t.dueDate
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

module.exports = {
  generateBoard,
  generateColumns,
  suggestTaskMeta,
  breakTask,
  rewriteDescription,
  boardChat,
  generateTask
};
